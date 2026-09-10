-- One-time correction for legacy talent_insights values whose source key ends
-- in "_preference". The earlier partition migration conservatively placed
-- every non-standard key in Memory. For this legacy correction, any migrated
-- source key ending in "_preference" belongs in Search Brief instead. This is
-- intentionally a one-time source-data rule, not a classifier for new Career
-- conversations.
--
-- This changes only active, migration-owned Memory rows. A row that has since
-- been edited by conversation, onboarding, UI, or another application source
-- is left untouched. The row is moved in place so its short ref and content do
-- not change, and rerunning this file is a no-op.

-- This is deliberately one statement so it also works in hosted SQL editors
-- that do not preserve temporary tables between statements.
with candidate_sources as materialized (
  select
    context.id,
    context.talent_id,
    context.ref,
    source_ref ->> 'insight_key' as insight_key,
    initcap(replace(source_ref ->> 'insight_key', '_', ' ')) as brief_label,
    context.source_refs,
    count(*) over (partition by context.id) as matching_source_count
  from public.talent_contexts context
  cross join lateral jsonb_array_elements(context.source_refs) source_ref
  where context.collection = 'memory'
    and context.deleted_at is null
    and source_ref ->> 'type' = 'talent_insights_partition_migration_v1'
    and right(lower(coalesce(source_ref ->> 'insight_key', '')), 11) =
      '_preference'
), candidates as materialized (
  select distinct on (candidate.id)
    candidate.*
  from candidate_sources candidate
  order by candidate.id, candidate.insight_key
), classified as materialized (
  select
    candidate.*,
    exists (
      select 1
      from jsonb_array_elements(candidate.source_refs) source_ref
      where coalesce(source_ref ->> 'type', '') not in (
        'talent_insights_migration',
        'talent_insights_partition_migration_v1'
      )
    ) as has_newer_provenance,
    exists (
      select 1
      from public.talent_contexts existing_brief
      where existing_brief.talent_id = candidate.talent_id
        and existing_brief.collection = 'brief'
        and existing_brief.key = candidate.insight_key
        and existing_brief.deleted_at is null
        and existing_brief.id <> candidate.id
    ) as has_brief_conflict,
    not (
      length(candidate.insight_key) between 1 and 160
      and length(candidate.brief_label) between 1 and 160
    ) as has_invalid_key
  from candidates candidate
), moved as (
  update public.talent_contexts target
  set
    collection = 'brief',
    label = classified.brief_label,
    key = classified.insight_key,
    importance = null,
    revision = target.revision + 1,
    updated_at = now(),
    embedding = null,
    embedding_model = null,
    embedding_content_hash = null,
    embedding_updated_at = null
  from classified
  where target.id = classified.id
    and target.collection = 'memory'
    and target.deleted_at is null
    and classified.matching_source_count = 1
    and not classified.has_newer_provenance
    and not classified.has_brief_conflict
    and not classified.has_invalid_key
  returning target.id, target.talent_id, target.ref, target.key, target.label
)
select
  (select count(*) from candidates) as candidate_rows,
  (select count(*) from moved) as moved_rows,
  (
    select count(*)
    from classified
    where matching_source_count <> 1
  ) as skipped_rows_with_ambiguous_source,
  (
    select count(*)
    from classified
    where has_newer_provenance
  ) as skipped_rows_with_newer_provenance,
  (
    select count(*)
    from classified
    where not has_newer_provenance
      and has_brief_conflict
  ) as skipped_rows_with_brief_conflict,
  (
    select count(*)
    from classified
    where not has_newer_provenance
      and not has_brief_conflict
      and has_invalid_key
  ) as skipped_rows_with_invalid_key,
  (select count(distinct talent_id) from moved) as moved_talents,
  (select count(distinct key) from moved) as moved_keys;
