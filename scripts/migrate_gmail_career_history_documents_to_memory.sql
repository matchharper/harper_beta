-- One-time, post-deployment migration of legacy Gmail-generated
-- Career History.md documents into company-level Career Memory rows.
--
-- Run this only after the deployed Gmail integration writes talent_contexts
-- Memory rows instead of talent_documents. The current writer owns rows with
-- source_refs type "gmail_career_history" and uses the same company originId
-- calculation as this script.
--
-- The script intentionally does not ask another LLM to reinterpret old data.
-- It preserves the already extracted Markdown entries, groups exact normalized
-- company names, keeps at most the 20 companies with the latest recorded
-- activity per talent, and assigns importance 2. It then soft-deletes every
-- legacy document row and clears its Markdown payload.
--
-- It is safe to run again:
--   * an existing active Gmail Memory is never overwritten;
--   * a deleted Gmail Memory is a tombstone and is never recreated;
--   * an already retired document has no active payload to migrate;
--   * the old document payload is cleared only after every selected company
--     has either an existing row/tombstone or a newly inserted row.

begin;

-- Keep the legacy snapshot stable and prevent concurrent ref allocation while
-- this short data migration runs. Reads remain available.
lock table public.talent_documents in share mode;
lock table public.talent_contexts in share row exclusive mode;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'talent_contexts'
      and column_name = 'importance'
  ) then
    raise exception
      'talent_contexts.importance is required; apply the schema migrations first';
  end if;

  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception
      'extensions.digest(bytea,text) is required to create Gmail Memory origin IDs';
  end if;

  if exists (
    select 1
    from public.talent_documents document
    where document.origin_type = 'gmail_career_history'
      and document.origin_id = 'singleton'
      and document.storage_path is not null
  ) then
    raise exception
      'a legacy Gmail Career History document has a Storage object; remove that object safely before running this SQL';
  end if;

  if exists (
    select 1
    from public.talent_documents document
    where document.origin_type = 'gmail_career_history'
      and document.origin_id = 'singleton'
      and not document.is_deleted
      and (
        document.kind <> 'document'
        or document.is_public
        or document.is_primary
      )
  ) then
    raise exception
      'an active legacy Gmail Career History row has unexpected document flags; review it before migration';
  end if;

  if exists (
    select 1
    from public.talent_documents document
    where document.origin_type = 'gmail_career_history'
      and document.origin_id = 'singleton'
      and not document.is_deleted
      and nullif(btrim(document.extracted_text), '') is null
  ) then
    raise exception
      'an active legacy Gmail Career History document has no Markdown payload; review it before migration';
  end if;
end
$$;

-- Only active documents are migration sources. An old document the user had
-- already deleted must not recreate data. Retired rows are still cleaned below
-- so their obsolete Markdown payload does not remain stored.
create temporary table _gmail_legacy_documents on commit drop as
select
  document.id as document_id,
  document.talent_id,
  document.extracted_text,
  document.created_at as document_created_at,
  document.updated_at as document_updated_at
from public.talent_documents document
where document.origin_type = 'gmail_career_history'
  and document.origin_id = 'singleton'
  and not document.is_deleted;

create unique index _gmail_legacy_documents_uidx
  on _gmail_legacy_documents (document_id);

create temporary table _gmail_legacy_lines on commit drop as
select
  document.document_id,
  document.talent_id,
  document.document_created_at,
  document.document_updated_at,
  line.line_no,
  btrim(line.raw_line) as raw_line
from _gmail_legacy_documents document
cross join lateral regexp_split_to_table(
  document.extracted_text,
  E'\\r?\\n'
) with ordinality as line(raw_line, line_no)
where nullif(btrim(line.raw_line), '') is not null;

do $$
begin
  if exists (
    select 1
    from _gmail_legacy_lines line
    where line.raw_line <> '- No reliable application history found.'
      and line.raw_line !~ '^- .+ : .+$'
  ) then
    raise exception
      'a legacy Gmail Career History line does not match the generated Markdown format; review it before migration';
  end if;
end
$$;

-- Legacy rows were generated as:
--   - Company - Role : YYYY.MM.DD ~ YYYY.MM.DD, summary
--   - Company : YYYY.MM.DD, summary
-- The exact entry text is retained. Splitting the generated title at its first
-- " - " is the only deterministic company boundary available in this legacy
-- format; no role, stage, outcome, or employer relationship is inferred.
create temporary table _gmail_parsed_entries on commit drop as
with entries as (
  select
    line.*,
    substr(line.raw_line, 3) as entry_text,
    split_part(substr(line.raw_line, 3), ' : ', 1) as entry_title
  from _gmail_legacy_lines line
  where line.raw_line <> '- No reliable application history found.'
), company_entries as (
  select
    entry.*,
    btrim(
      case
        when position(' - ' in entry.entry_title) > 0
          then split_part(entry.entry_title, ' - ', 1)
        else entry.entry_title
      end
    ) as company
  from entries entry
)
select
  entry.*,
  lower(normalize(entry.company, NFKC)) as company_key,
  activity.latest_activity_at
from company_entries entry
left join lateral (
  select max(replace(date_match.parts[1], '.', '-')::date) as latest_activity_at
  from regexp_matches(
    entry.entry_text,
    '([0-9]{4}\\.[0-9]{2}\\.[0-9]{2})',
    'g'
  ) as date_match(parts)
) activity on true;

do $$
begin
  if exists (
    select 1
    from _gmail_parsed_entries entry
    where length(entry.company) not between 1 and 200
  ) then
    raise exception
      'a parsed Gmail Career History company is empty or exceeds the 200-character company limit';
  end if;
end
$$;

-- Preserve every extracted entry for an exact normalized company in one
-- self-contained Memory. A later Gmail refresh may rewrite this content using
-- the current LLM merge contract, but it will address the same originId.
create temporary table _gmail_company_groups on commit drop as
select
  entry.talent_id,
  entry.company_key,
  (array_agg(
    entry.company
    order by entry.document_updated_at desc, entry.line_no
  ))[1] as company,
  string_agg(
    entry.entry_text,
    E'\n'
    order by
      entry.latest_activity_at desc nulls last,
      entry.document_updated_at desc,
      entry.line_no
  ) as content,
  max(entry.latest_activity_at) as latest_activity_at,
  min(entry.document_created_at) as source_created_at,
  max(entry.document_updated_at) as source_updated_at,
  to_jsonb(array_agg(
    distinct entry.document_id
    order by entry.document_id
  )) as source_document_ids
from _gmail_parsed_entries entry
group by entry.talent_id, entry.company_key;

do $$
begin
  if exists (
    select 1
    from _gmail_company_groups company
    where length(company.content) > 2000
  ) then
    raise exception
      'a grouped Gmail Career History company exceeds the current 2000-character Memory limit; review it instead of truncating data';
  end if;
end
$$;

-- The current Gmail contract keeps no more than 20 companies, newest first.
-- A stable company key breaks ties without inventing additional recency.
create temporary table _gmail_selected_companies on commit drop as
with ranked as (
  select
    company.*,
    row_number() over (
      partition by company.talent_id
      order by
        company.latest_activity_at desc nulls last,
        company.source_updated_at desc,
        company.company_key
    ) as recency_rank
  from _gmail_company_groups company
)
select
  ranked.*,
  left(
    encode(
      extensions.digest(convert_to(ranked.company_key, 'UTF8'), 'sha256'),
      'hex'
    ),
    40
  ) as origin_id
from ranked
where ranked.recency_rank <= 20;

create unique index _gmail_selected_companies_uidx
  on _gmail_selected_companies (talent_id, origin_id);

create temporary table _gmail_missing_companies on commit drop as
select company.*
from _gmail_selected_companies company
where not exists (
  select 1
  from public.talent_contexts existing
  where existing.talent_id = company.talent_id
    and existing.source_refs @> jsonb_build_array(jsonb_build_object(
      'type', 'gmail_career_history',
      'originId', company.origin_id
    ))
);

create temporary table _gmail_inserted_contexts (
  talent_id uuid not null,
  context_id bigint not null
) on commit drop;

with existing_max_refs as (
  select context.talent_id, coalesce(max(context.ref), 0) as max_ref
  from public.talent_contexts context
  group by context.talent_id
), numbered as (
  select
    company.*,
    coalesce(existing.max_ref, 0) + row_number() over (
      partition by company.talent_id
      order by company.recency_rank, company.company_key
    ) as next_ref
  from _gmail_missing_companies company
  left join existing_max_refs existing
    on existing.talent_id = company.talent_id
), inserted as (
  insert into public.talent_contexts (
    talent_id,
    ref,
    collection,
    label,
    key,
    content,
    importance,
    source_refs,
    created_at,
    updated_at
  )
  select
    company.talent_id,
    company.next_ref,
    'memory',
    null,
    null,
    company.content,
    2,
    jsonb_build_array(
      jsonb_build_object(
        'type', 'gmail_career_history',
        'originId', company.origin_id
      ),
      jsonb_build_object(
        'type', 'gmail_career_history_document_migration_v1',
        'originId', company.origin_id,
        'documentIds', company.source_document_ids,
        'latestActivityAt', to_char(company.latest_activity_at, 'YYYY-MM-DD'),
        'sourceUpdatedAt', company.source_updated_at
      )
    ),
    company.source_created_at,
    now()
  from numbered company
  returning talent_id, id
)
insert into _gmail_inserted_contexts (talent_id, context_id)
select inserted.talent_id, inserted.id
from inserted;

-- A payload is never deleted unless every company selected for migration is
-- represented by either an active Memory or an intentional deleted tombstone.
do $$
begin
  if exists (
    select 1
    from _gmail_selected_companies company
    where not exists (
      select 1
      from public.talent_contexts context
      where context.talent_id = company.talent_id
        and context.source_refs @> jsonb_build_array(jsonb_build_object(
          'type', 'gmail_career_history',
          'originId', company.origin_id
        ))
    )
  ) then
    raise exception
      'not every selected Gmail Career History company has a Memory row; the legacy documents were not cleared';
  end if;
end
$$;

create temporary table _gmail_retired_documents (
  document_id uuid not null
) on commit drop;

with retired as (
  update public.talent_documents document
  set
    extracted_text = null,
    content_sha256 = null,
    content_type = null,
    size_bytes = null,
    storage_path = null,
    is_deleted = true,
    is_public = false,
    is_primary = false,
    updated_at = now()
  where document.origin_type = 'gmail_career_history'
    and document.origin_id = 'singleton'
    and (
      document.extracted_text is not null
      or document.content_sha256 is not null
      or document.content_type is not null
      or document.size_bytes is not null
      or document.storage_path is not null
      or not document.is_deleted
      or document.is_public
      or document.is_primary
    )
  returning document.id
)
insert into _gmail_retired_documents (document_id)
select retired.id
from retired;

-- The SQL client shows exactly what was considered and changed.
select
  (select count(*) from _gmail_legacy_documents) as source_documents,
  (select count(*) from _gmail_parsed_entries) as source_entries,
  (select count(*) from _gmail_company_groups) as source_companies,
  (select count(*) from _gmail_selected_companies) as selected_companies,
  (
    (select count(*) from _gmail_company_groups)
    - (select count(*) from _gmail_selected_companies)
  ) as omitted_companies_beyond_latest_20,
  (select count(*) from _gmail_inserted_contexts) as inserted_memories,
  (select count(*) from _gmail_retired_documents) as cleared_documents;

commit;
