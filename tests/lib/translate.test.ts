import { vi } from 'vitest';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create } } }));
import { translate } from '@/lib/translate';

const toolUse = (input: unknown) => ({ content: [{ type: 'tool_use', name: 'record_translation', input }] });

beforeEach(() => { process.env.ANTHROPIC_API_KEY = 'k'; create.mockReset(); });

it('returns Hindi strings index-aligned 1:1 with the input', async () => {
  create.mockResolvedValue(toolUse({ items: ['हिंदी एक', 'हिंदी दो'] }));
  const out = await translate(['English one', 'English two']);
  expect(out).toEqual(['हिंदी एक', 'हिंदी दो']);
});

it('throws when the model returns a different number of items (never misalign a citation)', async () => {
  create.mockResolvedValue(toolUse({ items: ['only one'] }));
  await expect(translate(['a', 'b', 'c'])).rejects.toThrow(/count|length|align/i);
});

it('empty input short-circuits — no model call, no cost', async () => {
  const out = await translate([]);
  expect(out).toEqual([]);
  expect(create).not.toHaveBeenCalled();
});

it('calls the model with the record_translation tool and no sampling params', async () => {
  create.mockResolvedValue(toolUse({ items: ['x'] }));
  await translate(['x']);
  const req = create.mock.calls[0][0];
  expect(req.tool_choice).toEqual({ type: 'tool', name: 'record_translation' });
  expect(req.temperature).toBeUndefined();  // claude-sonnet-5 rejects sampling params
});

it('malformed tool input throws (never silently returns English)', async () => {
  create.mockResolvedValue(toolUse({ items: 'nope' }));
  await expect(translate(['x'])).rejects.toThrow();
});

it('throws a clear error when the model truncates at max_tokens', async () => {
  // Regression: max_tokens was 3000 — below the Hindi rendering of a rich answer (the same
  // content's English synthesis needs 4096) — so the biggest answers failed deterministically
  // with an opaque parse/count error. Truncation must now be loud and self-describing.
  create.mockResolvedValue({ stop_reason: 'max_tokens', content: [] });
  await expect(translate(['a'])).rejects.toThrow(/truncated at max_tokens/);
});
