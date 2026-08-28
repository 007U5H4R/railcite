import { vi } from 'vitest';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create } } }));
import { synthesize, buildUserPrompt } from '@/lib/synthesize';

const SOURCES = [{ n: 1, header: 'TCR/1078/2019 · 12.03.2019 · circular', text: 'Free time for unloading is …' }];
const toolUse = (input: unknown) => ({ content: [{ type: 'tool_use', name: 'record_conclusion', input }] });

beforeEach(() => { process.env.ANTHROPIC_API_KEY = 'k'; create.mockReset(); });

it('parses an answered tool call', async () => {
  create.mockResolvedValue(toolUse({ status: 'answered',
    blocks: [{ text: 'Free time is x [1].', citations: [1] }], note: [{ text: 'Sub: …', citations: [1] }] }));
  const r = await synthesize('case', SOURCES);
  expect(r).toEqual({ status: 'answered',
    blocks: [{ text: 'Free time is x [1].', citations: [1] }], note: [{ text: 'Sub: …', citations: [1] }] });
  const req = create.mock.calls[0][0];
  expect(req.model).toBe('claude-sonnet-5');
  expect(req.tool_choice).toEqual({ type: 'tool', name: 'record_conclusion' });
  expect(req.temperature).toBe(0);
});
it('parses refusal', async () => {
  create.mockResolvedValue(toolUse({ status: 'refused' }));
  expect(await synthesize('case', SOURCES)).toEqual({ status: 'refused' });
});
it('malformed tool input → throws (never silently answers)', async () => {
  create.mockResolvedValue(toolUse({ status: 'answered', blocks: 'nope' }));
  await expect(synthesize('case', SOURCES)).rejects.toThrow();
});
it('prompt numbers every source and forbids outside knowledge', () => {
  const p = buildUserPrompt('my case', SOURCES);
  expect(p).toContain('[1] TCR/1078/2019');
  expect(p).toContain('my case');
});
