-- /ops/update-metrics(배포 후 실험중인 지표)에서 팀원이 화면에서 바꾸는 변화별 상태.
-- 추적할 변화와 그 지표는 코드(src/lib/ops/updateMetrics.ts의 OPS_TRACKED_CHANGES)에 있고, 여기에는 화면에서 바꾼 것만 둔다.
-- data는 JSON이라 칼럼을 늘리지 않고 필드를 더한다. 지금은 {"endedAt": "<ISO 시각>"}만 쓴다(없거나 null이면 추적 중).
-- 서버(service role)만 읽고 쓴다.
create table if not exists public.ops_tracked_changes (
  key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ops_tracked_changes enable row level security;
revoke all on public.ops_tracked_changes from public, anon, authenticated;
grant all on public.ops_tracked_changes to service_role;
