import { vi } from 'vitest';
vi.mock('@/lib/auth', () => ({ getUserFromRequest: vi.fn(async () => ({ id: 'u1' })) }));
vi.mock('@/lib/translate', () => ({ translate: vi.fn() }));

import { POST } from '@/app/api/translate/route';
import { translate } from '@/lib/translate';
import { getUserFromRequest } from '@/lib/auth';
import type { ConclusionBlock } from '@/lib/types';

const req = (body: unknown) => new Request('http://x/api/translate',
  { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const BLOCKS: ConclusionBlock[] = [
  { text: 'UNCITED defensive block', citations: [] },
  { text: 'Free time is 9 hours [1].', citations: [1] },
];
const NOTE: ConclusionBlock[] = [
  { text: 'Sub: Demurrage on detained wagons.', citations: [] },
  { text: 'Ref: whatever the model wrote.', citations: [] },
  { text: 'Per para 2511 the free time applies [1].', citations: [1] },
  { text: 'Submitted for consideration.', citations: [] },
];

beforeEach(() => { vi.mocked(translate).mockReset(); vi.mocked(getUserFromRequest).mockResolvedValue({ id: 'u1' } as any); });

it('401 when unauthenticated', async () => {
  vi.mocked(getUserFromRequest).mockResolvedValueOnce(null);
  expect((await POST(req({ blocks: BLOCKS, note: NOTE, target: 'hi' }))).status).toBe(401);
});

it('400 on a malformed body', async () => {
  expect((await POST(req({ note: NOTE }))).status).toBe(400);
});

it('sends ONLY cited prose to translate and returns block Hindi raw-index-aligned', async () => {
  // translate is called with: [cited block text, note subject value, cited note point]
  vi.mocked(translate).mockResolvedValue(['हिंदी ब्लॉक', 'हिंदी विषय', 'हिंदी बिंदु']);
  const res = await POST(req({ blocks: BLOCKS, note: NOTE, target: 'hi' }));
  const j = await res.json();

  const sent = vi.mocked(translate).mock.calls[0][0];
  expect(sent).toEqual(['Free time is 9 hours [1].', 'Demurrage on detained wagons.', 'Per para 2511 the free time applies [1].']);
  expect(sent).not.toContain('UNCITED defensive block');   // never translate what never renders
  expect(sent).not.toContain('Submitted for consideration.');

  // raw-aligned: index 0 (uncited) is '', index 1 (cited) is the Hindi
  expect(j.blocks).toEqual(['', 'हिंदी ब्लॉक']);
  expect(j.noteSub).toBe('हिंदी विषय');
  expect(j.noteContent).toEqual(['हिंदी बिंदु']);
});

it('nothing citable → no model call, empty payload', async () => {
  vi.mocked(translate).mockResolvedValue([]);
  const j = await (await POST(req({ blocks: [{ text: 'x', citations: [] }], note: [], target: 'hi' }))).json();
  expect(j).toEqual({ blocks: [''], noteSub: null, noteContent: [] });
});
