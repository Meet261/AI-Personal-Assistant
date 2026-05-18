-- Full-text search on research_papers
-- Uses a trigger (not generated column) to avoid immutability restrictions on array_to_string

alter table research_papers
  add column if not exists fts tsvector;

create or replace function research_papers_fts_update() returns trigger as $$
begin
  new.fts :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.authors, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(new.tags, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.abstract, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(new.summary, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(new.notes, '')), 'D');
  return new;
end;
$$ language plpgsql;

drop trigger if exists research_papers_fts_trigger on research_papers;
create trigger research_papers_fts_trigger
  before insert or update on research_papers
  for each row execute function research_papers_fts_update();

-- Backfill existing rows
update research_papers set fts =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(authors, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(array_to_string(tags, ' '), '')), 'B') ||
  setweight(to_tsvector('english', coalesce(abstract, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(summary, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(notes, '')), 'D');

create index if not exists research_papers_fts_idx
  on research_papers using gin(fts);
