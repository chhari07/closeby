-- Step 3.4 (owner stats): "time to add the first 30 products" needs to know
-- when each product was added. Existing rows stay NULL (unknown) rather
-- than all getting today's date; new rows are stamped automatically.
alter table products add column if not exists created_at bigint;
alter table products alter column created_at set default (extract(epoch from clock_timestamp()) * 1000)::bigint;
