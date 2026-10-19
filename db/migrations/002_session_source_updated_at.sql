-- Redis lastActiveAt of the snapshot that last wrote the row. Older snapshots must not overwrite it.
alter table sessions add column source_updated_at timestamptz not null default '-infinity';
