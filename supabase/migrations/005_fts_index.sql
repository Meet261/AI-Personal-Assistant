-- Full-text search index on research_papers
-- Combines title (weight A), authors (B), tags (B), abstract (C), summary (C), notes (D)

alter table research_papers
  add column if not exists fts tsvector
    generated always as (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(authors, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(array_to_string(tags, ' '), '')), 'B') ||
      setweight(to_tsvector('english', coalesce(abstract, '')), 'C') ||
      setweight(to_tsvector('english', coalesce(summary, '')), 'C') ||
      setweight(to_tsvector('english', coalesce(notes, '')), 'D')
    ) stored;

create index if not exists research_papers_fts_idx
  on research_papers using gin(fts);
