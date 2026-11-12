-- T2 Queue Hub merge — Advanced queue's device type field.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS device text;
