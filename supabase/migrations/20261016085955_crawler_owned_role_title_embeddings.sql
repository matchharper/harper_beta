-- Applied to production 2026-10-16 as version 20261016091449.
-- Lock wait was 30s (statement timeout 40s); verified both dictionary triggers absent.
-- Crawlers write vectors directly on company_roles. No title-dictionary queue.
set local lock_timeout='5s';
set local statement_timeout='15s';
drop trigger if exists enqueue_external_role_title_embedding on public.company_roles;
drop trigger if exists maintain_external_live_title_count on public.company_roles;

-- Preserve a fresh vector supplied atomically with a renamed role.
create or replace function public.invalidate_external_role_derived_data()
returns trigger language plpgsql set search_path='' as $$
declare source_changed boolean; pay_changed boolean;
begin
  if new.name is distinct from old.name
     and (new.title_embedding is null or new.title_embedding_text is distinct from new.name) then
    new.title_embedding:=null; new.title_embedding_text:=null;
  end if;
  source_changed:=new.source_type is distinct from old.source_type or jsonb_build_array(new.name,new.description,new.company_workspace_id,new.location_text,new.country_code,new.type)
    is distinct from jsonb_build_array(old.name,old.description,old.company_workspace_id,old.location_text,old.country_code,old.type);
  pay_changed:=jsonb_build_array(new.salary_min,new.salary_max,new.salary_currency,new.salary_period,new.salary_range)
    is distinct from jsonb_build_array(old.salary_min,old.salary_max,old.salary_currency,old.salary_period,old.salary_range);
  if old.salary_is_predicted and new.salary_is_predicted and not source_changed
     and new.salary_min is null and new.salary_max is null and nullif(btrim(new.salary_range),'') is null then
    -- Scrapers send a complete null salary group when pay remains undisclosed.
    -- That is not new compensation evidence and must not erase a usable cache.
    new.salary_min:=old.salary_min;new.salary_max:=old.salary_max;
    new.salary_currency:=old.salary_currency;new.salary_period:=old.salary_period;
    return new;
  end if;
  if old.salary_is_predicted and (source_changed or pay_changed) then
    -- An ordinary source salary write replaces the prediction. A source-only
    -- change clears its obsolete prediction without deleting published pay.
    if not pay_changed or (new.salary_min is not distinct from old.salary_min and new.salary_max is not distinct from old.salary_max) then
      new.salary_min:=null;new.salary_max:=null;new.salary_currency:=null;new.salary_period:=null;
    end if;
    new.salary_is_predicted:=false;
  end if;
  return new;
end $$;
