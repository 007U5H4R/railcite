export type DocType = 'manual' | 'circular' | 'correction_slip' | 'tariff';

export interface DocMeta {
  id: string;
  title: string;
  doc_type: DocType;
  circular_no: string | null;
  issue_date: string | null;        // ISO yyyy-mm-dd
  is_ocr: boolean;
  source_url: string | null;
  domain: string | null;            // 'goods' | 'coaching' | null
  commodity: string | null;
}

export interface SourceView {
  n: number;                        // 1-based citation number
  chunk_id: string;
  snippet: string;                  // chunk_text
  page_ref: string | null;
  section_ref: string | null;
  similarity: number;               // 0..1 cosine similarity
  document: DocMeta;
}

export interface ConclusionBlock { text: string; citations: number[] }  // ns into sources

export interface QueryMeta { searched: number; matched: number; above_threshold: number }

export type LineageKind = 'supersedes' | 'amends';
export interface LineageRelation {
  kind: LineageKind;
  target_document_id: string;   // the OLDER document this one supersedes / amends
  note: string | null;          // what the relationship changes (e.g. which paras)
}
export interface LineageNode {
  document_id: string;
  circular_no: string | null;
  issue_date: string | null;
  title: string;
  status: 'in_force' | 'superseded';
  // Outgoing relations to older documents. >1 = a branch (this doc relates to several); [] = a
  // leaf (nothing older). Each relation names its target explicitly, so no relationship is ever
  // dropped and the UI never implies a chain that isn't in the data.
  relations: LineageRelation[];
}
export interface LineageView { nodes: LineageNode[] }   // all docs in the cited component(s), newest-first

export type QueryResponse =
  | { status: 'answered'; blocks: ConclusionBlock[]; note: ConclusionBlock[];
      sources: SourceView[]; lineage: LineageView | null; meta: QueryMeta }
  | { status: 'refused'; meta: QueryMeta };

export interface QueryRequest {
  case_text: string;
  verified_only?: boolean;
  domain?: string | null;
}

// R4 — persisted case (`cases` table; migrations/002_cases.sql). Snake_case throughout to
// mirror the DB row 1:1; client code maps to camelCase where its own conventions want it
// (see hooks/useRecentCases.ts's RecentCase).
export interface CaseSummary {
  id: string;
  question: string;
  status: 'answered' | 'refused';
  verified_only: boolean;
  domain: string | null;
  is_saved: boolean;
  created_at: string;         // ISO
}
export interface CaseDetail extends CaseSummary { result: QueryResponse | null }

// Ingestion-side
export interface ChunkInput { chunk_text: string; page_ref: string; token_count: number }
export type SynthesisResult =
  | { status: 'answered'; blocks: ConclusionBlock[]; note: ConclusionBlock[] }
  | { status: 'refused' };
