alter table public.talent_internal
  alter column talent_id drop not null;

do $$
begin
  alter table public.talent_internal
    drop constraint if exists talent_internal_talent_id_fkey;
exception
  when undefined_object then null;
end
$$;
