create extension if not exists vector;

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  doc_type text not null check (doc_type in ('manual','circular','correction_slip','tariff')),
  circular_no text,
  issue_date date,
  domain text,
  commodity text,
  source_url text,
  file_path text,
  file_hash text,
  is_ocr boolean not null default false,
  ingested_at timestamptz not null default now()
);
create unique index if not exists documents_source_key on documents ((coalesce(source_url, file_path)));

create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  chunk_text text not null,
  embedding vector(1024) not null,
  page_ref text,
  section_ref text,
  token_count int not null
);
create index if not exists chunks_document_idx on chunks (document_id);
create index if not exists chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);

create table if not exists lineage (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  relation text not null check (relation in ('supersedes','superseded_by','amends','amended_by')),
  related_document_id uuid not null references documents(id) on delete cascade,
  note text,
  unique (document_id, relation, related_document_id)
);

-- server-only access: RLS on, zero policies (anon + authenticated fully blocked)
alter table documents enable row level security;
alter table chunks enable row level security;
alter table lineage enable row level security;

create or replace function match_chunks(
  query_embedding vector(1024),
  match_count int,
  filter_verified boolean default false,
  filter_domain text default null
) returns table (id uuid, document_id uuid, chunk_text text, page_ref text, section_ref text, similarity float)
language sql stable as $$
  select c.id, c.document_id, c.chunk_text, c.page_ref, c.section_ref,
         1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documents d on d.id = c.document_id
  where (not filter_verified or d.is_ocr = false)
    and (filter_domain is null or d.domain = filter_domain)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
