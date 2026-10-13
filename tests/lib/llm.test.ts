import { vi } from 'vitest';

const { generateContent, FakeApiError } = vi.hoisted(() => ({
  generateContent: vi.fn(),
  FakeApiError: class extends Error { status: number; constructor(o: { message: string; status: number }) { super(o.message); this.status = o.status; } },
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent } },
  ApiError: FakeApiError,
}));
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { status: number; constructor(status: number) { super('api'); this.status = status; } }
  return { default: Object.assign(class { messages = { create } }, { APIError }) };
});
import Anthropic from '@anthropic-ai/sdk';
import { callTool, LlmUnavailableError } from '@/lib/llm';

const TOOL = { name: 'set_x', description: 'd',
  input_schema: { type: 'object' as const, properties: { x: { type: 'string' } }, required: ['x'] } };
const call = (tier: 'smart' | 'fast' = 'smart') =>
  callTool({ tier, system: 'SYS', user: 'USER', tool: TOOL, maxTokens: 100 });

const AnthropicAPIError = (Anthropic as unknown as { APIError: new (s: number) => Error }).APIError;
const toolUse = (input: unknown) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'set_x', input }] });
const geminiOk = (text: string, finishReason = 'STOP') => ({ text, candidates: [{ finishReason }] });

beforeEach(() => {
  generateContent.mockReset(); create.mockReset();
  process.env.GEMINI_API_KEY = 'g'; process.env.ANTHROPIC_API_KEY = 'a';
});

describe('primary: anthropic (unchanged behaviour)', () => {
  it('forces the tool call and returns its input — gemini never called', async () => {
    create.mockResolvedValue(toolUse({ x: 'a' }));
    expect(await call()).toEqual({ input: { x: 'a' }, truncated: false });
    const req = create.mock.calls[0][0];
    expect(req.model).toBe('claude-sonnet-5');
    expect(req.tool_choice).toEqual({ type: 'tool', name: 'set_x' });
    expect(req.temperature).toBeUndefined();  // claude-sonnet-5 rejects sampling params
    expect(generateContent).not.toHaveBeenCalled();
  });
  it('fast tier uses haiku', async () => {
    create.mockResolvedValue(toolUse({ x: 'a' }));
    await call('fast');
    expect(create.mock.calls[0][0].model).toBe('claude-haiku-4-5-20251001');
  });
  it('a malformed/truncated anthropic reply is NOT a provider failure — no fallback', async () => {
    create.mockResolvedValue({ stop_reason: 'max_tokens', content: [] });
    expect(await call()).toEqual({ input: undefined, truncated: true });
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe('backup: gemini, only when anthropic itself fails', () => {
  it('anthropic 401 (dead key — the 2026-10-13 outage) → gemini answers, with the tool schema as JSON output', async () => {
    create.mockRejectedValue(new AnthropicAPIError(401));
    generateContent.mockResolvedValue(geminiOk('{"x":"hi"}'));
    expect(await call()).toEqual({ input: { x: 'hi' }, truncated: false });
    const req = generateContent.mock.calls[0][0];
    expect(req.model).toBe('gemini-3.8-flash');
    expect(req.contents).toBe('USER');
    expect(req.config.systemInstruction).toBe('SYS');
    expect(req.config.responseMimeType).toBe('application/json');
    expect(req.config.responseJsonSchema).toEqual(TOOL.input_schema);
  });
  it('fast tier falls back to the lite model', async () => {
    create.mockRejectedValue(new AnthropicAPIError(529));
    generateContent.mockResolvedValue(geminiOk('{"x":"y"}'));
    await call('fast');
    expect(generateContent.mock.calls[0][0].model).toBe('gemini-3.5-flash-lite');
  });
  it('no GEMINI_API_KEY → no fallback; the anthropic error surfaces as LlmUnavailableError', async () => {
    delete process.env.GEMINI_API_KEY;
    create.mockRejectedValue(new AnthropicAPIError(401));
    const e = await call().catch(x => x);
    expect(e).toBeInstanceOf(LlmUnavailableError);
    expect(e.provider).toBe('anthropic');
    expect(e.status).toBe(401);
    expect(generateContent).not.toHaveBeenCalled();
  });
  it('a non-API error (bug, network code path) is rethrown, not masked by the backup', async () => {
    create.mockRejectedValue(new TypeError('boom'));
    await expect(call()).rejects.toThrow('boom');
    expect(generateContent).not.toHaveBeenCalled();
  });
  it('both providers down → LlmUnavailableError from gemini (route maps it to 503)', async () => {
    create.mockRejectedValue(new AnthropicAPIError(401));
    generateContent.mockRejectedValue(new FakeApiError({ message: 'quota', status: 429 }));
    const e = await call().catch(x => x);
    expect(e).toBeInstanceOf(LlmUnavailableError);
    expect(e.provider).toBe('gemini');
    expect(e.status).toBe(429);
  });
  it('gemini MAX_TOKENS is flagged truncated; malformed JSON → input undefined (never a throw)', async () => {
    create.mockRejectedValue(new AnthropicAPIError(500));
    generateContent.mockResolvedValueOnce(geminiOk('{"x":', 'MAX_TOKENS')).mockResolvedValueOnce(geminiOk('not json'));
    expect((await call()).truncated).toBe(true);
    expect(await call()).toEqual({ input: undefined, truncated: false });
  });
});
