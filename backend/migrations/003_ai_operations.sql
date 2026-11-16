BEGIN;
CREATE TABLE ai_tasks (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 4000),
 project_id UUID REFERENCES projects(id),
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','needs_approval','failed')),
 answer TEXT NOT NULL DEFAULT '', error TEXT,
 model TEXT NOT NULL, prompt_version TEXT NOT NULL,
 input_tokens INT NOT NULL DEFAULT 0, output_tokens INT NOT NULL DEFAULT 0,
 duration_ms INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ
);
CREATE INDEX ai_tasks_recent ON ai_tasks(created_at DESC);
CREATE TABLE ai_messages (
 id BIGSERIAL PRIMARY KEY, task_id UUID NOT NULL REFERENCES ai_tasks(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ai_tool_calls (
 id BIGSERIAL PRIMARY KEY, task_id UUID NOT NULL REFERENCES ai_tasks(id) ON DELETE CASCADE,
 name TEXT NOT NULL, input JSONB NOT NULL, output JSONB,
 status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
 duration_ms INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ai_booking_proposals (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), task_id UUID NOT NULL REFERENCES ai_tasks(id) ON DELETE CASCADE,
 project_id UUID NOT NULL REFERENCES projects(id), team_id UUID NOT NULL REFERENCES teams(id),
 starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected','expired')),
 booking_id UUID REFERENCES bookings(id),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 minutes', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(ends_at > starts_at), CHECK(status <> 'confirmed' OR booking_id IS NOT NULL)
);
CREATE UNIQUE INDEX ai_one_pending_proposal ON ai_booking_proposals(task_id) WHERE status='pending';
CREATE TABLE ai_eval_runs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), prompt_version TEXT NOT NULL, model TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'running', results JSONB NOT NULL DEFAULT '[]',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ
);
COMMIT;
