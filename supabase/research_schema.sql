-- ============================================================
-- Research Assistant Schema
-- Run this once in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Research projects (separate from PA "projects" table)
create table if not exists research_projects (
  id text primary key,
  name text not null,
  description text,
  color text not null default '#3b82f6',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Categories / tags used to classify papers and highlights
create table if not exists research_categories (
  id text primary key,
  project_id text references research_projects(id) on delete cascade,
  name text not null,
  color text not null default '#6b7280',
  description text,
  parent_id text references research_categories(id) on delete set null,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

-- Papers
create table if not exists research_papers (
  id text primary key,
  project_id text not null references research_projects(id) on delete cascade,
  title text not null,
  authors text not null default '',
  year integer,
  journal text,
  doi text,
  url text,
  has_pdf boolean not null default false,
  pdf_url text,
  abstract text,
  summary text,
  citation text,
  category_ids text[] not null default '{}',
  tags text[] not null default '{}',
  reading_status text not null default 'not-started',
  dissertation_relevance integer check (dissertation_relevance between 1 and 5),
  presentation_relevance integer check (presentation_relevance between 1 and 5),
  methodological_relevance integer check (methodological_relevance between 1 and 5),
  notes text,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists research_papers_project_id_idx on research_papers(project_id);
create index if not exists research_papers_reading_status_idx on research_papers(reading_status);
create index if not exists research_papers_favorite_idx on research_papers(favorite);

-- Highlights (passages marked in PDFs)
create table if not exists research_highlights (
  id text primary key,
  paper_id text not null references research_papers(id) on delete cascade,
  project_id text not null references research_projects(id) on delete cascade,
  selected_text text not null,
  color text not null default '#fbbf24',
  category_ids text[] not null default '{}',
  note text not null default '',
  page_number integer,
  page_rects jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists research_highlights_paper_id_idx on research_highlights(paper_id);
create index if not exists research_highlights_project_id_idx on research_highlights(project_id);
