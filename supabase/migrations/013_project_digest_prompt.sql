-- ============================================================
-- Per-project digest prompt + project-scoped digest jobs
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Allow each research project to have a custom digest prompt.
-- NULL means "use the global default prompt" in the paper-digester agent.
alter table research_projects
  add column if not exists digest_prompt text;

-- Track which project a digest job belongs to.
-- NULL means the job spans all projects (legacy behaviour).
alter table digest_jobs
  add column if not exists project_id text references research_projects(id) on delete set null;

create index if not exists digest_jobs_project_id_idx on digest_jobs(project_id);
