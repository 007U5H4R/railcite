import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { SynthesisResult } from './types';
import { requireEnv } from './env';

export interface PromptSource { n: number; header: string; text: string }

export const SYSTEM_PROMPT = `You are RailCite, an extractive research assistant for an Indian
Railways Chief Commercial Inspector. You answer ONLY from the numbered source passages provided.
Hard rules:
1. EXTRACTIVE ONLY. Every substantive sentence must be grounded in the sources and cite them by
   number, e.g. [1] or [1][3]. Do not use outside knowledge. Do not infer beyond the text.
2. If no provided passage actually governs the case, you MUST refuse (status "refused"). Refusing
   is a correct, expected outcome. Never stretch a loosely related passage to fit.
3. Never claim finality. Never invent circular numbers, dates, or provisions.
4. Prefer governing circulars over manuals when both cover the point.
Output via the record_conclusion tool only.
When answering, also draft a formal justification note in Indian official-note register:
short numbered paragraphs; open with "Sub:" and "Ref:" lines (Ref lists the cited circular
numbers); every substantive paragraph cites sources; close with "Submitted for consideration."
The note must contain no facts absent from the conclusion blocks.`;

export function buildUserPrompt(caseText: string, sources: PromptSource[]): string {
  const src = sources.map(s => `[${s.n}] ${s.header}\n${s.text}`).join('\n\n---\n\n');
  return `CASE:\n${caseText}\n\nSOURCE PASSAGES:\n${src}`;
}

const Block = z.object({ text: z.string().min(1), citations: z.array(z.number().int()) });
const ToolInput = z.discriminatedUnion('status', [
  // `note` is optional in the tool's input_schema (only `status` is required), so the model may
  // omit it on an answered result; keep Zod in lockstep and let synthesize() default it to [].
  z.object({ status: z.literal('answered'), blocks: z.array(Block).min(1), note: z.array(Block).optional() }),
  z.object({ status: z.literal('refused') }),
]);

const TOOL = {
  name: 'record_conclusion',
  description: 'Record the cited conclusion (or refusal) for the case.',
  input_schema: {
    type: 'object' as const,
    properties: {
      status: { type: 'string', enum: ['answered', 'refused'] },
      blocks: { type: 'array', items: { type: 'object', properties: {
        text: { type: 'string' }, citations: { type: 'array', items: { type: 'integer' } } },
        required: ['text', 'citations'] } },
      note: { type: 'array', items: { type: 'object', properties: {
        text: { type: 'string' }, citations: { type: 'array', items: { type: 'integer' } } },
        required: ['text', 'citations'] } },
    },
    required: ['status'],
  },
};

// Rich multi-source answers (the corpus grew to ~10k passages → up to 8 cited sources plus a
// formal note) overran the old 2000-token ceiling and were TRUNCATED mid-tool-call, dropping
// `status` so the discriminated union failed and /api/query 500'd. 4096 gives comfortable
// headroom; the model only emits what it needs, so normal answers cost no more.
const MAX_TOKENS = 4096;

async function recordConclusionOnce(client: Anthropic, caseText: string, sources: PromptSource[]) {
  const msg = await client.messages.create({
    // NOTE: claude-sonnet-5 (and the 4.7/4.8/5 family) removed sampling params —
    // sending `temperature` returns 400 invalid_request_error. Do not re-add it.
    model: 'claude-sonnet-5', max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [TOOL], tool_choice: { type: 'tool', name: 'record_conclusion' },
    messages: [{ role: 'user', content: buildUserPrompt(caseText, sources) }],
  });
  const tu = msg.content.find(b => b.type === 'tool_use' && b.name === 'record_conclusion');
  if (!tu || tu.type !== 'tool_use') throw new Error('no record_conclusion tool call in response');
  return ToolInput.parse(tu.input);   // throws (ZodError) on a truncated/malformed tool call
}

export async function synthesize(caseText: string, sources: PromptSource[]): Promise<SynthesisResult> {
  const client = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  // Fail-safe: a truncated/malformed tool call is typically transient (observed live — the same
  // query failed then succeeded on manual retry). Retry ONCE before surfacing the error, so a
  // single bad generation doesn't fail the user's query. Bounded to 2 attempts — never a loop —
  // and we still only ever accept a well-formed tool result, so this never fabricates.
  let parsed;
  try {
    parsed = await recordConclusionOnce(client, caseText, sources);
  } catch {
    parsed = await recordConclusionOnce(client, caseText, sources);
  }
  return parsed.status === 'refused'
    ? { status: 'refused' }
    : { status: 'answered', blocks: parsed.blocks, note: parsed.note ?? [] };
}
