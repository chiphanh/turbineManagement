-- Optional fictional records. Safe to run repeatedly. No real customer data.
INSERT INTO teams(id,name) VALUES
 ('22222222-2222-4222-8222-222222222222','Team B'),
 ('44444444-4444-4444-8444-444444444444','Team North') ON CONFLICT(id) DO NOTHING;
INSERT INTO projects(id,customer_name,address,rated_power_kw,stage,notes) VALUES
 ('11111111-1111-4111-8111-111111111111','Berlin installation','Demo site, Berlin',25,'planning','Inspection complete. Site access approved. Ready for installation.'),
 ('33333333-3333-4333-8333-333333333333','Aachen installation','Demo site, Aachen',15,'inspection','Delayed: awaiting site access approval. No installation date confirmed.') ON CONFLICT(id) DO NOTHING;
