drop function if exists public.candid_ids_scholar_and_pattern(text) restrict;
drop function if exists public.filter_candidates_by_pattern(uuid[], text) restrict;
drop function if exists public.find_candid_ids_by_link_pattern(text) restrict;
drop function if exists public.get_scholar_candidate_ids() restrict;
drop function if exists public.is_admin() restrict;
drop function if exists public.reset_org_db_seq() restrict;

drop function if exists public.match_service_help_chunks(vector, integer) restrict;
drop table if exists public.service_help_chunks restrict;
drop function if exists public.set_service_help_chunks_updated_at() restrict;

drop table if exists public.harper_system restrict;

notify pgrst, 'reload schema';
