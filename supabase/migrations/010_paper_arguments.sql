-- Structured argument extraction per paper
alter table research_papers
  add column if not exists main_claim       text,
  add column if not exists methodology      text,
  add column if not exists key_findings     text,
  add column if not exists limitations      text,
  add column if not exists contradicts      text[],   -- paper IDs this paper contradicts
  add column if not exists supports         text[],   -- paper IDs this paper supports
  add column if not exists arguments_extracted_at timestamptz;
