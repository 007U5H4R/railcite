import { z } from 'zod';
import type { SynthesisResult } from './types';
import { callTool, type ToolSpec } from './llm';

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

const TOOL: ToolSpec = {
  name: 'record_conclusion',
  description: 'Record the cited conclusion (or refusal) for the case.',
  input_schema: {
    type: 'object',
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

async function recordConclusionOnce(caseText: string, sources: PromptSource[]) {
  const { input, truncated } = await callTool({ tier: 'smart', system: SYSTEM_PROMPT, tool: TOOL,
    maxTokens: MAX_TOKENS, user: buildUserPrompt(caseText, sources) });
  // Truncation is THE recurring failure as the corpus grows (it already forced 2000→4096), and a
  // cut that lands after `blocks` but before `note` still parses — silently shipping an answer
  // with no justification note. Detect it explicitly so it retries and is visible in logs.
  if (truncated) throw new Error('synthesis truncated at max_tokens');
  if (input === undefined) throw new Error('no record_conclusion tool call in response');
  const parsed = ToolInput.parse(input);   // throws (ZodError) on a truncated/malformed tool call
  if (parsed.status === 'answered' && !parsed.note) {
    // Not fatal (the answer itself is valid and cited), but the SYSTEM_PROMPT mandates a note on
    // every answered result — so this is a real signal, not a normal outcome. Never silent.
    console.warn('synthesize: answered result had no note (drafted note will be empty)');
  }
  return parsed;
}

export async function synthesize(caseText: string, sources: PromptSource[]): Promise<SynthesisResult> {
  // Fail-safe: a truncated/malformed tool call is typically transient (observed live — the same
  // query failed then succeeded on manual retry). Retry ONCE before surfacing the error, so a
  // single bad generation doesn't fail the user's query. Bounded to 2 attempts — never a loop —
  // and we still only ever accept a well-formed tool result, so this never fabricates.
  let parsed;
  try {
    parsed = await recordConclusionOnce(caseText, sources);
  } catch (first) {
    // Log the FIRST error before retrying: swallowing it makes a truncation pattern
    // indistinguishable from a rate-limit or auth failure in production logs — which is exactly
    // how the previous max_tokens ceiling had to be diagnosed from scratch.
    console.warn('synthesize attempt 1 failed, retrying once:', first);
    parsed = await recordConclusionOnce(caseText, sources);
  }
  return parsed.status === 'refused'
    ? { status: 'refused' }
    : { status: 'answered', blocks: parsed.blocks, note: parsed.note ?? [] };
}
