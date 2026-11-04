-- A carried handbook resolves to the current source without renewing its lease.
-- Content version is not lease identity: consume the actual supplied handbook by
-- stable ID. Reply claims/completion IDs still prevent duplicate consumption.
create or replace function public.consume_career_agent_handbooks(p_current jsonb,p_record jsonb,p_after jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb:='[]'; book jsonb; supplied jsonb; remaining integer;
begin
 for book in select value from jsonb_array_elements(coalesce(p_current,'[]')) loop
   if coalesce(p_record->'loadedHandbooks','[]') ? (book->>'id') then continue; end if;
   remaining:=(book->>'remainingReplies')::integer;
   if coalesce(p_record->'injectedHandbooks','[]') ? (book->>'id') then
     select value into supplied from jsonb_array_elements(coalesce(p_record->'handbooks','[]'))
       where value->>'id'=book->>'id' limit 1;
     if found then remaining:=remaining-1; end if;
   end if;
   if remaining>0 then result:=result||jsonb_build_array(book||jsonb_build_object('remainingReplies',remaining)); end if;
 end loop;
 -- Only an actual load/reload may add a lease or renew it. An expired carried
 -- snapshot cannot resurrect a guide after intervening replies consumed it.
 for book in select value from jsonb_array_elements(coalesce(p_after,'[]')) loop
   if coalesce(p_record->'loadedHandbooks','[]') ? (book->>'id') then result:=result||jsonb_build_array(book); end if;
 end loop;
 return result;
end $$;
