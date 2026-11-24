-- /ops 지표 화면의 마지막 집계 결과. 화면은 이 행을 바로 보여 주고, 오래됐으면 응답 뒤에 다시 집계해 덮어쓴다.
-- 지표 쿼리는 기간 전체를 다시 읽어 30~70초가 걸리므로 화면을 열 때마다 기다리지 않게 한다.
-- key는 환경·화면·필터(src/app/api/internal/ops/*). 서버(service role)만 읽고 쓴다.
create table if not exists public.ops_metric_snapshots (
  key text primary key,
  value jsonb not null,
  computed_at timestamptz not null default now(),
  -- 집계한 배포(Vercel deployment). 배포가 바뀌면 정의가 바뀌었을 수 있어 다시 집계한다.
  computed_by text not null default '',
  -- 다시 집계 중이면 시작 시각. 같은 화면을 여러 번 열어도 한 번만 집계한다.
  refresh_started_at timestamptz,
  refresh_error text
);

alter table public.ops_metric_snapshots enable row level security;
revoke all on public.ops_metric_snapshots from public, anon, authenticated;
grant all on public.ops_metric_snapshots to service_role;
