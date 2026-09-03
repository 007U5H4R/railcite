import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { resolveQueryDomain, classifyQueryDomain } from '../../lib/classifyQueryDomain';

// Fake Anthropic client whose messages.create returns a forced set_domain tool call.
function fakeClient(toolInput: unknown | 'no_tool' | 'throw'): Anthropic {
  return {
    messages: {
      create: vi.fn(async () => {
        if (toolInput === 'throw') throw new Error('api down');
        const content = toolInput === 'no_tool'
          ? [{ type: 'text', text: 'hi' }]
          : [{ type: 'tool_use', name: 'set_domain', input: toolInput }];
        return { content };
      }),
    },
  } as unknown as Anthropic;
}

describe('resolveQueryDomain (pure, fail-open)', () => {
  it('maps a clean goods/coaching input through', () => {
    expect(resolveQueryDomain({ domain: 'goods' })).toBe('goods');
    expect(resolveQueryDomain({ domain: 'coaching' })).toBe('coaching');
  });
  it.each([{ domain: 'unclear' }, { domain: 'freight' }, {}, null, undefined, 'goods', { domain: 5 }])(
    'anything not exactly goods|coaching -> null: %j', input => {
      expect(resolveQueryDomain(input)).toBeNull();
    });
});

describe('classifyQueryDomain (never throws)', () => {
  it('returns the model-chosen domain', async () => {
    expect(await classifyQueryDomain('Vikalp scheme', fakeClient({ domain: 'coaching' }))).toBe('coaching');
    expect(await classifyQueryDomain('demurrage waiver', fakeClient({ domain: 'goods' }))).toBe('goods');
  });
  it('fails open to null on "unclear"', async () => {
    expect(await classifyQueryDomain('what is the rule', fakeClient({ domain: 'unclear' }))).toBeNull();
  });
  it('fails open to null when the model returns no tool call', async () => {
    expect(await classifyQueryDomain('x', fakeClient('no_tool'))).toBeNull();
  });
  it('fails open to null when the API throws', async () => {
    expect(await classifyQueryDomain('x', fakeClient('throw'))).toBeNull();
  });
});
