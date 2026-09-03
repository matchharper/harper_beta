create or replace function public.talent_internal_role_is_candidate_visible_v1(
  p_fit public.talent_opportunity_fit
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when p_fit.id is null then false
    when lower(btrim(coalesce(p_fit.candidate_fit, ''))) = 'unfit' then false
    when nullif(btrim(coalesce(p_fit.human_label, '')), '') is not null
      then lower(btrim(p_fit.human_label)) = 'fit'
    else
      lower(btrim(coalesce(p_fit.label, ''))) = 'fit'
      or coalesce(p_fit.recommend, false)
      or (
        lower(btrim(coalesce(p_fit.role_fit, ''))) = 'fit'
        and lower(btrim(coalesce(p_fit.company_fit, ''))) = 'fit'
      )
  end
$$;

comment on function public.talent_internal_role_is_candidate_visible_v1(
  public.talent_opportunity_fit
) is
  'Canonical candidate-visible internal-role eligibility: B=unfit is excluded; otherwise human fit, legacy fit, recommend=true, or A/C fit is allowed.';

revoke all on function public.talent_internal_role_is_candidate_visible_v1(
  public.talent_opportunity_fit
) from public;

grant execute on function public.talent_internal_role_is_candidate_visible_v1(
  public.talent_opportunity_fit
) to service_role;

create or replace function public.talent_internal_role_reconsideration_is_pending_v1(
  p_fit public.talent_opportunity_fit
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    p_fit.id is not null
    and nullif(btrim(coalesce(p_fit.human_label, '')), '') is null
    and lower(btrim(coalesce(p_fit.candidate_fit, ''))) <> 'unfit'
    and p_fit.reevaluation_checked_at is null
    and nullif(
      btrim(coalesce(p_fit.reevaluation_criteria->>'new_information', '')),
      ''
    ) is not null
    and (
      lower(btrim(coalesce(p_fit.label, ''))) = 'hold'
      or (
        lower(btrim(coalesce(p_fit.role_fit, ''))) = 'fit'
        and lower(btrim(coalesce(p_fit.company_fit, ''))) = 'fit'
        and lower(btrim(coalesce(p_fit.candidate_fit, ''))) = 'middle'
      )
    )
$$;

comment on function public.talent_internal_role_reconsideration_is_pending_v1(
  public.talent_opportunity_fit
) is
  'Whether an eligible hold or A/C-fit B-middle internal role has unresolved user-supplied reconsideration information.';

revoke all on function public.talent_internal_role_reconsideration_is_pending_v1(
  public.talent_opportunity_fit
) from public;

grant execute on function public.talent_internal_role_reconsideration_is_pending_v1(
  public.talent_opportunity_fit
) to service_role;
