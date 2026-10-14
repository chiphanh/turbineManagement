-- Run once after the original projects schema. Preserves existing projects.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE projects ADD COLUMN notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 10000);
CREATE TABLE teams (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 name VARCHAR(120) NOT NULL CHECK (length(btrim(name)) > 0),
 active BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE projects ADD COLUMN team_id UUID REFERENCES teams(id);
CREATE TABLE bookings (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id UUID NOT NULL REFERENCES projects(id),
 team_id UUID NOT NULL REFERENCES teams(id),
 starts_at TIMESTAMPTZ NOT NULL,
 ends_at TIMESTAMPTZ NOT NULL,
 status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled')),
 CHECK (ends_at > starts_at),
 CONSTRAINT bookings_team_no_overlap EXCLUDE USING gist (
  team_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&
 ) WHERE (status = 'scheduled')
);
CREATE UNIQUE INDEX bookings_one_active_project ON bookings(project_id) WHERE status = 'scheduled';
COMMIT;
