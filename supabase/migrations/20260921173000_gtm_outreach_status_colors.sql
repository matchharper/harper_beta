-- Keep outreach state legible at a glance while preserving each sheet's
-- current column order, widths, filters, and sorting.
with colored as (
  select
    sheet.id,
    jsonb_agg(
      case
        when column_value->>'key' = 'status' then
          column_value || jsonb_build_object(
            'rules',
            jsonb_build_array(
              jsonb_build_object('operator', 'eq', 'value', 'ready_for_review', 'color', '#fff2cc'),
              jsonb_build_object('operator', 'eq', 'value', 'sent', 'color', '#d9ead3'),
              jsonb_build_object('operator', 'eq', 'value', 'replied', 'color', '#cfe2f3'),
              jsonb_build_object('operator', 'eq', 'value', 'skipped', 'color', '#e6e6e6')
            )
          )
        else column_value
      end
      order by ordinal
    ) as columns
  from gtm_view.sheets sheet
  cross join lateral jsonb_array_elements(sheet.definition->'columns')
    with ordinality as listed(column_value, ordinal)
  where sheet.definition->>'source' = 'review'
  group by sheet.id
)
update gtm_view.sheets sheet
set definition = jsonb_set(sheet.definition, '{columns}', colored.columns),
    row_version = sheet.row_version + 1,
    updated_by = 'outreach status colors',
    updated_at = now()
from colored
where sheet.id = colored.id;

with colored as (
  select
    sheet.id,
    jsonb_agg(
      case
        when column_value->>'key' = 'kind' then
          column_value || jsonb_build_object(
            'rules',
            jsonb_build_array(
              jsonb_build_object('operator', 'eq', 'value', 'message_draft', 'color', '#fff2cc'),
              jsonb_build_object('operator', 'eq', 'value', 'message_sent', 'color', '#d9ead3'),
              jsonb_build_object('operator', 'eq', 'value', 'message_received', 'color', '#cfe2f3')
            )
          )
        else column_value
      end
      order by ordinal
    ) as columns
  from gtm_view.sheets sheet
  cross join lateral jsonb_array_elements(sheet.definition->'columns')
    with ordinality as listed(column_value, ordinal)
  where sheet.definition->>'source' = 'outreach'
  group by sheet.id
)
update gtm_view.sheets sheet
set definition = jsonb_set(sheet.definition, '{columns}', colored.columns),
    row_version = sheet.row_version + 1,
    updated_by = 'outreach status colors',
    updated_at = now()
from colored
where sheet.id = colored.id;
