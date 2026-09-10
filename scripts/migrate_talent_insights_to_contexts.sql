-- One-time, post-deployment partition of legacy talent_insights into
-- Search Brief and Memory rows.
--
-- Run this only after every deployed writer that can update talent_insights
-- has been retired. As of 2026-09-08, that includes harper_worker email paths,
-- not only harper_beta.
--
-- The script is safe to run again:
--   * known Brief keys keep their existing keyed row;
--   * other keys keep one Memory row identified by source_refs;
--   * deleted rows are tombstones and are not recreated;
--   * rows touched by UI, conversation, onboarding, or another non-migration
--     source are never overwritten or reclassified.
--
-- This script intentionally does not migrate Behavior Context or Career
-- History documents and does not disable any legacy trigger or writer.

begin;

-- Hold a stable source snapshot and prevent ref allocation races while this
-- short data migration runs. Reads remain available.
lock table public.talent_insights in share mode;
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

  if exists (
    select 1
    from public.talent_insights insight
    where insight.content is not null
      and jsonb_typeof(insight.content) <> 'object'
  ) then
    raise exception
      'talent_insights.content contains a non-object value; review it before migration';
  end if;

  if exists (
    select 1
    from public.talent_insights insight
    cross join lateral jsonb_each(coalesce(insight.content, '{}'::jsonb)) entry
    where jsonb_typeof(entry.value) <> 'string'
  ) then
    raise exception
      'talent_insights contains a non-string value; review it before migration';
  end if;
end
$$;

create temporary table _talent_insight_sources on commit drop as
with brief_keys (
  insight_key,
  sort_order,
  label_ko,
  label_en
) as (
  values
    ('search_intensity', 1, '이직 적극도', 'Search intensity'),
    ('location', 2, '선호 근무 지역', 'Preferred work location'),
    ('next_scope', 3, '다음 역할', 'Next role'),
    ('must_haves', 4, '꼭 있어야 하는 조건', 'Must-have criteria'),
    ('compensation', 5, '기대 보상 조건', 'Compensation expectations'),
    (
      'cross_border_work_authorization',
      6,
      '거주국 외 국가의 근무 자격',
      'Work authorization outside country of residence'
    ),
    -- Legacy onboarding predecessors of the current authorization/language
    -- Briefs. Keep their original keys so SQL never guesses how to merge two
    -- independently written values.
    ('permanent_residency', 7, '영주권·근무 자격', 'Permanent residency and work authorization'),
    ('language', 8, '외국어 능력', 'Language proficiency'),
    ('english_proficiency', 9, '영어 능력', 'English proficiency'),
    ('deal_breakers', 10, '피하고 싶은 조건', 'Deal breakers'),
    ('team_style_fit', 11, '선호하는 회사의 조건', 'Preferred company conditions')
)
select
  insight.id::bigint as insight_id,
  insight.talent_id,
  entry.key as insight_key,
  btrim(entry.value) as content,
  brief_key.insight_key is not null as is_brief,
  case
    when brief_key.insight_key is null then null
    when lower(coalesce(setting.setting_locale, setting.preferred_locale, 'ko')) like 'en%'
      then brief_key.label_en
    else brief_key.label_ko
  end as label,
  coalesce(brief_key.sort_order, 1000) as sort_order,
  coalesce(insight.created_at, now()) as source_created_at,
  coalesce(insight.last_updated_at, insight.created_at, now()) as source_updated_at
from public.talent_insights insight
cross join lateral jsonb_each_text(coalesce(insight.content, '{}'::jsonb)) entry
left join brief_keys brief_key on brief_key.insight_key = entry.key
left join public.talent_setting setting on setting.user_id = insight.talent_id
where insight.talent_id is not null
  and length(btrim(entry.value)) > 0;

create unique index _talent_insight_sources_uidx
  on _talent_insight_sources (talent_id, insight_key);

do $$
begin
  if exists (
    select 1
    from _talent_insight_sources
    where length(content) > 8000
  ) then
    raise exception
      'a talent_insights value exceeds the 8000-character talent_contexts limit';
  end if;

  if exists (
    select 1
    from _talent_insight_sources
    where is_brief and length(insight_key) > 160
  ) then
    raise exception
      'a Brief compatibility key exceeds the 160-character talent_contexts limit';
  end if;
end
$$;

-- Correct rows created by the original all-insights-to-Brief migration.
-- A custom key moves in place to Memory so its stable ref is preserved.
update public.talent_contexts target
set
  collection = case when source.is_brief then 'brief' else 'memory' end,
  label = case when source.is_brief then source.label else null end,
  key = case when source.is_brief then source.insight_key else null end,
  content = source.content,
  importance = case when source.is_brief then null else 2 end,
  source_refs = case
    when source.is_brief then target.source_refs
    else target.source_refs || jsonb_build_array(jsonb_build_object(
      'type', 'talent_insights_partition_migration_v1',
      'insight_id', source.insight_id,
      'insight_key', source.insight_key,
      'source_updated_at', source.source_updated_at
    ))
  end,
  revision = target.revision + 1,
  updated_at = now(),
  embedding = null,
  embedding_model = null,
  embedding_content_hash = null,
  embedding_updated_at = null
from _talent_insight_sources source
where target.talent_id = source.talent_id
  and target.key = source.insight_key
  and target.deleted_at is null
  and target.source_refs @> jsonb_build_array(jsonb_build_object(
    'type', 'talent_insights_migration',
    'insight_id', source.insight_id
  ))
  and not exists (
    select 1
    from jsonb_array_elements(target.source_refs) source_ref
    where coalesce(source_ref ->> 'type', '') not in (
      'talent_insights_migration',
      'talent_insights_partition_migration_v1'
    )
  )
  and (
    target.collection is distinct from case when source.is_brief then 'brief' else 'memory' end
    or target.label is distinct from case when source.is_brief then source.label else null end
    or target.key is distinct from case when source.is_brief then source.insight_key else null end
    or target.content is distinct from source.content
    or target.importance is distinct from case when source.is_brief then null else 2 end
    or (
      not source.is_brief
      and not target.source_refs @> jsonb_build_array(jsonb_build_object(
        'type', 'talent_insights_partition_migration_v1',
        'insight_id', source.insight_id,
        'insight_key', source.insight_key
      ))
    )
  );

-- Refresh rows previously created or moved by this script when the legacy
-- value changed before writer cutover. Migration-only provenance is replaced;
-- a row with any user/application provenance is left untouched.
update public.talent_contexts target
set
  collection = case when source.is_brief then 'brief' else 'memory' end,
  label = case when source.is_brief then source.label else null end,
  key = case when source.is_brief then source.insight_key else null end,
  content = source.content,
  importance = case when source.is_brief then null else 2 end,
  source_refs = (
    select coalesce(jsonb_agg(source_ref), '[]'::jsonb)
    from jsonb_array_elements(target.source_refs) source_ref
    where coalesce(source_ref ->> 'type', '') <>
      'talent_insights_partition_migration_v1'
  ) || jsonb_build_array(jsonb_build_object(
    'type', 'talent_insights_partition_migration_v1',
    'insight_id', source.insight_id,
    'insight_key', source.insight_key,
    'source_updated_at', source.source_updated_at
  )),
  revision = target.revision + 1,
  updated_at = now(),
  embedding = null,
  embedding_model = null,
  embedding_content_hash = null,
  embedding_updated_at = null
from _talent_insight_sources source
where target.talent_id = source.talent_id
  and target.deleted_at is null
  and target.source_refs @> jsonb_build_array(jsonb_build_object(
    'type', 'talent_insights_partition_migration_v1',
    'insight_id', source.insight_id,
    'insight_key', source.insight_key
  ))
  and not exists (
    select 1
    from jsonb_array_elements(target.source_refs) source_ref
    where coalesce(source_ref ->> 'type', '') not in (
      'talent_insights_migration',
      'talent_insights_partition_migration_v1'
    )
  )
  and (
    target.collection is distinct from case when source.is_brief then 'brief' else 'memory' end
    or target.label is distinct from case when source.is_brief then source.label else null end
    or target.key is distinct from case when source.is_brief then source.insight_key else null end
    or target.content is distinct from source.content
    or target.importance is distinct from case when source.is_brief then null else 2 end
    or not target.source_refs @> jsonb_build_array(jsonb_build_object(
      'type', 'talent_insights_partition_migration_v1',
      'insight_id', source.insight_id,
      'insight_key', source.insight_key,
      'source_updated_at', source.source_updated_at
    ))
  );

-- Insert source values that were added after the original migration. Looking
-- at deleted rows as well as active rows prevents a user deletion from being
-- resurrected by a rerun.
with missing_sources as (
  select source.*
  from _talent_insight_sources source
  where not exists (
    select 1
    from public.talent_contexts existing
    where existing.talent_id = source.talent_id
      and (
        existing.key = source.insight_key
        or existing.source_refs @> jsonb_build_array(jsonb_build_object(
          'type', 'talent_insights_partition_migration_v1',
          'insight_id', source.insight_id,
          'insight_key', source.insight_key
        ))
        or (
          existing.key = source.insight_key
          and existing.source_refs @> jsonb_build_array(jsonb_build_object(
            'type', 'talent_insights_migration',
            'insight_id', source.insight_id
          ))
        )
      )
  )
), existing_max_refs as (
  select talent_id, coalesce(max(ref), 0) as max_ref
  from public.talent_contexts
  group by talent_id
), numbered_sources as (
  select
    source.*,
    coalesce(existing.max_ref, 0) + row_number() over (
      partition by source.talent_id
      order by
        case when source.is_brief then 0 else 1 end,
        source.sort_order,
        source.insight_key
    ) as next_ref
  from missing_sources source
  left join existing_max_refs existing on existing.talent_id = source.talent_id
)
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
  source.talent_id,
  source.next_ref,
  case when source.is_brief then 'brief' else 'memory' end,
  case when source.is_brief then source.label else null end,
  case when source.is_brief then source.insight_key else null end,
  source.content,
  case when source.is_brief then null else 2 end,
  jsonb_build_array(jsonb_build_object(
    'type', 'talent_insights_partition_migration_v1',
    'insight_id', source.insight_id,
    'insight_key', source.insight_key,
    'source_updated_at', source.source_updated_at
  )),
  source.source_created_at,
  now()
from numbered_sources source;

-- Soft-delete migration-owned rows whose source key was removed or cleared.
-- Do not touch tombstones again, and do not touch a row that acquired any
-- non-migration provenance after it was created.
update public.talent_contexts target
set
  deleted_at = now(),
  revision = target.revision + 1,
  updated_at = now()
where target.deleted_at is null
  and exists (
    select 1
    from jsonb_array_elements(target.source_refs) source_ref
    where source_ref ->> 'type' = 'talent_insights_partition_migration_v1'
  )
  and not exists (
    select 1
    from jsonb_array_elements(target.source_refs) source_ref
    where coalesce(source_ref ->> 'type', '') not in (
      'talent_insights_migration',
      'talent_insights_partition_migration_v1'
    )
  )
  and not exists (
    select 1
    from _talent_insight_sources source
    where source.talent_id = target.talent_id
      and exists (
        select 1
        from jsonb_array_elements(target.source_refs) source_ref
        where source_ref ->> 'type' = 'talent_insights_partition_migration_v1'
          and source_ref ->> 'insight_id' = source.insight_id::text
          and source_ref ->> 'insight_key' = source.insight_key
      )
  );

update public.talent_contexts target
set
  deleted_at = now(),
  revision = target.revision + 1,
  updated_at = now()
where target.deleted_at is null
  and target.key is not null
  and target.source_refs @> jsonb_build_array(jsonb_build_object(
    'type', 'talent_insights_migration'
  ))
  and not target.source_refs @> jsonb_build_array(jsonb_build_object(
    'type', 'talent_insights_partition_migration_v1'
  ))
  and not exists (
    select 1
    from jsonb_array_elements(target.source_refs) source_ref
    where coalesce(source_ref ->> 'type', '') not in (
      'talent_insights_migration',
      'talent_insights_partition_migration_v1'
    )
  )
  and not exists (
    select 1
    from _talent_insight_sources source
    where source.talent_id = target.talent_id
      and source.insight_key = target.key
      and target.source_refs @> jsonb_build_array(jsonb_build_object(
        'type', 'talent_insights_migration',
        'insight_id', source.insight_id
      ))
  );

-- The SQL client shows the exact source partition that was applied.
select
  count(*) filter (where is_brief) as source_values_to_brief,
  count(*) filter (where not is_brief) as source_values_to_memory,
  count(distinct talent_id) as source_talents
from _talent_insight_sources;

commit;
