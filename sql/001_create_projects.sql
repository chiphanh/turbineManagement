-- WindmillOps migration 001. Run once in an empty development database.
BEGIN;
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name VARCHAR(120) NOT NULL,
    address VARCHAR(300) NOT NULL,
    system_size_kwp NUMERIC(7,2) NOT NULL,
    stage VARCHAR(20) NOT NULL DEFAULT 'inspection',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT projects_customer_name_not_blank CHECK (length(btrim(customer_name)) > 0),
    CONSTRAINT projects_address_not_blank CHECK (length(btrim(address)) > 0),
    CONSTRAINT projects_system_size_positive CHECK (system_size_kwp > 0),
    CONSTRAINT projects_stage_valid CHECK (stage IN ('inspection', 'planning', 'installation', 'completed'))
);

CREATE FUNCTION set_project_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER projects_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION set_project_updated_at();
COMMIT;
