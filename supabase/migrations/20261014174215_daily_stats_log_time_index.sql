set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Daily/weekly stats filter a time window across users and log types. The
-- existing (type, user_id, created_at) index cannot narrow that window first.
-- Match the reader's stable time/id ordering without constraining log values.
create index if not exists logs_created_at_id_idx
  on public.logs (created_at, id);
