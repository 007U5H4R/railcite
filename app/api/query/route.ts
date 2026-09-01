import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { getUserFromRequest } from '@/lib/auth';
import { embedTexts } from '@/lib/embeddings';
import { matchChunks, corpusStats } from '@/lib/retrieval';
import { synthesize } from '@/lib/synthesize';
import { validateSynthesis } from '@/lib/validate';
import { getLineage } from '@/lib/lineage';
import { optionalEnv } from '@/lib/env';
import type { QueryResponse, SourceView } from '@/lib/types';

export const maxDuration = 60;
const Body = z.object({ case_text: z.string().trim().min(10).max(4000),
  verified_only: z.boolean().optional(), domain: z.string().nullable().optional() });

export async function POST(req: Request): Promise<Response> {
  const json = (b: unknown, status = 200) => Response.json(b, { status });
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'case_text must be 10–4000 characters' }, 400);
    if (!await getUserFromRequest(req)) return json({ error: 'auth_required' }, 401);
    const { case_text, verified_only = false, domain = null } = parsed.data;

    const threshold = Number(optionalEnv('RELEVANCE_THRESHOLD', '0.45'));
    const [{ chunks: searched }, [qEmb]] = await Promise.all([corpusStats(), embedTexts([case_text], 'query')]);
    const hits = await matchChunks(qEmb, { k: 8, verifiedOnly: verified_only, domain });
    const above = hits.filter(h => h.similarity >= threshold);
    const meta = { searched, matched: hits.length, above_threshold: above.length };
    if (!above.length) return json({ status: 'refused', meta } satisfies QueryResponse);

    const sources: SourceView[] = above.map((h, i) => ({ n: i + 1, chunk_id: h.id,
      snippet: h.chunk_text, page_ref: h.page_ref, section_ref: h.section_ref,
      similarity: h.similarity, document: h.document }));
    const syn = await synthesize(case_text, sources.map(s => ({ n: s.n,
      header: `${s.document.circular_no ?? s.document.title} · ${s.document.issue_date ?? 'date n/a'} · ${s.document.doc_type}${s.document.is_ocr ? ' · OCR' : ''}`,
      text: s.snippet })));
    const validated = validateSynthesis(syn, sources.length);
    if (validated.status === 'refused') return json({ status: 'refused', meta } satisfies QueryResponse);

    const citedDocIds = [...new Set(validated.blocks.flatMap(b => b.citations)
      .map(n => sources[n - 1].document.id))];
    const lineage = await getLineage(citedDocIds);
    return json({ status: 'answered', blocks: validated.blocks, note: validated.note,
      sources, lineage, meta } satisfies QueryResponse);
  } catch (e) {
    console.error('query failed:', e);
    // An error thrown BY the Anthropic API (exhausted credits, rate limit, overload, outage)
    // means the ANSWERING SERVICE is unavailable — not that RailCite broke. Surface it as 503
    // with its own code so the client can show an honest "temporarily unavailable" state
    // instead of a raw server error; the details stay in the server log only.
    if (e instanceof Anthropic.APIError) return json({ error: 'generation_unavailable' }, 503);
    return json({ error: 'query_failed' }, 500);
  }
}
