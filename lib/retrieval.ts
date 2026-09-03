import { adminClient } from './db';
import type { DocMeta } from './types';

export interface MatchRow { id: string; document_id: string; chunk_text: string;
  page_ref: string | null; section_ref: string | null; similarity: number; document: DocMeta }

export async function matchChunks(embedding: number[],
  o: { k: number; verifiedOnly: boolean; domain: string | null }): Promise<MatchRow[]> {
  const sb = adminClient();
  const { data, error } = await sb.rpc('match_chunks', { query_embedding: embedding,
    match_count: o.k, filter_verified: o.verifiedOnly, filter_domain: o.domain });
  if (error) throw error;
  if (!data?.length) return [];
  const rows = data as unknown as Array<Omit<MatchRow, 'document'>>;
  const docIds = [...new Set(rows.map(r => r.document_id))];
  const { data: docs, error: e2 } = await sb.from('documents')
    .select('id,title,doc_type,circular_no,issue_date,is_ocr,text_quality,source_url,domain,commodity')
    .in('id', docIds);
  if (e2) throw e2;
  const byId = new Map((docs ?? []).map(d => [d.id, d as DocMeta]));
  return rows.map(r => ({ ...r, document: byId.get(r.document_id)! }));
}

export async function corpusStats(): Promise<{ documents: number; chunks: number }> {
  const sb = adminClient();
  const { count: documents } = await sb.from('documents').select('*', { count: 'exact', head: true });
  const { count: chunks } = await sb.from('chunks').select('*', { count: 'exact', head: true });
  return { documents: documents ?? 0, chunks: chunks ?? 0 };
}
