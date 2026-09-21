export type GtmValue =
  | string
  | number
  | boolean
  | null
  | GtmValue[]
  | { [key: string]: GtmValue };
export type GtmRow = Record<string, GtmValue> & {
  id: string;
  row_version?: number;
};
export type FieldType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "array"
  | "json";
export type GtmField = {
  key: string;
  label: string;
  type: FieldType;
  writable: boolean;
  required?: boolean;
  reference?: string;
};
export type GtmNavigation = {
  source?: string;
  source_field?: string;
  id_field: string;
  tab?: string;
};
export type GtmCellNavigation = GtmNavigation & {
  column: string;
};
export type GtmSource = {
  id: string;
  label: string;
  entity: string | null;
  writable: boolean;
  review?: boolean;
  performance?: boolean;
  record_fields?: GtmField[];
  navigation?: GtmNavigation | null;
  cell_navigation?: GtmCellNavigation[];
  fields: GtmField[];
  relations: { key: string; source: string; label: string }[];
};
export type FilterOperator =
  | "contains"
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "empty"
  | "not_empty";
export type GtmFilter = {
  key: string;
  operator: FilterOperator;
  value: string;
};
export type ColorRule = {
  operator: FilterOperator;
  value: string;
  color: string;
};
export type GridColumn = {
  key: string;
  label: string;
  width: number;
  hidden?: boolean;
  color?: string;
  rules?: ColorRule[];
};
export type SheetDefinition = {
  source: string;
  columns: GridColumn[];
  filters: GtmFilter[];
  sorting: { key: string; desc: boolean }[];
  rowHeight: number;
  rowHeights: Record<string, number>;
};
export type GtmSheet = {
  id: string;
  name: string;
  position: number;
  definition: SheetDefinition;
  row_version: number;
  updated_by: string;
  updated_at: string;
};
export type GtmCatalog = {
  sheets: GtmSheet[];
  sources: GtmSource[];
  can_write: boolean;
};
export type GtmQueryResult = {
  rows: GtmRow[];
  total: number;
  offset: number;
  limit: number;
  as_of: string;
  summary?: Record<string, GtmValue>;
};

export function sourceFields(
  source: GtmSource,
  sources: GtmSource[]
): GtmField[] {
  return [
    ...source.fields,
    ...source.relations.flatMap((relation) =>
      (sources.find((item) => item.id === relation.source)?.fields ?? []).map(
        (field) => ({
          ...field,
          key: `${relation.key}.${field.key}`,
          label: `${relation.label} · ${field.label}`,
          writable: false,
          required: false,
        })
      )
    ),
  ];
}

export type GtmCollection = {
  key: string;
  label: string;
  immutable?: boolean;
  fields: (Partial<GtmField> & {
    key: string;
    label: string;
    options?: { value: string; label: string }[];
  })[];
};
export type GtmRelation = {
  source: string;
  key: string;
  label: string;
  creatable: boolean;
  defaults: Record<string, GtmValue>;
};
export type GtmRecordDetail = {
  record: GtmRow;
  fields: GtmField[];
  collections: GtmCollection[];
  relations: GtmRelation[];
  capabilities: {
    write: boolean;
    archive: boolean;
    restore: boolean;
    activity: boolean;
    issue_link: boolean;
    prepare_outreach: boolean;
  };
};
