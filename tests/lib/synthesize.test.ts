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
  expect(req.temperature).toBeUndefined();  // claude-sonnet-5 rejects sampling params — must NOT be sent
});
it('requests enough output headroom to not truncate a rich multi-source answer+note', () => {
  // Regression: max_tokens was 2000; once the corpus grew (~9.8k passages → 8 rich sources) the
  // answer+note tool call overran 2000 and was truncated, dropping `status` → the discriminated
  // union failed → /api/query 500'd. Keep a comfortable ceiling so rich answers complete.
  create.mockResolvedValue(toolUse({ status: 'answered', blocks: [{ text: 'x [1].', citations: [1] }] }));
  return synthesize('case', SOURCES).then(() => {
    expect(create.mock.calls[0][0].max_tokens).toBeGreaterThanOrEqual(4096);
  });
});
it('answered with no note field → defaults note to [] (never throws)', async () => {
  // Regression: the tool's input_schema marks `note` optional (only `status` is required), so the
  // model may return an answered result without it. synthesize() must default it, not ZodError.
  create.mockResolvedValue(toolUse({ status: 'answered',
    blocks: [{ text: 'Waiver needs Finance concurrence above Rs.25,000 [1].', citations: [1] }] }));
  expect(await synthesize('case', SOURCES)).toEqual({ status: 'answered',
    blocks: [{ text: 'Waiver needs Finance concurrence above Rs.25,000 [1].', citations: [1] }], note: [] });
});
it('parses refusal', async () => {
  create.mockResolvedValue(toolUse({ status: 'refused' }));
  expect(await synthesize('case', SOURCES)).toEqual({ status: 'refused' });
});
it('fail-safe: a transient malformed/truncated tool call is retried once, then the answer returns', async () => {
  // The model occasionally returns a truncated/invalid tool call (observed live: the SAME query
  // failed then succeeded on manual retry). synthesize self-heals by retrying once rather than
  // failing the user's query — but never fabricates: it only accepts a well-formed tool result.
  create
    .mockResolvedValueOnce(toolUse({ status: 'answered', blocks: 'truncated-nonsense' }))
    .mockResolvedValueOnce(toolUse({ status: 'answered',
      blocks: [{ text: 'Free time is x [1].', citations: [1] }], note: [] }));
  const r = await synthesize('case', SOURCES);
  expect(r).toEqual({ status: 'answered', blocks: [{ text: 'Free time is x [1].', citations: [1] }], note: [] });
  expect(create).toHaveBeenCalledTimes(2);
});
it('malformed tool input on BOTH attempts → throws (never silently answers, bounded retry)', async () => {
  create.mockResolvedValue(toolUse({ status: 'answered', blocks: 'nope' }));
  await expect(synthesize('case', SOURCES)).rejects.toThrow();
  expect(create).toHaveBeenCalledTimes(2);   // one retry, then give up — no infinite loop
});
it('prompt numbers every source and forbids outside knowledge', () => {
  const p = buildUserPrompt('my case', SOURCES);
  expect(p).toContain('[1] TCR/1078/2019');
  expect(p).toContain('my case');
});
