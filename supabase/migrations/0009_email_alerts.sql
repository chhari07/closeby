-- Step 5.4 (alerts when the site is closed), by email.
-- last_seen_at: refreshed every minute by any open CloseBy tab and set to 0
-- when the last one closes; an alert is emailed only when it's stale.
alter table users add column if not exists last_seen_at bigint not null default 0;
-- The person's own on/off switch (Profile page).
alter table users add column if not exists email_alerts boolean not null default true;

-- One row per alert already emailed: stops duplicates (the same order event
-- twice) and throttles chat (one email per conversation per 10 minutes).
create table if not exists email_alert_log (
  key     text primary key,
  sent_at bigint not null
);
alter table email_alert_log enable row level security;
