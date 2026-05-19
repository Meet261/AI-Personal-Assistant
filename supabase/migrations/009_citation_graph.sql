-- Citation graph for research papers
create table if not exists paper_citations (
  id              uuid primary key default gen_random_uuid(),
  paper_id        text references research_papers(id) on delete cascade,
  cited_paper_id  text references research_papers(id) on delete cascade,
  external_id     text,    -- Semantic Scholar paperId of the cited paper (may not be in our library)
  title           text,
  authors         text,
  year            int,
  venue           text,
  citation_count  int,
  relation        text check (relation in ('cites','cited_by')),
  fetched_at      timestamptz not null default now(),
  unique(paper_id, external_id, relation)
);

create index if not exists paper_citations_paper_idx    on paper_citations(paper_id);
create index if not exists paper_citations_cited_idx    on paper_citations(cited_paper_id);
create index if not exists paper_citations_relation_idx on paper_citations(relation);

-- Track which papers have had their citations fetched
alter table research_papers
  add column if not exists s2_paper_id    text,
  add column if not exists citations_fetched_at timestamptz;
