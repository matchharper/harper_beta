-- Apply before the collector release. No new durable state: the transport hash
-- is consumed before INSERT/UPDATE and never becomes company/LLM context.
set local lock_timeout='5s';
set local statement_timeout='15s';
create or replace function public.invalidate_external_role_derived_data()
returns trigger language plpgsql set search_path='' as $$
declare
  source_changed boolean := false;
  pay_changed boolean;
  prediction_source_hash text;
begin
  prediction_source_hash := new.information->>'_salary_prediction_source_hash';
  if prediction_source_hash is not null then
    if tg_op='UPDATE' and new.information->>'_salary_prediction_merge_information'='true' then
      new.information := coalesce(old.information,'{}'::jsonb) ||
        (new.information-array['_salary_prediction_source_hash','_salary_prediction_merge_information']);
    else
      new.information := new.information-array['_salary_prediction_source_hash','_salary_prediction_merge_information'];
    end if;
  end if;
  if tg_op='UPDATE' then
    if new.name is distinct from old.name then
      new.title_embedding:=null; new.title_embedding_text:=null;
    end if;
    source_changed:=new.source_type is distinct from old.source_type or
      jsonb_build_array(new.name,new.description,new.company_workspace_id,new.location_text,new.country_code,new.type)
      is distinct from jsonb_build_array(old.name,old.description,old.company_workspace_id,old.location_text,old.country_code,old.type);
  end if;
  if prediction_source_hash is not null then
    -- A published salary arriving while the model ran takes precedence.
    if tg_op='UPDATE' and not old.salary_is_predicted and not source_changed and
       (old.salary_min is not null or old.salary_max is not null or nullif(btrim(old.salary_range),'') is not null) then
      new.salary_min:=old.salary_min; new.salary_max:=old.salary_max;
      new.salary_currency:=old.salary_currency; new.salary_period:=old.salary_period;
      new.salary_range:=old.salary_range; new.salary_is_predicted:=false;
      return new;
    end if;
    if new.source_type='external' and new.salary_is_predicted
       and prediction_source_hash=md5(jsonb_build_array(new.name,new.description,new.company_workspace_id,new.location_text,new.country_code,new.type)::text)
       and new.salary_currency='KRW' and new.salary_period='year'
       and nullif(btrim(new.salary_range),'') is null
       and new.salary_min>0 and new.salary_max>=new.salary_min
       and new.salary_max not in ('NaN'::numeric,'Infinity'::numeric) then
      return new;
    end if;
    -- A concurrent source edit invalidates only the estimate, not ingestion.
    new.salary_min:=null; new.salary_max:=null;
    new.salary_currency:=null; new.salary_period:=null;
    new.salary_range:=null; new.salary_is_predicted:=false;
  end if;
  if tg_op='INSERT' then return new; end if;
  pay_changed:=jsonb_build_array(new.salary_min,new.salary_max,new.salary_currency,new.salary_period,new.salary_range)
    is distinct from jsonb_build_array(old.salary_min,old.salary_max,old.salary_currency,old.salary_period,old.salary_range);
  if old.salary_is_predicted and new.salary_is_predicted and not source_changed
     and new.salary_min is null and new.salary_max is null and nullif(btrim(new.salary_range),'') is null then
    new.salary_min:=old.salary_min; new.salary_max:=old.salary_max;
    new.salary_currency:=old.salary_currency; new.salary_period:=old.salary_period;
    return new;
  end if;
  if old.salary_is_predicted and (source_changed or pay_changed) then
    if not pay_changed then
      new.salary_min:=null; new.salary_max:=null; new.salary_currency:=null; new.salary_period:=null;
    end if;
    new.salary_is_predicted:=false;
  end if;
  return new;
end $$;
create or replace trigger invalidate_external_role_derived_data
  before insert or update of name,description,company_workspace_id,location_text,country_code,type,source_type,salary_min,salary_max,salary_currency,salary_period,salary_range,information
  on public.company_roles for each row execute function public.invalidate_external_role_derived_data();
