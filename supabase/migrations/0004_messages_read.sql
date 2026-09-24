-- Buyer "Messages" tab: messages are built from each order's timeline and
-- payment state (src/lib/messages.ts), so every past alert is already there.
-- This only remembers when the buyer last opened the tab, for the unread badge.
alter table users add column if not exists messages_read_at bigint not null default 0;
