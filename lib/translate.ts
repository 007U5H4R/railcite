import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { requireEnv } from './env';

// Translation layer for the Hindi toggle. This NEVER sees or emits citations — it takes an
// array of already-validated English prose strings and returns the same number of Hindi
// strings, index-aligned. Callers reattach the (unchanged) English citation numbers by index,
// so a translation can never fabricate, drop, or move a citation. A count mismatch is a hard
// error, not a best-effort merge — misaligning Hindi text onto the wrong citations would break
// the product's whole trust guarantee.

export const TRANSLATE_SYSTEM_PROMPT = `You translate Indian Railways commercial text from
English to formal Hindi for a Chief Commercial Inspector. Register: official Government of India
राजभाषा (Rajbhasha) note-drafting Hindi — precise, respectful, administrative; NOT colloquial.
Hard rules:
1. Translate ONLY the prose meaning. Return EXACTLY one Hindi string for each input string, in the
   same order. Never merge, split, add, or drop items.
2. Keep VERBATIM, untranslated, inside the Hindi text: inline citation markers like [1] or [1][3];
   circular / corrigendum numbers; paragraph and page numbers; dates; and monetary figures
   (₹, Rs., GTKM, per-tonne rates). Do not localize digits — keep Latin numerals.
3. Do not add commentary, legal conclusions, or facts not present in the source string.
Output via the record_translation tool only.`;

const ToolInput = z.object({ items: z.array(z.string()) });

const TOOL = {
  name: 'record_translation',
  description: 'Return the Hindi translations, one per input item, in order.',
  input_schema: {
    type: 'object' as const,
    properties: { items: { type: 'array', items: { type: 'string' } } },
    required: ['items'],
  },
};

export async function translate(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];   // no work — never spend a model call
  const client = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  const numbered = texts.map((t, i) => `[[${i + 1}]] ${t}`).join('\n\n');
  const msg = await client.messages.create({
    // claude-sonnet-5 family removed sampling params — sending temperature 400s. Do not add it.
    model: 'claude-sonnet-5', max_tokens: 3000,
    system: TRANSLATE_SYSTEM_PROMPT,
    tools: [TOOL], tool_choice: { type: 'tool', name: 'record_translation' },
    messages: [{ role: 'user', content:
      `Translate each of the following ${texts.length} items to Hindi. Return exactly ${texts.length} items in order.\n\n${numbered}` }],
  });
  const tu = msg.content.find(b => b.type === 'tool_use' && b.name === 'record_translation');
  if (!tu || tu.type !== 'tool_use') throw new Error('no record_translation tool call in response');
  const { items } = ToolInput.parse(tu.input);
  if (items.length !== texts.length) {
    throw new Error(`translation count mismatch: asked ${texts.length}, got ${items.length}`);
  }
  return items;
}
