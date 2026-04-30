alter table public.talent_setting
  add column if not exists periodic_enabled boolean not null default true,
  add column if not exists periodic_interval_days integer not null default 3,
  add column if not exists recommendation_batch_size integer not null default 5,
  add column if not exists last_periodic_run_at timestamptz null,
  add column if not exists recommendation_source_conversation_id uuid null references public.talent_conversations(id) on delete set null,
  add column if not exists recommendation_settings_updated_by text not null default 'user_settings';

do $$
begin
  alter table public.talent_setting
    add constraint talent_setting_periodic_interval_check
    check (periodic_interval_days between 1 and 30);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.talent_setting
    add constraint talent_setting_recommendation_batch_size_check
    check (recommendation_batch_size between 1 and 20);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.talent_setting
    add constraint talent_setting_recommendation_settings_updated_by_check
    check (recommendation_settings_updated_by in ('user_settings', 'conversation', 'admin'));
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  if to_regclass('public.talent_recommendation_settings') is not null then
    execute 'drop policy if exists talent_recommendation_settings_select_own on public.talent_recommendation_settings';
    execute 'drop policy if exists talent_recommendation_settings_update_own on public.talent_recommendation_settings';
    execute 'drop policy if exists talent_recommendation_settings_insert_own on public.talent_recommendation_settings';
    execute 'drop trigger if exists talent_recommendation_settings_set_updated_at on public.talent_recommendation_settings';
    execute 'drop table public.talent_recommendation_settings';
  end if;
end
$$;
