-- Owner AI ideas: when they were last made, and a fingerprint of the sales +
-- stock data they were made from (src/lib/shop-ideas.ts). "Get ideas" is
-- then only allowed when the data changed, the cooldown passed, or it's the
-- first time — no paying the AI to re-describe the same numbers.
alter table shops add column if not exists ideas_generated_at bigint;
alter table shops add column if not exists ideas_fingerprint text;
