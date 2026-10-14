-- Run once in a new Neon database. For an existing table see README instead.
CREATE TABLE projects (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 customer_name VARCHAR(120) NOT NULL CHECK (length(btrim(customer_name)) > 0),
 address VARCHAR(300) NOT NULL CHECK (length(btrim(address)) > 0),
 rated_power_kw NUMERIC(10,2) NOT NULL CHECK (rated_power_kw > 0),
 stage VARCHAR(20) NOT NULL DEFAULT 'inspection' CHECK (stage IN ('inspection','planning','installation','completed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- The API updates updated_at explicitly on every PATCH.
