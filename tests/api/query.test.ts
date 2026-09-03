import { vi } from 'vitest';
vi.mock('@/lib/auth', () => ({ getUserFromRequest: vi.fn(async () => ({ id: 'u1' })) }));
vi.mock('@/lib/embeddings', () => ({ embedTexts: vi.fn(async () => [Array(1024).fill(0.1)]) }));
vi.mock('@/lib/retrieval', () => ({ matchChunks: vi.fn(), corpusStats: vi.fn(async () => ({ documents: 6, chunks: 900 })) }));
vi.mock('@/lib/synthesize', () => ({ synthesize: vi.fn() }));
vi.mock('@/lib/lineage', () => ({ getLineage: vi.fn(async () => null) }));
vi.mock('@/lib/classifyQueryDomain', () => ({ classifyQueryDomain: vi.fn(async () => null) }));

import { POST } from '@/app/api/query/route';
import { classifyQueryDomain } from '@/lib/classifyQueryDomain';
import { matchChunks } from '@/lib/retrieval';
import { synthesize } from '@/lib/synthesize';
import { getUserFromRequest } from '@/lib/auth';

const req = (body: unknown) => new Request('http://x/api/query',
  { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const HIT = (sim: number, n = 1) => ({ id: `c${n}`, document_id: `d${n}`, chunk_text: 'passage text',
  page_ref: 'p. 2', section_ref: null, similarity: sim,
  document: { id: `d${n}`, title: 'T', doc_type: 'circular', circular_no: 'TCR/1', issue_date: '2019-03-12',
    is_ocr: false, source_url: null, domain: 'goods', commodity: null } });

beforeEach(() => { vi.mocked(matchChunks).mockReset(); vi.mocked(synthesize).mockReset();
  process.env.RELEVANCE_THRESHOLD = '0.45'; });

it('400 on empty case_text', async () => {
  expect((await POST(req({ case_text: '' }))).status).toBe(400);
});
it('401 when unauthenticated', async () => {
  vi.mocked(getUserFromRequest).mockResolvedValueOnce(null);
  expect((await POST(req({ case_text: 'valid length case for auth' }))).status).toBe(401);
});
it('refuses below threshold WITHOUT calling claude', async () => {
  vi.mocked(matchChunks).mockResolvedValue([HIT(0.2)]);
  const res = await POST(req({ case_text: 'nonsense case' }));
  const j = await res.json();
  expect(j.status).toBe('refused');
  expect(j.meta.above_threshold).toBe(0);
  expect(synthesize).not.toHaveBeenCalled();
});
it('answers end-to-end and numbers sources 1..k', async () => {
  vi.mocked(matchChunks).mockResolvedValue([HIT(0.8, 1), HIT(0.7, 2)]);
  vi.mocked(synthesize).mockResolvedValue({ status: 'answered',
    blocks: [{ text: 'ans [1]', citations: [1, 99] }], note: [] });
  const j = await (await POST(req({ case_text: 'real demurrage case text' }))).json();
  expect(j.status).toBe('answered');
  expect(j.sources.map((s: any) => s.n)).toEqual([1, 2]);
  expect(j.blocks[0].citations).toEqual([1]);          // 99 stripped by validator
  expect(j.meta).toEqual({ searched: 900, matched: 2, above_threshold: 2,
    resolved_domain: null, auto_detected: false });
});
it('auto scope: classifies the query and applies the detected domain to retrieval', async () => {
  vi.mocked(classifyQueryDomain).mockResolvedValueOnce('coaching');
  vi.mocked(matchChunks).mockResolvedValue([HIT(0.8, 1)]);
  vi.mocked(synthesize).mockResolvedValue({ status: 'answered',
    blocks: [{ text: 'ans [1]', citations: [1] }], note: [] });
  const j = await (await POST(req({ case_text: 'Vikalp scheme for waitlisted passengers', domain: 'auto' }))).json();
  expect(classifyQueryDomain).toHaveBeenCalledOnce();
  // the RESOLVED domain (not the 'auto' sentinel) is the filter handed to match_chunks
  expect(vi.mocked(matchChunks).mock.calls[0][1]).toMatchObject({ domain: 'coaching' });
  expect(j.meta).toMatchObject({ resolved_domain: 'coaching', auto_detected: true });
});
it('auto scope fails open: an unclear query (classifier null) searches all domains', async () => {
  vi.mocked(classifyQueryDomain).mockResolvedValueOnce(null);
  vi.mocked(matchChunks).mockResolvedValue([HIT(0.8, 1)]);
  vi.mocked(synthesize).mockResolvedValue({ status: 'answered',
    blocks: [{ text: 'ans [1]', citations: [1] }], note: [] });
  const j = await (await POST(req({ case_text: 'some ambiguous railway question', domain: 'auto' }))).json();
  expect(vi.mocked(matchChunks).mock.calls[0][1]).toMatchObject({ domain: null });
  expect(j.meta).toMatchObject({ resolved_domain: null, auto_detected: true });
});
it('refuses when validator strips everything', async () => {
  vi.mocked(matchChunks).mockResolvedValue([HIT(0.8)]);
  vi.mocked(synthesize).mockResolvedValue({ status: 'answered',
    blocks: [{ text: 'fab', citations: [42] }], note: [] });
  const j = await (await POST(req({ case_text: 'fabrication test case here' }))).json();
  expect(j.status).toBe('refused');
});
