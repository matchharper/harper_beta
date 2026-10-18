-- Applied to production 2026-10-16 as version 20261016110600.
-- User explicitly authorized DB-first removal without web deployment.
-- The old Ops dictionary option may fail until its removal is deployed.
-- Verified: table absent, related functions/triggers zero; role vectors and search RPC preserved.
set local lock_timeout = '5s';
set local statement_timeout = '15s';
drop trigger if exists enqueue_external_role_title_embedding on public.company_roles;
drop trigger if exists maintain_external_live_title_count on public.company_roles;
drop function if exists public.enqueue_external_role_title_embedding();
drop function if exists public.maintain_external_live_title_count();
drop function if exists public.pending_external_title_embeddings(integer);
drop function if exists public.save_external_title_embeddings(jsonb);
drop table if exists public.external_role_title_embeddings restrict;
