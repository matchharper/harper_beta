-- Relays identify the candidate through their original message, not a relay column.
create or replace function public.guard_ops_private_relay_v1() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.talent_messages message
      where message.id=new.source_talent_message_id
        and public.ops_private_contact_for_message_v1(message.id,message.user_id) is not null)
    or exists(select 1 from public.company_talent_requests where id=new.company_talent_request_id and ops_only) then
    raise exception 'ops_private_contact_requires_internal_reply';
  end if;
  return new;
end $$;

create or replace function public.guard_ops_private_contact_delivery_v1() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.type in ('company_contact_company_delivery','company_request_company_delivery') and (
    exists(select 1 from public.company_talent_requests where id=new.company_talent_request_id and ops_only)
    or exists(select 1 from public.company_talent_relays relay
      join public.talent_messages message on message.id=relay.source_talent_message_id
      where relay.id=new.company_talent_relay_id
        and public.ops_private_contact_for_message_v1(message.id,message.user_id) is not null)
  ) then raise exception 'ops_private_contact_company_delivery_forbidden'; end if;
  return new;
end $$;

revoke all on function public.guard_ops_private_relay_v1() from public,anon,authenticated;
revoke all on function public.guard_ops_private_contact_delivery_v1() from public,anon,authenticated;
