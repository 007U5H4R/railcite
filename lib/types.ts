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

export interface LineageNode {
  document_id: string;
  circular_no: string | null;
  issue_date: string | null;
  title: string;
  status: 'in_force' | 'superseded';
  relation_to_prev: 'supersedes' | 'amends' | null;  // relation to the node below it
  note: string | null;
}
export interface LineageView { nodes: LineageNode[] }   // ordered newest (in_force) first

export type QueryResponse =
  | { status: 'answered'; blocks: ConclusionBlock[]; note: ConclusionBlock[];
      sources: SourceView[]; lineage: LineageView | null; meta: QueryMeta }
  | { status: 'refused'; meta: QueryMeta };

export interface QueryRequest {
  case_text: string;
  verified_only?: boolean;
  domain?: string | null;
}

// Ingestion-side
export interface ChunkInput { chunk_text: string; page_ref: string; token_count: number }
export type SynthesisResult =
  | { status: 'answered'; blocks: ConclusionBlock[]; note: ConclusionBlock[] }
  | { status: 'refused' };
