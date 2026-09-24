-- Step 4.1 (AI search understanding): the AI turns a buyer's search text
-- ("kuch thanda peene ko", "chawl") into product words once; the answer is
-- cached here so the same query never pays for a second model call.
create table if not exists search_query_cache (
  query      text primary key,          -- normalised: lowercase, single spaces
  terms      text[] not null,           -- empty = not a shopping query
  hits       int not null default 0,
  created_at bigint not null
);
alter table search_query_cache enable row level security;
