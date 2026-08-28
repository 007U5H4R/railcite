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
  z.object({ status: z.literal('answered'), blocks: z.array(Block).min(1), note: z.array(Block) }),
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

export async function synthesize(caseText: string, sources: PromptSource[]): Promise<SynthesisResult> {
  const client = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  const msg = await client.messages.create({
    model: 'claude-sonnet-5', max_tokens: 2000, temperature: 0,
    system: SYSTEM_PROMPT,
    tools: [TOOL], tool_choice: { type: 'tool', name: 'record_conclusion' },
    messages: [{ role: 'user', content: buildUserPrompt(caseText, sources) }],
  });
  const tu = msg.content.find(b => b.type === 'tool_use' && b.name === 'record_conclusion');
  if (!tu || tu.type !== 'tool_use') throw new Error('no record_conclusion tool call in response');
  const parsed = ToolInput.parse(tu.input);
  return parsed.status === 'refused'
    ? { status: 'refused' }
    : { status: 'answered', blocks: parsed.blocks, note: parsed.note ?? [] };
}
