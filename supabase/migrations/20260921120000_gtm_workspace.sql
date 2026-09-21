-- Configurable GTM workspace. Business records remain in the existing GTM ledgers.
-- Schema and view configuration only: no Google Sheets writes or external delivery.
create schema if not exists gtm_view;
revoke all on schema gtm_view from public, anon, authenticated;

create table gtm_view.sources (
  id text primary key,
  label text not null,
  relation regclass,
  entity regclass,
  writer text check (writer in ('record', 'pricing', 'review')),
  performance_group text,
  field_labels jsonb not null default '{}',
  virtual_fields jsonb not null default '[]',
  enrichment_group text,
  enrichment_fields jsonb not null default '{}',
  check ((relation is not null) <> (performance_group is not null))
);
create table gtm_view.sheets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  position integer not null default 0,
  definition jsonb not null,
  row_version bigint not null default 1,
  updated_by text not null,
  updated_at timestamptz not null default now()
);
alter table gtm_view.sources enable row level security;
alter table gtm_view.sheets enable row level security;
revoke all on all tables in schema gtm_view from public, anon, authenticated;

-- The web uses its verified Supabase session; agents keep their existing scoped
-- GTM token. Resolve the same stable actor for optimistic writes and retries.
create or replace function gtm_view.credential(p_token text)
returns public.gtm_access_tokens language plpgsql security definer set search_path='' as $$
declare result public.gtm_access_tokens; actor_email text;
begin
  if nullif(p_token,'') is not null then
    select * into result from public.gtm_access_tokens
    where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
      and revoked_at is null and expires_at>now();
    if not found then raise exception 'Invalid or expired GTM access token' using errcode='28000'; end if;
  else
    select lower(btrim(email)) into actor_email from auth.users
      where id=auth.uid() and email_confirmed_at is not null and deleted_at is null
      and lower(split_part(email,'@',2))='matchharper.com';
    if actor_email is null then raise exception 'Internal GTM access required' using errcode='42501'; end if;
    result.id:=auth.uid(); result.name:=actor_email; result.can_write:=true;
    result.expires_at:=now()+interval '1 hour';
  end if;
  return result;
end $$;

-- Keep deployed business rules canonical. Replace only credential lookup, never
-- rewrite the currently deployed mutation body (which can be ahead of old files).
-- Fail closed if the known auth seam changes. Re-running leaves the seam intact.
do $migration$
declare signature regprocedure; definition text; patched text;
begin
  for signature in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('gtm_api','gtm_outreach_review','gtm_compensation_strategy_save')
  loop
    definition:=pg_get_functiondef(signature);
    if position('gtm_view.credential(p_token)' in definition)>0 then continue; end if;
    patched:=regexp_replace(definition,
      'select \* into credential\s+from public\.gtm_access_tokens\s+where token_hash\s*=.*?and revoked_at is null\s+and expires_at\s*>\s*now\(\);',
      'select * into credential from gtm_view.credential(p_token);','ns');
    if patched=definition then raise exception 'GTM authentication seam changed: %',signature; end if;
    execute patched;
  end loop;
end $migration$;

create function gtm_view.fields(p_source text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s gtm_view.sources; result jsonb;
begin
  select * into strict s from gtm_view.sources where id=p_source;
  if s.relation is null then return s.virtual_fields; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'key',a.attname,'label',coalesce(s.field_labels->>a.attname,replace(a.attname,'_',' ')),
    'type',case when t.typcategory='N' then 'number' when t.typname='bool' then 'boolean'
      when t.typcategory='D' then 'date' when t.typcategory='A' then 'array'
      when t.typname in ('json','jsonb') then 'json' else 'text' end,
    'writable',coalesce(s.writer in ('record','pricing') and b.attname is not null
      and a.attname<>all(array['id','ref','created_at','updated_at','created_by','updated_by','row_version','archived_at',
        'tracking_links','contacts','action_items','payments','allocations','asset_refs'])
      and (s.writer<>'pricing' or a.attname=any(array['name','status','pricing_model','currency','base_fee',
        'measurement_window_days','views_per_unit','amount_per_unit','notes','version'])),false),
    'required',coalesce(b.attnotnull and b.atthasdef=false and a.attname<>all(array['id','ref','created_by','updated_by','row_version']),false),
    'reference',(select target.id from pg_constraint fk
      join pg_attribute fk_col on fk_col.attrelid=fk.conrelid and fk_col.attnum=fk.conkey[1]
      join gtm_view.sources target on target.entity=fk.confrelid and target.writer in ('record','pricing')
      where fk.contype='f' and fk.conrelid=s.entity and array_length(fk.conkey,1)=1 and fk_col.attname=a.attname
      order by target.id limit 1)
  ) order by a.attnum),'[]') into result
  from pg_attribute a join pg_type t on t.oid=a.atttypid
  left join pg_attribute b on b.attrelid=s.entity and b.attname=a.attname and b.attnum>0 and not b.attisdropped
  where a.attrelid=s.relation and a.attnum>0 and not a.attisdropped;
  return result||s.virtual_fields;
end $$;

create function gtm_view.relations(p_source text) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('key',f->>'key','source',f->>'reference','label',s.label)),'[]')
  from jsonb_array_elements(gtm_view.fields(p_source))f join gtm_view.sources s on s.id=f->>'reference';
$$;
create function gtm_view.all_fields(p_source text) returns jsonb
language sql stable security definer set search_path='' as $$
 select gtm_view.fields(p_source)||coalesce(jsonb_agg(f||jsonb_build_object(
   'key',(r->>'key')||'.'||(f->>'key'),'label',(r->>'label')||' · '||(f->>'label'),'writable',false,'required',false)),'[]')
 from jsonb_array_elements(gtm_view.relations(p_source))r
 cross join lateral jsonb_array_elements(gtm_view.fields(r->>'source'))f;
$$;

create function gtm_view.validate_definition(d jsonb) returns void
language plpgsql stable security definer set search_path='' as $$
declare fields jsonb; c jsonb; f jsonb; keys text[]:='{}'; n numeric;
begin
  if jsonb_typeof(d) is distinct from 'object' or not exists(select 1 from gtm_view.sources where id=d->>'source') then
    raise exception 'Choose a registered GTM data source' using errcode='22023'; end if;
  fields:=gtm_view.all_fields(d->>'source');
  if jsonb_typeof(d->'columns') is distinct from 'array' or jsonb_array_length(d->'columns') not between 1 and 150 then
    raise exception 'Choose 1 to 150 columns' using errcode='22023'; end if;
  for c in select value from jsonb_array_elements(d->'columns') loop
    if not exists(select 1 from jsonb_array_elements(fields) meta where meta->>'key'=c->>'key') or (c->>'key')=any(keys) then
      raise exception 'Unknown or duplicate column: %',c->>'key' using errcode='22023'; end if;
    keys:=array_append(keys,c->>'key');
    if length(coalesce(c->>'label','')) not between 1 and 160 or coalesce((c->>'width')::numeric,0) not between 60 and 1200 then
      raise exception 'Invalid column label or width' using errcode='22023'; end if;
    if c?'color' and coalesce(c->>'color','') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Invalid column color' using errcode='22023'; end if;
    if c?'rules' then
      if jsonb_typeof(c->'rules')<>'array' or jsonb_array_length(c->'rules')>20 then raise exception 'Invalid color rules'; end if;
      for f in select value from jsonb_array_elements(c->'rules') loop
        if coalesce(f->>'color','') !~ '^#[0-9a-fA-F]{6}$' or coalesce(f->>'operator','')<>all(array['contains','eq','neq','gt','gte','lt','lte','empty','not_empty']) then
          raise exception 'Invalid color rule' using errcode='22023'; end if;
      end loop;
    end if;
  end loop;
  if not exists(select 1 from jsonb_array_elements(d->'columns') entry where not coalesce((entry->>'hidden')::boolean,false)) then
    raise exception 'Keep at least one visible column' using errcode='22023'; end if;
  if jsonb_typeof(d->'filters') is distinct from 'array' or jsonb_array_length(d->'filters')>30
    or jsonb_typeof(d->'sorting') is distinct from 'array' or jsonb_array_length(d->'sorting')>5 then
    raise exception 'Invalid filters or sorting' using errcode='22023'; end if;
  for f in select value from jsonb_array_elements((d->'filters')||(d->'sorting')) loop
    if not coalesce((f->>'key')=any(keys),false) then raise exception 'Filter/sort column is not in the sheet' using errcode='22023'; end if;
  end loop;
  for f in select value from jsonb_array_elements(d->'filters') loop
    if coalesce(f->>'operator','')<>all(array['contains','eq','neq','gt','gte','lt','lte','empty','not_empty']) then raise exception 'Invalid filter operator' using errcode='22023'; end if;
  end loop;
  if coalesce((d->>'rowHeight')::numeric,0) not between 28 and 600 or jsonb_typeof(d->'rowHeights') is distinct from 'object' then
    raise exception 'Invalid row height' using errcode='22023'; end if;
  for n in select value::numeric from jsonb_each_text(d->'rowHeights') loop
    if n not between 28 and 600 then raise exception 'Invalid row height' using errcode='22023'; end if;
  end loop;
end $$;

create function gtm_view.matches(r jsonb, filters jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare f jsonb; v text; expected text; matched boolean;
begin
 for f in select value from jsonb_array_elements(filters) loop
  v:=r->>(f->>'key'); expected:=coalesce(f->>'value','');
  if f->>'operator'=any(array['gt','gte','lt','lte']) and (jsonb_typeof(r->(f->>'key')) is distinct from 'number' or expected !~ '^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$') then return false; end if;
  matched:=case f->>'operator'
    when 'empty' then coalesce(v,'')=''
    when 'not_empty' then coalesce(v,'')<>''
    when 'contains' then position(lower(expected) in lower(coalesce(v,'')))>0
    when 'eq' then lower(coalesce(v,''))=lower(expected)
    when 'neq' then lower(coalesce(v,''))<>lower(expected)
    when 'gt' then (r->(f->>'key'))>to_jsonb(expected::numeric)
    when 'gte' then (r->(f->>'key'))>=to_jsonb(expected::numeric)
    when 'lt' then (r->(f->>'key'))<to_jsonb(expected::numeric)
    when 'lte' then (r->(f->>'key'))<=to_jsonb(expected::numeric)
    else false end;
  if not coalesce(matched,false) then return false; end if;
 end loop;
 return true;
end $$;

-- Enrich the existing attribution calculation. Never recompute business metrics
-- from browser rows, treat missing tracking as zero, or sum mixed currencies.
create function gtm_view.performance_rows(p_group text,p_options jsonb)
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare perf jsonb;
begin
 perf:=public.gtm_performance(p_options);
 if p_group='daily' then
   return query select r||jsonb_build_object('id',r->>'day','row_version',0)
     from jsonb_array_elements(perf->'daily')r; return;
 end if;
 return query
 with content_rows as materialized (
  select r||jsonb_build_object('row_version',0,
    'allocated_lifetime_cost',case when quality.complete and quality.currency_count=1 then r->'allocated_lifetime_cost' end,
    'currency',case when quality.currency_count>1 then 'mixed' else r->>'currency' end,
    'measurement_status',concat_ws(' / ',r->>'measurement_status',case when quality.currency_count>1 then '통화 혼합' end),
    'creator_name',cr.name,'platform',a.platform,'campaign_name',ca.name,'format_name',fm.name,'plan_name',p.name,
    'tracking_link_count',jsonb_array_length(c.tracking_links),
    'direction',review.direction,'next_action',coalesce(actions.text,''),'owner',actions.owners,
    'due_at',c.due_at,'reviewed_at',review.occurred_at) data
  from jsonb_array_elements(perf->'contents')r
  join public.gtm_contents c on c.id=(r->>'id')::uuid
  left join public.gtm_creators cr on cr.id=c.creator_id
  left join public.gtm_accounts a on a.id=c.account_id
  left join public.gtm_campaigns ca on ca.id=c.campaign_id
  left join public.gtm_formats fm on fm.id=c.format_id
  left join public.gtm_plans p on p.id=c.plan_id
  left join lateral (select bool_and(cost.incurred_amount is not null) complete,count(distinct cost.base_currency) currency_count
    from public.gtm_costs cost cross join lateral jsonb_array_elements(cost.allocations) allocation
    where cost.archived_at is null and allocation->>'content_id'=c.id::text)quality on true
  left join lateral (select string_agg(i->>'text',' / ') text,string_agg(distinct i->>'owner_id',', ') owners from jsonb_array_elements(c.action_items ||
    case p_group when 'creator' then coalesce((select jsonb_agg(ai) from public.gtm_collaborations co cross join lateral jsonb_array_elements(co.action_items)ai where co.creator_id=c.creator_id and co.archived_at is null),'[]'::jsonb) else '[]'::jsonb end)i where i->>'status'='open')actions on true
  left join lateral (select string_agg(latest.payload->>'direction',' / ') direction,max(latest.occurred_at) occurred_at from
    (select distinct on(entity_id) payload,occurred_at from public.gtm_activities where entity_id in
      (c.id,case p_group when 'creator' then c.creator_id when 'campaign' then c.campaign_id when 'format' then c.format_id end)
      and kind='review_adopted' order by entity_id,occurred_at desc)latest)review on true
 ), grouped as (
  select case p_group when 'creator' then data->>'creator_id' when 'platform' then data->>'platform'
    when 'campaign' then data->>'campaign_id' when 'format' then data->>'format_id' end group_id,
    case p_group when 'creator' then data->>'creator_name' when 'platform' then data->>'platform'
    when 'campaign' then data->>'campaign_name' when 'format' then data->>'format_name' end name,
    data from content_rows
 ), aggregated as (
  select coalesce(group_id,'unassigned') id,coalesce(name,'미지정') name,count(*) contents,
    count(*) filter(where (data->>'tracking_link_count')::integer>0) linked_contents,
    sum((data->>'landing_visitors')::numeric) visitors,sum((data->>'signups')::numeric) signups,
    sum((data->>'onboarding_completed_7d')::numeric) completed,
    bool_and(data->>'allocated_lifetime_cost' is not null and data->>'currency' is not null) cost_complete,
    count(distinct data->>'currency') currency_count,min(data->>'currency') currency,
    sum((data->>'allocated_lifetime_cost')::numeric) cost,
    bool_and(data->>'allocated_lifetime_cost' is not null and data->>'currency' is not null) filter(where (data->>'published_at')::timestamptz>=coalesce((p_options->>'start_at')::timestamptz,now()-interval '30 days') and (data->>'published_at')::timestamptz<coalesce((p_options->>'end_at')::timestamptz,now())) window_cost_complete,
    count(distinct data->>'currency') filter(where (data->>'published_at')::timestamptz>=coalesce((p_options->>'start_at')::timestamptz,now()-interval '30 days') and (data->>'published_at')::timestamptz<coalesce((p_options->>'end_at')::timestamptz,now())) window_currency_count,
    sum((data->>'allocated_lifetime_cost')::numeric) filter(where (data->>'published_at')::timestamptz>=coalesce((p_options->>'start_at')::timestamptz,now()-interval '30 days') and (data->>'published_at')::timestamptz<coalesce((p_options->>'end_at')::timestamptz,now())) window_cost,
    sum((data->>'onboarding_completed_7d')::numeric) filter(where (data->>'published_at')::timestamptz>=coalesce((p_options->>'start_at')::timestamptz,now()-interval '30 days') and (data->>'published_at')::timestamptz<coalesce((p_options->>'end_at')::timestamptz,now())) window_completed,
    string_agg(distinct data->>'measurement_status',' / ') measurement_status,
    string_agg(distinct nullif(data->>'direction',''),' / ') direction,
    string_agg(distinct nullif(data->>'next_action',''),' / ') next_action,
    string_agg(distinct nullif(data->>'owner',''),' / ') owner,
    max(data->>'due_at') due_at,max(data->>'reviewed_at') reviewed_at
  from grouped group by group_id,name
 )
 select data from content_rows where p_group='contents'
 union all
 select jsonb_build_object('id',id,'row_version',0,'name',name,'contents',contents,'linked_contents',linked_contents,
   'visitors',visitors,'signups',signups,'signup_rate',signups/nullif(visitors,0),'completed',completed,
   'cost',case when cost_complete and currency_count=1 then cost end,
   'currency',case when currency_count=1 then currency when currency_count>1 then 'mixed' end,
   'cost_per_signup',case when cost_complete and currency_count=1 then cost/nullif(signups,0) end,
   'cost_per_completion',case when cost_complete and currency_count=1 then cost/nullif(completed,0) end,
   'provisional_cost_per_completion',case when window_cost_complete and window_currency_count=1 then window_cost/nullif(window_completed,0) end,
   'measurement_status',concat_ws(' / ',measurement_status,case when not cost_complete then '비용 일부 누락' end,
      case when currency_count>1 then '통화 혼합' end,case when linked_contents=0 then 'UTM 미연결' when linked_contents<contents then 'UTM 일부 연결' end),
   'direction',direction,'next_action',next_action,'owner',owner,'due_at',due_at,'reviewed_at',reviewed_at)
 from aggregated where p_group<>'contents';
end $$;

create function gtm_view.source_rows(p_source text,p_columns jsonb,p_options jsonb)
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare s gtm_view.sources; rel jsonb; target gtm_view.sources; expression text:='to_jsonb(b)'; joins text:='';
 field jsonb; alias text; idx integer:=0; where_sql text:='';
begin
 select * into strict s from gtm_view.sources where id=p_source;
 if s.relation is null then return query select * from gtm_view.performance_rows(s.performance_group,p_options); return; end if;
 for rel in select value from jsonb_array_elements(gtm_view.relations(p_source)) loop
   if not exists(select 1 from jsonb_array_elements(p_columns)c where split_part(c->>'key','.',1)=rel->>'key') then continue; end if;
   select * into strict target from gtm_view.sources where id=rel->>'source';
   idx:=idx+1; alias:='j'||idx;
   joins:=joins||format(' left join %s %I on %I.id=b.%I',target.relation,alias,alias,rel->>'key');
   expression:=expression||format(' || jsonb_build_object(%L,concat_ws('' · '',to_jsonb(%I)->>''ref'',coalesce(to_jsonb(%I)->>''name'',to_jsonb(%I)->>''title'',to_jsonb(%I)->>''handle'')))',(rel->>'key')||'__display',alias,alias,alias,alias);
   for field in select value from jsonb_array_elements(gtm_view.fields(target.id)) loop
     expression:=expression||format(' || jsonb_build_object(%L,to_jsonb(%I)->%L)',(rel->>'key')||'.'||(field->>'key'),alias,field->>'key');
   end loop;
 end loop;
 if s.enrichment_group is not null and exists(select 1 from jsonb_array_elements(p_columns)c where s.enrichment_fields?(c->>'key')) then
   joins:=joins||format(' left join gtm_view.performance_rows(%L,$1) enrichment on enrichment->>''id''=b.id::text',s.enrichment_group);
   expression:=expression||format(' || coalesce((select jsonb_object_agg(key,enrichment->value) from jsonb_each_text(%L::jsonb)),''{}''::jsonb)',s.enrichment_fields::text);
 end if;
 if exists(select 1 from pg_attribute where attrelid=s.relation and attname='archived_at') then where_sql:=' where b.archived_at is null'; end if;
 return query execute format('select %s from %s b%s%s',expression,s.relation,joins,where_sql) using p_options;
end $$;

create function public.gtm_workspace(p_action text,p_data jsonb default '{}',p_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare credential public.gtm_access_tokens; s gtm_view.sheets; source gtm_view.sources; d jsonb;
 result jsonb; item jsonb; field jsonb; sort_sql text:=''; limit_rows integer; offset_rows integer; key text; writer_result jsonb;
begin
 credential:=gtm_view.credential(p_token);
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>262144 then raise exception 'Invalid request' using errcode='22023'; end if;
 if p_action='catalog' then
   return jsonb_build_object('can_write',credential.can_write,
     'sheets',coalesce((select jsonb_agg(to_jsonb(v) order by position,name) from gtm_view.sheets v),'[]'),
     'sources',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'label',v.label,'entity',v.entity::text,
       'writable',coalesce(v.writer in ('record','pricing'),false),'review',coalesce(v.writer='review',false),'performance',v.performance_group is not null or v.enrichment_group is not null,'fields',gtm_view.fields(v.id),'relations',gtm_view.relations(v.id)) order by v.label)
       from gtm_view.sources v),'[]'));
 end if;
 if p_action='reference_options' then
   select * into source from gtm_view.sources where id=p_data->>'source' and relation is not null;
   if not found then raise exception 'Unknown reference source' using errcode='22023'; end if;
   execute format('select jsonb_build_object(''options'',coalesce(jsonb_agg(jsonb_build_object(''id'',r->>''id'',''label'',concat_ws('' · '',r->>''ref'',coalesce(r->>''name'',r->>''title'',r->>''handle'',r->>''id'')))) ,''[]'')) from (select to_jsonb(t)r from %s t where to_jsonb(t)->>''archived_at'' is null and ($1='''' or position(lower($1) in lower(to_jsonb(t)::text))>0) order by t.ref limit 100)x',source.relation)
     into result using coalesce(p_data->>'search','');
   return result;
 end if;
 if p_action in ('query','save_record','review_outreach') then
   select * into s from gtm_view.sheets where id=(p_data->>'sheet_id')::uuid;
   if not found then raise exception 'Sheet not found' using errcode='P0002'; end if;
   d:=coalesce(p_data->'definition',s.definition);
   perform gtm_view.validate_definition(d);
   if d->>'source'<>s.definition->>'source' then raise exception 'Sheet source cannot change' using errcode='22023'; end if;
   select * into strict source from gtm_view.sources where id=d->>'source';
 end if;
 if p_action='query' then
   limit_rows:=least(greatest(coalesce((p_data->>'limit')::integer,100),1),200);
   offset_rows:=greatest(coalesce((p_data->>'offset')::integer,0),0);
   for item in select value from jsonb_array_elements(d->'sorting') loop
     select f into field from jsonb_array_elements(gtm_view.all_fields(source.id))f where f->>'key'=item->>'key';
     sort_sql:=sort_sql||case when sort_sql='' then '' else ',' end||
       case when field->>'type'='text' then format('lower(r->>%L)',item->>'key') else format('nullif(r->%L,''null''::jsonb)',item->>'key') end||
       case when coalesce((item->>'desc')::boolean,false) then ' desc nulls last' else ' asc nulls last' end;
   end loop;
   sort_sql:=case when sort_sql='' then '' else sort_sql||',' end||'(r->''ref'') asc nulls last,(r->>''id'') asc';
   execute format('with filtered as materialized (
     select r from gtm_view.source_rows($1,$2,$3)r where gtm_view.matches(r,$4)
     and ($5='''' or position(lower($5) in lower((select string_agg(coalesce(r->>(c->>''key''),''''),'' '') from jsonb_array_elements($2)c)))>0)
   ), page as (select r from filtered order by %s limit $6 offset $7)
   select jsonb_build_object(''rows'',coalesce((select jsonb_agg(r) from page),''[]''),''total'',(select count(*) from filtered),''limit'',$6,''offset'',$7,''as_of'',now())',sort_sql)
   into result using source.id,d->'columns',coalesce(p_data->'period','{}'),d->'filters',coalesce(p_data->>'search',''),limit_rows,offset_rows;
   return result;
 end if;
 if not credential.can_write then raise exception 'GTM access is read only' using errcode='42501'; end if;
 if p_action='save_sheet' then
   d:=p_data->'definition'; perform gtm_view.validate_definition(d);
   if p_data->>'id' is null then
     insert into gtm_view.sheets(name,position,definition,updated_by)
       values(btrim(p_data->>'name'),coalesce((select max(position)+1 from gtm_view.sheets),0),d,credential.name) returning * into s;
   else
     select * into s from gtm_view.sheets where id=(p_data->>'id')::uuid for update;
     if not found then raise exception 'Sheet not found' using errcode='P0002'; end if;
     if s.row_version is distinct from (p_data->>'expected_version')::bigint then raise exception '다른 팀원이 시트 구성을 변경했습니다. 최신 구성을 불러온 뒤 다시 저장하세요.' using errcode='40001'; end if;
     if s.definition->>'source'<>d->>'source' then raise exception 'Sheet source cannot change' using errcode='22023'; end if;
     update gtm_view.sheets set name=btrim(p_data->>'name'),definition=d,row_version=row_version+1,updated_by=credential.name,updated_at=now()
       where id=s.id returning * into s;
   end if;
   return to_jsonb(s);
 elsif p_action='delete_sheet' then
   delete from gtm_view.sheets where id=(p_data->>'id')::uuid and row_version=(p_data->>'expected_version')::bigint returning * into s;
   if not found then raise exception 'Sheet changed or was already deleted' using errcode='40001'; end if;
   return jsonb_build_object('deleted',s.id);
 elsif p_action='save_record' then
   if source.writer is null or source.writer='review' then raise exception 'This source is read only' using errcode='42501'; end if;
   if jsonb_typeof(p_data->'values') is distinct from 'object' then raise exception 'values must be an object' using errcode='22023'; end if;
   for key in select jsonb_object_keys(p_data->'values') loop
     if not exists(select 1 from jsonb_array_elements(gtm_view.fields(source.id))f where f->>'key'=key and (f->>'writable')::boolean) then
       raise exception 'Read-only field: %',key using errcode='42501'; end if;
   end loop;
   if p_data->>'record_id' is not null then
     execute format('select to_jsonb(b) from %s b where b.id=$1',source.relation) into writer_result using (p_data->>'record_id')::uuid;
     if writer_result is null then raise exception 'Record not in source' using errcode='P0002'; end if;
   end if;
   if source.writer='pricing' then
     return public.gtm_compensation_strategy_save(p_token,(p_data->>'record_id')::uuid,(p_data->>'expected_version')::bigint,p_data->'values',(p_data->>'request_id')::uuid);
   end if;
   return public.gtm_api(p_token,'save',replace(source.entity::text,'public.',''),(p_data->>'record_id')::uuid,
     (p_data->>'expected_version')::bigint,p_data->'values',(p_data->>'request_id')::uuid);
 elsif p_action='review_outreach' then
   if source.writer is distinct from 'review' then raise exception 'Not an outreach review source' using errcode='22023'; end if;
   if p_data->>'decision'=any(array['approve','revise','request_revision']) and
      (jsonb_typeof(p_data->'subject') is distinct from 'string' or jsonb_typeof(p_data->'body') is distinct from 'string'
       or coalesce(btrim(p_data->>'subject'),'')='' or coalesce(btrim(p_data->>'body'),'')='') then
     raise exception '제목과 본문을 입력하세요.' using errcode='22023'; end if;
   return public.gtm_outreach_review(p_token,(p_data->>'record_id')::uuid,(p_data->>'expected_version')::bigint,
     p_data->>'decision',(p_data->>'request_id')::uuid,p_data->>'subject',p_data->>'body',
     nullif(p_data->>'scheduled_at','')::timestamptz,p_data->>'review_note',credential.name);
 end if;
 raise exception 'Unknown workspace action' using errcode='22023';
end $$;

revoke all on all functions in schema gtm_view from public,anon,authenticated;
revoke all on function public.gtm_workspace(text,jsonb,text) from public;
grant execute on function public.gtm_workspace(text,jsonb,text) to anon,authenticated,service_role;

-- Initial editable workspace definitions, matching the live workbooks on 2026-09-21.
-- Shared labels are seed metadata; sheet definitions remain independently editable.
do $seed$
declare labels jsonb := $labels${
  "id": "Record ID",
  "row_version": "Row Version",
  "updated_at": "Updated At",
  "ref": "Ref",
  "name": "Name",
  "owner_id": "Owner",
  "sheet_primary_platform": "Primary Platform",
  "sheet_primary_handle": "Primary Handle",
  "sheet_primary_profile_url": "Primary Profile URL",
  "sheet_primary_email": "Primary Email",
  "platforms": "Platforms",
  "activity_regions": "Activity Regions (comma-separated)",
  "languages": "Languages (comma-separated)",
  "content_topics": "Content Topics (comma-separated)",
  "total_followers": "Total Followers (May Overlap Across Platforms)",
  "content_count_365d": "Posts in Last 365 Days (Cross-posts May Overlap)",
  "latest_post_at": "Latest Post At",
  "audience_summary": "Audience Evidence Summary",
  "outreach_score": "Outreach Score (1-5)",
  "outreach_status": "Outreach Status",
  "last_contact_at": "Last Contact At",
  "current_collaboration_ref": "Active Collaboration Ref",
  "current_collaboration_title": "Active Collaboration",
  "current_collaboration_status": "Active Collaboration Status",
  "sheet_current_plan_ref": "Active Plan Ref",
  "sheet_current_plan_name": "Active Plan",
  "next_action": "Next Action",
  "next_action_due_at": "Next Action Due At",
  "data_status": "Data Status",
  "profile_metrics_as_of": "Account Metrics As Of",
  "refresh_fields_text": "Fields to Refresh",
  "account_summary": "Platform Account Detail",
  "contact_summary": "Contact Method Detail",
  "description": "Content / Background",
  "do_not_contact": "Do Not Contact",
  "notes": "Notes",
  "relationship_status": "Relationship Status",
  "sheet_first_outreach_at": "First Outreach At",
  "sheet_first_reply_at": "First Reply At",
  "collaboration_count": "Collaborations",
  "agreed_collaboration_count": "Agreed Collaborations",
  "closed_collaboration_count": "Closed Collaborations",
  "published_content_count": "Published Contents",
  "last_published_at": "Last Published At",
  "_creator_visitors": "Attributed Visitors (Selected Period)",
  "_creator_signups": "Attributed Signups (Selected Period)",
  "_creator_completed": "Completed Onboarding Within 7 Days",
  "_creator_cost": "Content-Allocated Lifetime Cost",
  "_creator_currency": "Content Cost Currency",
  "_creator_cpa": "Provisional Cost per Completion",
  "_creator_measurement": "Performance Data Status",
  "lifetime_incurred_cost": "Relationship Lifetime Incurred Cost",
  "lifetime_committed_cash": "Relationship Lifetime Committed Cash",
  "lifetime_net_paid": "Relationship Lifetime Net Paid",
  "relationship_cost_currency": "Relationship Cost Currency",
  "incomplete_cost_items": "Incomplete Cost Items",
  "latest_direction": "Latest Adopted Direction",
  "latest_direction_reason": "Latest Direction Reason",
  "collaboration_history_summary": "Collaboration History",
  "content_history_summary": "Content History",
  "status": "Status",
  "default_campaign_id": "Default Campaign Ref",
  "default_outreach_template_id": "Default Outreach Template Ref",
  "hook": "Hook",
  "shot_sequence": "Shot Sequence",
  "required_moment": "Required Product Moment",
  "caption_template": "Caption Template",
  "example_links": "Example Links (comma-separated)",
  "replicate_rule": "Replicate Rule",
  "kill_rule": "Kill Rule",
  "target_creator_profile": "Target Creator Profile",
  "cold_outreach_angle": "Cold Outreach Angle",
  "guide_ref": "Guide URL",
  "guide_version": "Guide Version",
  "content_use_count": "Content Uses",
  "campaign_id": "Campaign Ref",
  "channel": "Channel",
  "language": "Language",
  "subject_template": "Subject Template",
  "opening_template": "DM / Email Opening",
  "value_proposition": "Value Proposition",
  "ask": "Ask / Deliverables",
  "offer_structure": "Offer Structure",
  "follow_up_template": "Follow-up Template",
  "link_refs": "Links (comma-separated)",
  "usage_notes": "Usage Notes",
  "template_version": "Template Version",
  "default_format_count": "Default Formats",
  "default_format_summary": "Default Format List",
  "draft_count": "Drafts Created",
  "sent_count": "Messages Sent",
  "sent_thread_count": "Sent Threads",
  "replied_thread_count": "Replied Threads",
  "response_rate": "Response Rate (%)",
  "last_sent_at": "Last Sent At",
  "last_reply_at": "Last Reply At",
  "creator_ref": "Creator Ref",
  "creator_name": "Creator",
  "primary_platform": "Primary Platform",
  "primary_handle": "Primary Handle",
  "recipient_email": "Recipient Email",
  "outreach_template_ref": "Template Ref",
  "outreach_template_name": "Template",
  "collaboration_ref": "Collaboration Ref",
  "collaboration_title": "Collaboration",
  "plan_ref": "Plan Ref",
  "plan_name": "Plan",
  "sender_email": "Sender Email",
  "selection_reason": "Why This Template",
  "personalization_evidence": "Personalization Evidence",
  "subject": "Final Subject",
  "body": "Final Email Body",
  "review_action": "Review Decision",
  "scheduled_at": "Send At (ISO, blank = now)",
  "review_note": "Review Note",
  "approved_by": "Approved By",
  "approved_at": "Approved At",
  "attempt_count": "Send Attempts",
  "last_error": "Last Send Error",
  "sent_at": "Sent At",
  "replied_at": "First Reply At",
  "provider_message_id": "Gmail Message ID",
  "provider_thread_id": "Gmail Thread ID",
  "created_by": "Prepared By",
  "created_at": "Prepared At",
  "occurred_at": "Occurred At",
  "direction": "Direction",
  "kind": "Event",
  "counterparty": "Counterparty",
  "thread_id": "Thread ID",
  "source_ref": "Evidence / Source",
  "provider": "Provider",
  "external_id": "External Message ID",
  "creator_outreach_status": "Current Outreach Status",
  "title": "Title",
  "creator_id": "Creator Ref",
  "plan_id": "Plan Ref",
  "due_at": "Due At (ISO)",
  "terms": "Terms",
  "_next": "Open Actions",
  "_direction": "Adopted Direction",
  "collaboration_id": "Collaboration Ref",
  "format_id": "Format Ref",
  "production_status": "Production Status",
  "publish_status": "Publication Status",
  "post_url": "Post URL",
  "_signups": "Attributed Signups (Selected Period)",
  "_completed": "Completed Onboarding Within 7 Days",
  "account_id": "Account Ref",
  "published_at": "Published At (ISO)",
  "_visitors": "Attributed Visitors",
  "_cost": "Allocated Lifetime Cost",
  "_cpa": "Provisional Cost per Completion",
  "_currency": "Cost Currency",
  "_measurement": "Measurement Status",
  "target_market": "Target Market",
  "target_audience": "Target Audience",
  "cash_budget": "Cash Budget",
  "currency": "Currency",
  "goal_metric": "Goal Metric",
  "goal_value": "Goal Value",
  "available_cash": "Available Cash",
  "committed_cash": "Committed Cash",
  "brief": "Plan Summary",
  "audience_brief": "Audience",
  "paid_amount": "Paid Amount",
  "performance_conclusion": "Performance Conclusion",
  "views": "Views",
  "likes": "Likes",
  "comments": "Comments",
  "comments_non_author": "Comments Excluding Creator",
  "recommended_label": "Current Recommendation",
  "calculation_summary": "Calculation",
  "base_fee": "Base Upload Fee",
  "measurement_window_days": "Measurement Days",
  "amount_per_unit": "Amount Per Unit",
  "views_per_unit": "Views Per Unit",
  "recommendation_reason": "Why Recommended",
  "recommended_at": "Recommended At",
  "platform_metrics_due_at": "Measurement Due At",
  "estimated_payable": "Estimated Payable",
  "finalized_payable": "Finalized Payable"
}$labels$::jsonb;
begin
insert into gtm_view.sources(id,label,relation,entity,writer,field_labels) values ('creators','Creator Directory','public.gtm_creator_directory_sheet_v1'::regclass,'public.gtm_creators'::regclass,'record',labels);
insert into gtm_view.sources(id,label,relation,entity,writer,field_labels) values ('connected','Connected Creators','public.gtm_connected_creator_sheet_v1'::regclass,'public.gtm_creators'::regclass,null,labels);
insert into gtm_view.sources(id,label,relation,entity,writer,field_labels) values ('pricing','Pricing Strategies','public.gtm_compensation_strategy_sheet_v1'::regclass,'public.gtm_compensation_strategies'::regclass,'pricing',labels);
insert into gtm_view.sources(id,label,relation,entity,writer,field_labels) values ('templates','Outreach Templates','public.gtm_outreach_template_overview'::regclass,'public.gtm_outreach_templates'::regclass,'record',labels);
insert into gtm_view.sources(id,label,relation,entity,writer,field_labels) values ('review','Outreach Review','public.gtm_outreach_review_sheet_v1'::regclass,'public.gtm_outreach_dispatches'::regclass,'review',labels);
insert into gtm_view.sources(id,label,relation,entity,writer,field_labels) values ('outreach','Outreach Log','public.gtm_outreach_sheet_v1'::regclass,'public.gtm_activities'::regclass,null,labels);
insert into gtm_view.sources(id,label,relation,entity,writer,field_labels) values ('contents','콘텐츠','public.gtm_content_sheet_v1'::regclass,'public.gtm_contents'::regclass,'record',labels);
insert into gtm_view.sources(id,label,relation,entity,writer,field_labels) values ('collaborations','협업','public.gtm_collaborations'::regclass,'public.gtm_collaborations'::regclass,'record',labels);
insert into gtm_view.sources(id,label,relation,entity,writer,field_labels) values ('plans','집행','public.gtm_plan_summary'::regclass,'public.gtm_plans'::regclass,'record',labels);
insert into gtm_view.sources(id,label,relation,entity,writer,field_labels) values ('campaigns','캠페인','public.gtm_campaigns'::regclass,'public.gtm_campaigns'::regclass,'record',labels);
insert into gtm_view.sources(id,label,relation,entity,writer,field_labels) values ('formats','Format Bank','public.gtm_format_overview'::regclass,'public.gtm_formats'::regclass,'record',labels);
insert into gtm_view.sources(id,label,relation,entity,writer,field_labels) values ('accounts','플랫폼 계정','public.gtm_account_overview'::regclass,'public.gtm_accounts'::regclass,'record',labels);
insert into gtm_view.sources(id,label,relation,entity,writer,field_labels) values ('costs','비용 원장','public.gtm_costs'::regclass,'public.gtm_costs'::regclass,'record',labels);
insert into gtm_view.sources(id,label,relation,entity,writer,field_labels) values ('metrics','성과 관측','public.gtm_metric_snapshots'::regclass,'public.gtm_metric_snapshots'::regclass,'record',labels);
end $seed$;
insert into gtm_view.sources(id,label,performance_group,virtual_fields) values ('overall','전체 성과','daily','[{"key":"day","label":"날짜","type":"date","writable":false},{"key":"landing_visitors","label":"유입","type":"number","writable":false},{"key":"signups","label":"회원가입","type":"number","writable":false},{"key":"onboarding_completion_events","label":"온보딩 완료","type":"number","writable":false}]'::jsonb);
insert into gtm_view.sources(id,label,performance_group,virtual_fields) values ('feed','_Performance Feed','contents','[{"key":"title","label":"콘텐츠","type":"text","writable":false},{"key":"creator_name","label":"크리에이터","type":"text","writable":false},{"key":"platform","label":"플랫폼","type":"text","writable":false},{"key":"campaign_name","label":"캠페인","type":"text","writable":false},{"key":"format_name","label":"포맷","type":"text","writable":false},{"key":"plan_name","label":"집행","type":"text","writable":false},{"key":"landing_visitors","label":"유입","type":"number","writable":false},{"key":"signups","label":"회원가입","type":"number","writable":false},{"key":"onboarding_completed_7d","label":"D7 완료","type":"number","writable":false},{"key":"allocated_lifetime_cost","label":"발생 비용","type":"number","writable":false},{"key":"currency","label":"통화","type":"text","writable":false},{"key":"provisional_cost_per_completion","label":"잠정 완료당 비용","type":"number","writable":false},{"key":"tracking_link_count","label":"UTM 링크 수","type":"number","writable":false},{"key":"measurement_status","label":"측정 상태","type":"text","writable":false},{"key":"direction","label":"방향","type":"text","writable":false},{"key":"next_action","label":"Next action","type":"text","writable":false},{"key":"owner","label":"담당","type":"text","writable":false},{"key":"due_at","label":"기한","type":"date","writable":false},{"key":"reviewed_at","label":"판단 기준일","type":"date","writable":false},{"key":"post_url","label":"게시 URL","type":"text","writable":false},{"key":"published_at","label":"게시일","type":"date","writable":false}]'::jsonb);
insert into gtm_view.sources(id,label,performance_group,virtual_fields) values ('performance_creator','크리에이터별','creator','[{"key":"name","label":"구분","type":"text","writable":false},{"key":"visitors","label":"유입","type":"number","writable":false},{"key":"signups","label":"회원가입 수","type":"number","writable":false},{"key":"signup_rate","label":"가입률","type":"number","writable":false},{"key":"completed","label":"D7 완료","type":"number","writable":false},{"key":"cost","label":"발생 비용","type":"number","writable":false},{"key":"currency","label":"통화","type":"text","writable":false},{"key":"cost_per_signup","label":"가입당 비용","type":"number","writable":false},{"key":"cost_per_completion","label":"D7 완료당 비용","type":"number","writable":false},{"key":"linked_contents","label":"UTM 연결 콘텐츠","type":"number","writable":false},{"key":"contents","label":"콘텐츠 수","type":"number","writable":false},{"key":"measurement_status","label":"측정 상태","type":"text","writable":false},{"key":"direction","label":"방향","type":"text","writable":false},{"key":"next_action","label":"Next action","type":"text","writable":false},{"key":"owner","label":"담당","type":"text","writable":false},{"key":"due_at","label":"기한","type":"date","writable":false},{"key":"reviewed_at","label":"판단 기준일","type":"date","writable":false}]'::jsonb);
insert into gtm_view.sources(id,label,performance_group,virtual_fields) values ('performance_platform','플랫폼별','platform','[{"key":"name","label":"구분","type":"text","writable":false},{"key":"visitors","label":"유입","type":"number","writable":false},{"key":"signups","label":"회원가입 수","type":"number","writable":false},{"key":"signup_rate","label":"가입률","type":"number","writable":false},{"key":"completed","label":"D7 완료","type":"number","writable":false},{"key":"cost","label":"발생 비용","type":"number","writable":false},{"key":"currency","label":"통화","type":"text","writable":false},{"key":"cost_per_signup","label":"가입당 비용","type":"number","writable":false},{"key":"cost_per_completion","label":"D7 완료당 비용","type":"number","writable":false},{"key":"linked_contents","label":"UTM 연결 콘텐츠","type":"number","writable":false},{"key":"contents","label":"콘텐츠 수","type":"number","writable":false},{"key":"measurement_status","label":"측정 상태","type":"text","writable":false},{"key":"direction","label":"방향","type":"text","writable":false},{"key":"next_action","label":"Next action","type":"text","writable":false},{"key":"owner","label":"담당","type":"text","writable":false},{"key":"due_at","label":"기한","type":"date","writable":false},{"key":"reviewed_at","label":"판단 기준일","type":"date","writable":false}]'::jsonb);
insert into gtm_view.sources(id,label,performance_group,virtual_fields) values ('performance_campaign','캠페인별','campaign','[{"key":"name","label":"구분","type":"text","writable":false},{"key":"visitors","label":"유입","type":"number","writable":false},{"key":"signups","label":"회원가입 수","type":"number","writable":false},{"key":"signup_rate","label":"가입률","type":"number","writable":false},{"key":"completed","label":"D7 완료","type":"number","writable":false},{"key":"cost","label":"발생 비용","type":"number","writable":false},{"key":"currency","label":"통화","type":"text","writable":false},{"key":"cost_per_signup","label":"가입당 비용","type":"number","writable":false},{"key":"cost_per_completion","label":"D7 완료당 비용","type":"number","writable":false},{"key":"linked_contents","label":"UTM 연결 콘텐츠","type":"number","writable":false},{"key":"contents","label":"콘텐츠 수","type":"number","writable":false},{"key":"measurement_status","label":"측정 상태","type":"text","writable":false},{"key":"direction","label":"방향","type":"text","writable":false},{"key":"next_action","label":"Next action","type":"text","writable":false},{"key":"owner","label":"담당","type":"text","writable":false},{"key":"due_at","label":"기한","type":"date","writable":false},{"key":"reviewed_at","label":"판단 기준일","type":"date","writable":false}]'::jsonb);
insert into gtm_view.sources(id,label,performance_group,virtual_fields) values ('performance_format','포맷별','format','[{"key":"name","label":"구분","type":"text","writable":false},{"key":"visitors","label":"유입","type":"number","writable":false},{"key":"signups","label":"회원가입 수","type":"number","writable":false},{"key":"signup_rate","label":"가입률","type":"number","writable":false},{"key":"completed","label":"D7 완료","type":"number","writable":false},{"key":"cost","label":"발생 비용","type":"number","writable":false},{"key":"currency","label":"통화","type":"text","writable":false},{"key":"cost_per_signup","label":"가입당 비용","type":"number","writable":false},{"key":"cost_per_completion","label":"D7 완료당 비용","type":"number","writable":false},{"key":"linked_contents","label":"UTM 연결 콘텐츠","type":"number","writable":false},{"key":"contents","label":"콘텐츠 수","type":"number","writable":false},{"key":"measurement_status","label":"측정 상태","type":"text","writable":false},{"key":"direction","label":"방향","type":"text","writable":false},{"key":"next_action","label":"Next action","type":"text","writable":false},{"key":"owner","label":"담당","type":"text","writable":false},{"key":"due_at","label":"기한","type":"date","writable":false},{"key":"reviewed_at","label":"판단 기준일","type":"date","writable":false}]'::jsonb);
insert into gtm_view.sheets(id,name,position,definition,updated_by) values (md5('harper-gtm:overall')::uuid,'전체 성과',0,'{"source":"overall","columns":[{"key":"day","label":"날짜","width":140},{"key":"landing_visitors","label":"유입","width":140},{"key":"signups","label":"회원가입","width":140},{"key":"onboarding_completion_events","label":"온보딩 완료","width":140}],"filters":[],"sorting":[],"rowHeight":36,"rowHeights":{}}'::jsonb,'workspace setup');
insert into gtm_view.sheets(id,name,position,definition,updated_by) values (md5('harper-gtm:pricing')::uuid,'Pricing Strategies',1,'{"source":"pricing","columns":[{"key":"recommended_label","label":"Current Recommendation","width":180},{"key":"name","label":"Name","width":180},{"key":"status","label":"Status","width":180},{"key":"pricing_model","label":"pricing model","width":180},{"key":"calculation_summary","label":"Calculation","width":180},{"key":"base_fee","label":"Base Upload Fee","width":180},{"key":"measurement_window_days","label":"Measurement Days","width":180},{"key":"views_per_unit","label":"Views Per Unit","width":180},{"key":"amount_per_unit","label":"Amount Per Unit","width":180},{"key":"currency","label":"Currency","width":180},{"key":"assigned_content_count","label":"assigned content count","width":180},{"key":"settled_content_count","label":"settled content count","width":180},{"key":"notes","label":"Notes","width":280},{"key":"recommendation_reason","label":"Why Recommended","width":180},{"key":"recommended_at","label":"Recommended At","width":180},{"key":"version","label":"version","width":180},{"key":"ref","label":"Ref","width":80}],"filters":[],"sorting":[],"rowHeight":36,"rowHeights":{}}'::jsonb,'workspace setup');
insert into gtm_view.sheets(id,name,position,definition,updated_by) values (md5('harper-gtm:creators')::uuid,'Creator Directory',2,'{"source":"creators","columns":[{"key":"ref","label":"Ref","width":80},{"key":"name","label":"Name","width":180},{"key":"owner_id","label":"Owner","width":180},{"key":"sheet_primary_platform","label":"Primary Platform","width":180},{"key":"sheet_primary_handle","label":"Primary Handle","width":180},{"key":"sheet_primary_profile_url","label":"Primary Profile URL","width":180},{"key":"sheet_primary_email","label":"Primary Email","width":180},{"key":"platforms","label":"Platforms","width":180},{"key":"activity_regions","label":"Activity Regions (comma-separated)","width":180},{"key":"languages","label":"Languages (comma-separated)","width":180},{"key":"content_topics","label":"Content Topics (comma-separated)","width":180},{"key":"total_followers","label":"Total Followers (May Overlap Across Platforms)","width":180},{"key":"content_count_365d","label":"Posts in Last 365 Days (Cross-posts May Overlap)","width":180},{"key":"latest_post_at","label":"Latest Post At","width":180},{"key":"audience_summary","label":"Audience Evidence Summary","width":180},{"key":"outreach_score","label":"Outreach Score (1-5)","width":180},{"key":"outreach_status","label":"Outreach Status","width":180},{"key":"last_contact_at","label":"Last Contact At","width":180},{"key":"current_collaboration_ref","label":"Active Collaboration Ref","width":180},{"key":"current_collaboration_title","label":"Active Collaboration","width":180},{"key":"current_collaboration_status","label":"Active Collaboration Status","width":180},{"key":"sheet_current_plan_ref","label":"Active Plan Ref","width":180},{"key":"sheet_current_plan_name","label":"Active Plan","width":180},{"key":"next_action","label":"Next Action","width":180},{"key":"next_action_due_at","label":"Next Action Due At","width":180},{"key":"data_status","label":"Data Status","width":180},{"key":"profile_metrics_as_of","label":"Account Metrics As Of","width":180},{"key":"refresh_fields_text","label":"Fields to Refresh","width":180},{"key":"account_summary","label":"Platform Account Detail","width":180},{"key":"contact_summary","label":"Contact Method Detail","width":180},{"key":"description","label":"Content / Background","width":280},{"key":"do_not_contact","label":"Do Not Contact","width":180},{"key":"notes","label":"Notes","width":280}],"filters":[],"sorting":[],"rowHeight":36,"rowHeights":{}}'::jsonb,'workspace setup');
insert into gtm_view.sheets(id,name,position,definition,updated_by) values (md5('harper-gtm:templates')::uuid,'Outreach Templates',3,'{"source":"templates","columns":[{"key":"ref","label":"Ref","width":80},{"key":"name","label":"Name","width":180},{"key":"status","label":"Status","width":180},{"key":"campaign_id","label":"Campaign Ref","width":180},{"key":"channel","label":"Channel","width":180},{"key":"language","label":"Language","width":180},{"key":"target_creator_profile","label":"Target Creator Profile","width":180},{"key":"subject_template","label":"Subject Template","width":180},{"key":"opening_template","label":"DM / Email Opening","width":180},{"key":"value_proposition","label":"Value Proposition","width":180},{"key":"ask","label":"Ask / Deliverables","width":180},{"key":"offer_structure","label":"Offer Structure","width":180},{"key":"follow_up_template","label":"Follow-up Template","width":180},{"key":"link_refs","label":"Links (comma-separated)","width":180},{"key":"usage_notes","label":"Usage Notes","width":180},{"key":"template_version","label":"Template Version","width":180},{"key":"default_format_count","label":"Default Formats","width":180},{"key":"default_format_summary","label":"Default Format List","width":180},{"key":"draft_count","label":"Drafts Created","width":180},{"key":"sent_count","label":"Messages Sent","width":180},{"key":"sent_thread_count","label":"Sent Threads","width":180},{"key":"replied_thread_count","label":"Replied Threads","width":180},{"key":"response_rate","label":"Response Rate (%)","width":180},{"key":"last_sent_at","label":"Last Sent At","width":180},{"key":"last_reply_at","label":"Last Reply At","width":180},{"key":"owner_id","label":"Owner","width":180}],"filters":[],"sorting":[],"rowHeight":36,"rowHeights":{}}'::jsonb,'workspace setup');
insert into gtm_view.sheets(id,name,position,definition,updated_by) values (md5('harper-gtm:review')::uuid,'Outreach Review',4,'{"source":"review","columns":[{"key":"creator_name","label":"Creator","width":180},{"key":"primary_profile_url","label":"primary profile url","width":180},{"key":"recipient_email","label":"Recipient Email","width":180},{"key":"outreach_template_name","label":"Template","width":180},{"key":"compensation_strategy_name","label":"compensation strategy name","width":180},{"key":"estimated_views","label":"estimated views","width":180},{"key":"estimated_cost","label":"estimated cost","width":180},{"key":"compensation_currency","label":"compensation currency","width":180},{"key":"subject","label":"Final Subject","width":280},{"key":"body","label":"Final Email Body","width":280},{"key":"status","label":"Status","width":180},{"key":"personalization_evidence","label":"Personalization Evidence","width":180},{"key":"scheduled_at","label":"Send At (ISO, blank = now)","width":180},{"key":"review_note","label":"Review Note","width":180},{"key":"sender_email","label":"Sender Email","width":180},{"key":"plan_name","label":"Plan","width":180},{"key":"collaboration_title","label":"Collaboration","width":180},{"key":"template_version","label":"Template Version","width":180},{"key":"approved_by","label":"Approved By","width":180},{"key":"approved_at","label":"Approved At","width":180},{"key":"attempt_count","label":"Send Attempts","width":180},{"key":"last_error","label":"Last Send Error","width":180},{"key":"sent_at","label":"Sent At","width":180},{"key":"ref","label":"Ref","width":80}],"filters":[],"sorting":[],"rowHeight":36,"rowHeights":{}}'::jsonb,'workspace setup');
insert into gtm_view.sheets(id,name,position,definition,updated_by) values (md5('harper-gtm:feed')::uuid,'_Performance Feed',5,'{"source":"feed","columns":[{"key":"title","label":"콘텐츠","width":220},{"key":"creator_name","label":"크리에이터","width":220},{"key":"platform","label":"플랫폼","width":220},{"key":"campaign_name","label":"캠페인","width":220},{"key":"format_name","label":"포맷","width":220},{"key":"plan_name","label":"집행","width":220},{"key":"landing_visitors","label":"유입","width":140},{"key":"signups","label":"회원가입","width":140},{"key":"onboarding_completed_7d","label":"D7 완료","width":140},{"key":"allocated_lifetime_cost","label":"발생 비용","width":140},{"key":"currency","label":"통화","width":220},{"key":"provisional_cost_per_completion","label":"잠정 완료당 비용","width":140},{"key":"tracking_link_count","label":"UTM 링크 수","width":140},{"key":"measurement_status","label":"측정 상태","width":220},{"key":"direction","label":"방향","width":220},{"key":"next_action","label":"Next action","width":220},{"key":"owner","label":"담당","width":220},{"key":"due_at","label":"기한","width":140},{"key":"reviewed_at","label":"판단 기준일","width":140},{"key":"post_url","label":"게시 URL","width":220},{"key":"published_at","label":"게시일","width":140}],"filters":[],"sorting":[],"rowHeight":36,"rowHeights":{}}'::jsonb,'workspace setup');
insert into gtm_view.sheets(id,name,position,definition,updated_by) values (md5('harper-gtm:connected')::uuid,'Connected Creators',6,'{"source":"connected","columns":[{"key":"ref","label":"Ref","width":80},{"key":"name","label":"Name","width":180},{"key":"owner_id","label":"Owner","width":180},{"key":"sheet_primary_platform","label":"Primary Platform","width":180},{"key":"sheet_primary_handle","label":"Primary Handle","width":180},{"key":"sheet_primary_profile_url","label":"Primary Profile URL","width":180},{"key":"sheet_primary_email","label":"Primary Email","width":180},{"key":"activity_regions","label":"Activity Regions (comma-separated)","width":180},{"key":"languages","label":"Languages (comma-separated)","width":180},{"key":"content_topics","label":"Content Topics (comma-separated)","width":180},{"key":"total_followers","label":"Total Followers (May Overlap Across Platforms)","width":180},{"key":"relationship_status","label":"Relationship Status","width":180},{"key":"sheet_first_outreach_at","label":"First Outreach At","width":180},{"key":"sheet_first_reply_at","label":"First Reply At","width":180},{"key":"last_contact_at","label":"Last Contact At","width":180},{"key":"collaboration_count","label":"Collaborations","width":180},{"key":"agreed_collaboration_count","label":"Agreed Collaborations","width":180},{"key":"closed_collaboration_count","label":"Closed Collaborations","width":180},{"key":"current_collaboration_ref","label":"Active Collaboration Ref","width":180},{"key":"current_collaboration_title","label":"Active Collaboration","width":180},{"key":"current_collaboration_status","label":"Active Collaboration Status","width":180},{"key":"sheet_current_plan_ref","label":"Active Plan Ref","width":180},{"key":"sheet_current_plan_name","label":"Active Plan","width":180},{"key":"next_action","label":"Next Action","width":180},{"key":"next_action_due_at","label":"Next Action Due At","width":180},{"key":"published_content_count","label":"Published Contents","width":180},{"key":"last_published_at","label":"Last Published At","width":180},{"key":"lifetime_incurred_cost","label":"Relationship Lifetime Incurred Cost","width":180},{"key":"lifetime_committed_cash","label":"Relationship Lifetime Committed Cash","width":180},{"key":"lifetime_net_paid","label":"Relationship Lifetime Net Paid","width":180},{"key":"relationship_cost_currency","label":"Relationship Cost Currency","width":180},{"key":"incomplete_cost_items","label":"Incomplete Cost Items","width":180},{"key":"latest_direction","label":"Latest Adopted Direction","width":180},{"key":"latest_direction_reason","label":"Latest Direction Reason","width":180},{"key":"collaboration_history_summary","label":"Collaboration History","width":180},{"key":"content_history_summary","label":"Content History","width":180},{"key":"data_status","label":"Data Status","width":180},{"key":"refresh_fields_text","label":"Fields to Refresh","width":180},{"key":"notes","label":"Notes","width":280}],"filters":[],"sorting":[],"rowHeight":36,"rowHeights":{}}'::jsonb,'workspace setup');
insert into gtm_view.sheets(id,name,position,definition,updated_by) values (md5('harper-gtm:contents')::uuid,'콘텐츠',7,'{"source":"contents","columns":[{"key":"title","label":"Title","width":180},{"key":"creator_name","label":"Creator","width":180},{"key":"post_url","label":"Post URL","width":180},{"key":"platform","label":"platform","width":180},{"key":"handle","label":"handle","width":180},{"key":"published_at","label":"Published At (ISO)","width":180},{"key":"views","label":"Views","width":180},{"key":"likes","label":"Likes","width":180},{"key":"comments","label":"Comments","width":180},{"key":"comments_non_author","label":"Comments Excluding Creator","width":180},{"key":"platform_metrics_as_of","label":"platform metrics as of","width":180},{"key":"paid_amount","label":"Paid Amount","width":180},{"key":"performance_conclusion","label":"Performance Conclusion","width":180},{"key":"settlement_status","label":"settlement status","width":180},{"key":"estimated_payable","label":"Estimated Payable","width":180},{"key":"finalized_payable","label":"Finalized Payable","width":180},{"key":"compensation_currency","label":"compensation currency","width":180},{"key":"platform_metrics_due_at","label":"Measurement Due At","width":180},{"key":"compensation_strategy_name","label":"compensation strategy name","width":180},{"key":"compensation_base_fee","label":"compensation base fee","width":180},{"key":"compensation_measurement_window_days","label":"compensation measurement window days","width":180},{"key":"compensation_views_per_unit","label":"compensation views per unit","width":180},{"key":"compensation_amount_per_unit","label":"compensation amount per unit","width":180},{"key":"platform_metrics_last_collected_at","label":"platform metrics last collected at","width":180},{"key":"platform_metrics_last_error","label":"platform metrics last error","width":180},{"key":"platform_metrics_finalized_at","label":"platform metrics finalized at","width":180},{"key":"collaboration_title","label":"Collaboration","width":180},{"key":"campaign_name","label":"campaign name","width":180},{"key":"format_name","label":"format name","width":180},{"key":"plan_name","label":"Plan","width":180},{"key":"production_status","label":"Production Status","width":180},{"key":"publish_status","label":"Publication Status","width":180},{"key":"ref","label":"Ref","width":80}],"filters":[],"sorting":[],"rowHeight":36,"rowHeights":{}}'::jsonb,'workspace setup');
insert into gtm_view.sheets(id,name,position,definition,updated_by) values (md5('harper-gtm:outreach')::uuid,'Outreach Log',8,'{"source":"outreach","columns":[{"key":"ref","label":"Ref","width":80},{"key":"occurred_at","label":"Occurred At","width":180},{"key":"direction","label":"Direction","width":180},{"key":"kind","label":"Event","width":180},{"key":"creator_ref","label":"Creator Ref","width":180},{"key":"creator_name","label":"Creator","width":180},{"key":"primary_platform","label":"Primary Platform","width":180},{"key":"primary_handle","label":"Primary Handle","width":180},{"key":"collaboration_ref","label":"Collaboration Ref","width":180},{"key":"collaboration_title","label":"Collaboration","width":180},{"key":"plan_ref","label":"Plan Ref","width":180},{"key":"plan_name","label":"Plan","width":180},{"key":"channel","label":"Channel","width":180},{"key":"counterparty","label":"Counterparty","width":180},{"key":"subject","label":"Final Subject","width":280},{"key":"body","label":"Final Email Body","width":280},{"key":"thread_id","label":"Thread ID","width":180},{"key":"source_ref","label":"Evidence / Source","width":180},{"key":"provider","label":"Provider","width":180},{"key":"external_id","label":"External Message ID","width":180},{"key":"outreach_template_ref","label":"Template Ref","width":180},{"key":"outreach_template_name","label":"Template","width":180},{"key":"creator_outreach_status","label":"Current Outreach Status","width":180},{"key":"next_action","label":"Next Action","width":180},{"key":"next_action_due_at","label":"Next Action Due At","width":180},{"key":"created_by","label":"Prepared By","width":180}],"filters":[],"sorting":[],"rowHeight":36,"rowHeights":{}}'::jsonb,'workspace setup');
insert into gtm_view.sheets(id,name,position,definition,updated_by) values (md5('harper-gtm:collaborations')::uuid,'협업',9,'{"source":"collaborations","columns":[{"key":"ref","label":"Ref","width":80},{"key":"title","label":"Title","width":180},{"key":"creator_id","label":"Creator Ref","width":180},{"key":"plan_id","label":"Plan Ref","width":180},{"key":"status","label":"Status","width":180},{"key":"owner_id","label":"Owner","width":180},{"key":"due_at","label":"Due At (ISO)","width":180},{"key":"terms","label":"Terms","width":180}],"filters":[],"sorting":[],"rowHeight":36,"rowHeights":{}}'::jsonb,'workspace setup');
insert into gtm_view.sheets(id,name,position,definition,updated_by) values (md5('harper-gtm:plans')::uuid,'집행',10,'{"source":"plans","columns":[{"key":"ref","label":"Ref","width":80},{"key":"name","label":"Name","width":180},{"key":"status","label":"Status","width":180},{"key":"target_market","label":"Target Market","width":180},{"key":"target_audience","label":"Target Audience","width":180},{"key":"cash_budget","label":"Cash Budget","width":180},{"key":"currency","label":"Currency","width":180},{"key":"goal_metric","label":"Goal Metric","width":180},{"key":"goal_value","label":"Goal Value","width":180},{"key":"owner_id","label":"Owner","width":180},{"key":"available_cash","label":"Available Cash","width":180},{"key":"committed_cash","label":"Committed Cash","width":180},{"key":"incomplete_cost_items","label":"Incomplete Cost Items","width":180},{"key":"brief","label":"Plan Summary","width":180}],"filters":[],"sorting":[],"rowHeight":36,"rowHeights":{}}'::jsonb,'workspace setup');
insert into gtm_view.sheets(id,name,position,definition,updated_by) values (md5('harper-gtm:campaigns')::uuid,'캠페인',11,'{"source":"campaigns","columns":[{"key":"ref","label":"Ref","width":80},{"key":"name","label":"Name","width":180},{"key":"description","label":"Content / Background","width":280},{"key":"audience_brief","label":"Audience","width":180},{"key":"value_proposition","label":"Value Proposition","width":180},{"key":"guide_ref","label":"Guide URL","width":180},{"key":"guide_version","label":"Guide Version","width":180},{"key":"owner_id","label":"Owner","width":180}],"filters":[],"sorting":[],"rowHeight":36,"rowHeights":{}}'::jsonb,'workspace setup');
insert into gtm_view.sheets(id,name,position,definition,updated_by) values (md5('harper-gtm:formats')::uuid,'Format Bank',12,'{"source":"formats","columns":[{"key":"ref","label":"Ref","width":80},{"key":"name","label":"Name","width":180},{"key":"status","label":"Status","width":180},{"key":"default_campaign_id","label":"Default Campaign Ref","width":180},{"key":"default_outreach_template_id","label":"Default Outreach Template Ref","width":180},{"key":"hook","label":"Hook","width":180},{"key":"shot_sequence","label":"Shot Sequence","width":180},{"key":"required_moment","label":"Required Product Moment","width":180},{"key":"caption_template","label":"Caption Template","width":180},{"key":"example_links","label":"Example Links (comma-separated)","width":180},{"key":"replicate_rule","label":"Replicate Rule","width":180},{"key":"kill_rule","label":"Kill Rule","width":180},{"key":"target_creator_profile","label":"Target Creator Profile","width":180},{"key":"cold_outreach_angle","label":"Cold Outreach Angle","width":180},{"key":"description","label":"Content / Background","width":280},{"key":"guide_ref","label":"Guide URL","width":180},{"key":"guide_version","label":"Guide Version","width":180},{"key":"content_use_count","label":"Content Uses","width":180},{"key":"published_content_count","label":"Published Contents","width":180},{"key":"last_published_at","label":"Last Published At","width":180},{"key":"owner_id","label":"Owner","width":180}],"filters":[],"sorting":[],"rowHeight":36,"rowHeights":{}}'::jsonb,'workspace setup');
insert into gtm_view.sheets(id,name,position,definition,updated_by) values (md5('harper-gtm:performance_creator')::uuid,'크리에이터별',13,'{"source":"performance_creator","columns":[{"key":"name","label":"구분","width":220},{"key":"visitors","label":"유입","width":140},{"key":"signups","label":"회원가입 수","width":140},{"key":"signup_rate","label":"가입률","width":140},{"key":"completed","label":"D7 완료","width":140},{"key":"cost","label":"발생 비용","width":140},{"key":"currency","label":"통화","width":220},{"key":"cost_per_signup","label":"가입당 비용","width":140},{"key":"cost_per_completion","label":"D7 완료당 비용","width":140},{"key":"linked_contents","label":"UTM 연결 콘텐츠","width":140},{"key":"contents","label":"콘텐츠 수","width":140},{"key":"measurement_status","label":"측정 상태","width":220},{"key":"direction","label":"방향","width":220},{"key":"next_action","label":"Next action","width":220},{"key":"owner","label":"담당","width":220},{"key":"due_at","label":"기한","width":140},{"key":"reviewed_at","label":"판단 기준일","width":140}],"filters":[],"sorting":[],"rowHeight":36,"rowHeights":{}}'::jsonb,'workspace setup');
insert into gtm_view.sheets(id,name,position,definition,updated_by) values (md5('harper-gtm:performance_platform')::uuid,'플랫폼별',14,'{"source":"performance_platform","columns":[{"key":"name","label":"구분","width":220},{"key":"visitors","label":"유입","width":140},{"key":"signups","label":"회원가입 수","width":140},{"key":"signup_rate","label":"가입률","width":140},{"key":"completed","label":"D7 완료","width":140},{"key":"cost","label":"발생 비용","width":140},{"key":"currency","label":"통화","width":220},{"key":"cost_per_signup","label":"가입당 비용","width":140},{"key":"cost_per_completion","label":"D7 완료당 비용","width":140},{"key":"linked_contents","label":"UTM 연결 콘텐츠","width":140},{"key":"contents","label":"콘텐츠 수","width":140},{"key":"measurement_status","label":"측정 상태","width":220},{"key":"direction","label":"방향","width":220},{"key":"next_action","label":"Next action","width":220},{"key":"owner","label":"담당","width":220},{"key":"due_at","label":"기한","width":140},{"key":"reviewed_at","label":"판단 기준일","width":140}],"filters":[],"sorting":[],"rowHeight":36,"rowHeights":{}}'::jsonb,'workspace setup');
insert into gtm_view.sheets(id,name,position,definition,updated_by) values (md5('harper-gtm:performance_campaign')::uuid,'캠페인별',15,'{"source":"performance_campaign","columns":[{"key":"name","label":"구분","width":220},{"key":"visitors","label":"유입","width":140},{"key":"signups","label":"회원가입 수","width":140},{"key":"signup_rate","label":"가입률","width":140},{"key":"completed","label":"D7 완료","width":140},{"key":"cost","label":"발생 비용","width":140},{"key":"currency","label":"통화","width":220},{"key":"cost_per_signup","label":"가입당 비용","width":140},{"key":"cost_per_completion","label":"D7 완료당 비용","width":140},{"key":"linked_contents","label":"UTM 연결 콘텐츠","width":140},{"key":"contents","label":"콘텐츠 수","width":140},{"key":"measurement_status","label":"측정 상태","width":220},{"key":"direction","label":"방향","width":220},{"key":"next_action","label":"Next action","width":220},{"key":"owner","label":"담당","width":220},{"key":"due_at","label":"기한","width":140},{"key":"reviewed_at","label":"판단 기준일","width":140}],"filters":[],"sorting":[],"rowHeight":36,"rowHeights":{}}'::jsonb,'workspace setup');
insert into gtm_view.sheets(id,name,position,definition,updated_by) values (md5('harper-gtm:performance_format')::uuid,'포맷별',16,'{"source":"performance_format","columns":[{"key":"name","label":"구분","width":220},{"key":"visitors","label":"유입","width":140},{"key":"signups","label":"회원가입 수","width":140},{"key":"signup_rate","label":"가입률","width":140},{"key":"completed","label":"D7 완료","width":140},{"key":"cost","label":"발생 비용","width":140},{"key":"currency","label":"통화","width":220},{"key":"cost_per_signup","label":"가입당 비용","width":140},{"key":"cost_per_completion","label":"D7 완료당 비용","width":140},{"key":"linked_contents","label":"UTM 연결 콘텐츠","width":140},{"key":"contents","label":"콘텐츠 수","width":140},{"key":"measurement_status","label":"측정 상태","width":220},{"key":"direction","label":"방향","width":220},{"key":"next_action","label":"Next action","width":220},{"key":"owner","label":"담당","width":220},{"key":"due_at","label":"기한","width":140},{"key":"reviewed_at","label":"판단 기준일","width":140}],"filters":[],"sorting":[],"rowHeight":36,"rowHeights":{}}'::jsonb,'workspace setup');

update gtm_view.sources set enrichment_group='creator',enrichment_fields='{"_creator_visitors": "visitors", "_creator_signups": "signups", "_creator_completed": "completed", "_creator_cost": "cost", "_creator_currency": "currency", "_creator_cpa": "provisional_cost_per_completion", "_creator_measurement": "measurement_status"}'::jsonb,virtual_fields='[{"key": "_creator_visitors", "label": "Attributed Visitors (Selected Period)", "type": "number", "writable": false}, {"key": "_creator_signups", "label": "Attributed Signups (Selected Period)", "type": "number", "writable": false}, {"key": "_creator_completed", "label": "Completed Onboarding Within 7 Days", "type": "number", "writable": false}, {"key": "_creator_cost", "label": "Content-Allocated Lifetime Cost", "type": "number", "writable": false}, {"key": "_creator_currency", "label": "Content Cost Currency", "type": "text", "writable": false}, {"key": "_creator_cpa", "label": "Provisional Cost per Completion", "type": "number", "writable": false}, {"key": "_creator_measurement", "label": "Performance Data Status", "type": "text", "writable": false}]'::jsonb where id='connected';
update gtm_view.sheets set definition=jsonb_set(definition,'{columns}',definition->'columns'||'[{"key": "_creator_visitors", "label": "Attributed Visitors (Selected Period)", "width": 180}, {"key": "_creator_signups", "label": "Attributed Signups (Selected Period)", "width": 180}, {"key": "_creator_completed", "label": "Completed Onboarding Within 7 Days", "width": 180}, {"key": "_creator_cost", "label": "Content-Allocated Lifetime Cost", "width": 180}, {"key": "_creator_currency", "label": "Content Cost Currency", "width": 180}, {"key": "_creator_cpa", "label": "Provisional Cost per Completion", "width": 180}, {"key": "_creator_measurement", "label": "Performance Data Status", "width": 180}]'::jsonb) where definition->>'source'='connected';
