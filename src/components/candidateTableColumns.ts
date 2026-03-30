type CandidateTableColumnKind =
  | "criteria"
  | "company"
  | "evidence"
  | "school"
  | "summary"
  | "memo"
  | "mark"
  | "shared_notes"
  | "empty";

export enum CandidateTableStaticColumnId {
  Company = "company",
  School = "school",
  Evidence = "evidence",
  Summary = "summary",
  Memo = "memo",
  Mark = "mark",
  SharedNotes = "shared_notes",
  Empty = "empty",
}

export type CandidateTableCriteriaColumnId = `criteria:${number}`;

export type CandidateTableColumnId =
  | CandidateTableStaticColumnId
  | CandidateTableCriteriaColumnId;

export type CandidateTableColumnDef = {
  id: CandidateTableColumnId;
  label: string;
  width: string;
  draggable: boolean;
  kind: CandidateTableColumnKind;
  tooltip?: string;
  fixedTail?: boolean;
};

export type CandidateTableDetachedColumnLayout = {
  offsetPx: number;
  widthPx: number;
};

type CandidateTableColumnContext = {
  criteriaList: string[];
  canReorderColumns: boolean;
  hasSharedFolderNotes: boolean;
  isFolded: boolean;
  isMyList: boolean;
  isScholarSource: boolean;
  shouldShowMarkAction: boolean;
  showShortlistMemo: boolean;
};

const INDEX_COLUMN_WIDTH = "56px";
const TABLE_END_SPACER_WIDTH = "28px";

type StaticColumnRule = {
  id: CandidateTableStaticColumnId;
  enabled: (context: CandidateTableColumnContext) => boolean;
};

type StaticColumnFactory = (
  context: CandidateTableColumnContext
) => CandidateTableColumnDef;

const STATIC_COLUMN_ORDER: StaticColumnRule[] = [
  { id: CandidateTableStaticColumnId.Company, enabled: () => true },
  { id: CandidateTableStaticColumnId.School, enabled: () => true },
  {
    id: CandidateTableStaticColumnId.Evidence,
    enabled: ({ isScholarSource }) => isScholarSource,
  },
  {
    id: CandidateTableStaticColumnId.Summary,
    enabled: ({ isMyList }) => isMyList,
  },
  {
    id: CandidateTableStaticColumnId.Memo,
    enabled: ({ showShortlistMemo }) => showShortlistMemo,
  },
  {
    id: CandidateTableStaticColumnId.Mark,
    enabled: ({ shouldShowMarkAction }) => shouldShowMarkAction,
  },
  {
    id: CandidateTableStaticColumnId.SharedNotes,
    enabled: ({ hasSharedFolderNotes }) => hasSharedFolderNotes,
  },
  { id: CandidateTableStaticColumnId.Empty, enabled: () => true },
];

const STATIC_COLUMN_FACTORIES: Record<
  CandidateTableStaticColumnId,
  StaticColumnFactory
> = {
  company: (context) => ({
    id: CandidateTableStaticColumnId.Company,
    label: context.isScholarSource ? "Affiliation" : "Company",
    width: context.isMyList ? "280px" : "240px",
    draggable: context.canReorderColumns,
    kind: "company",
  }),
  school: (context) => ({
    id: CandidateTableStaticColumnId.School,
    label: context.isScholarSource ? "Research" : "School",
    width: context.isMyList ? "280px" : "240px",
    draggable: context.canReorderColumns,
    kind: "school",
  }),
  evidence: () => ({
    id: CandidateTableStaticColumnId.Evidence,
    label: "Related paper",
    width: "340px",
    draggable: false,
    kind: "evidence",
  }),
  summary: (context) => ({
    id: CandidateTableStaticColumnId.Summary,
    label: "Summary",
    width: "520px",
    draggable: context.canReorderColumns,
    kind: "summary",
  }),
  memo: (context) => ({
    id: CandidateTableStaticColumnId.Memo,
    label: "Memo",
    width: "420px",
    draggable: context.canReorderColumns,
    kind: "memo",
  }),
  mark: () => ({
    id: CandidateTableStaticColumnId.Mark,
    label: "",
    width: "106px",
    draggable: false,
    kind: "mark",
    fixedTail: true,
  }),
  shared_notes: () => ({
    id: CandidateTableStaticColumnId.SharedNotes,
    label: "공유 메모",
    width: "560px",
    draggable: false,
    kind: "shared_notes",
    fixedTail: true,
  }),
  empty: () => ({
    id: CandidateTableStaticColumnId.Empty,
    label: "",
    width: "360px",
    draggable: false,
    kind: "empty",
    fixedTail: true,
  }),
};

export function createCriteriaColumnId(
  idx: number
): CandidateTableCriteriaColumnId {
  return `criteria:${idx}`;
}

export function isCriteriaColumnId(
  columnId: string
): columnId is CandidateTableCriteriaColumnId {
  return columnId.startsWith("criteria:");
}

export function isCandidateTableColumnId(
  value: string,
  columns: CandidateTableColumnDef[]
): value is CandidateTableColumnId {
  return columns.some((column) => column.id === value);
}

function createCriteriaColumns(
  context: CandidateTableColumnContext
): CandidateTableColumnDef[] {
  const criteriaWidth = context.isFolded ? "60px" : "140px";

  return context.criteriaList.map((criteria, idx) => ({
    id: createCriteriaColumnId(idx),
    label: criteria,
    tooltip: criteria,
    width: criteriaWidth,
    draggable: context.canReorderColumns,
    kind: "criteria",
  }));
}

export function createCandidateTableColumns(
  context: CandidateTableColumnContext
): CandidateTableColumnDef[] {
  const criteriaColumns = createCriteriaColumns(context);
  const staticColumns = STATIC_COLUMN_ORDER.filter((rule) =>
    rule.enabled(context)
  ).map((rule) => STATIC_COLUMN_FACTORIES[rule.id](context));

  return [...criteriaColumns, ...staticColumns];
}

export function getOrderedCandidateTableColumnIds(
  columns: CandidateTableColumnDef[],
  savedColumnIds: string[],
  canReorderColumns: boolean
) {
  const defaultColumnIds = columns.map((column) => column.id);
  const fixedTailIds = columns
    .filter((column) => column.fixedTail)
    .map((column) => column.id);

  const moveFixedTailColumnsToEnd = (ids: CandidateTableColumnId[]) => {
    if (fixedTailIds.length === 0) return ids;
    return [
      ...ids.filter((id) => !fixedTailIds.includes(id)),
      ...fixedTailIds.filter((id) => ids.includes(id)),
    ];
  };

  if (!canReorderColumns) {
    return moveFixedTailColumnsToEnd(defaultColumnIds);
  }

  const validSaved = savedColumnIds.filter((id): id is CandidateTableColumnId =>
    isCandidateTableColumnId(id, columns)
  );
  const missing = defaultColumnIds.filter((id) => !validSaved.includes(id));

  return moveFixedTailColumnsToEnd([...validSaved, ...missing]);
}

export function createCandidateTableColumnMap(
  columns: CandidateTableColumnDef[]
) {
  return new Map(columns.map((column) => [column.id, column] as const));
}

export function getCandidateTableProfileWidth(isMyList: boolean) {
  return isMyList ? "320px" : "280px";
}

function parsePixelWidth(width: string) {
  const match = width.match(/^(\d+(?:\.\d+)?)px$/);
  return match ? Number(match[1]) : 0;
}

export function getCandidateTableDetachedColumnLayout(
  targetColumnId: CandidateTableColumnId,
  orderedColumnIds: CandidateTableColumnId[],
  columnById: Map<CandidateTableColumnId, CandidateTableColumnDef>,
  profileWidth: string
): CandidateTableDetachedColumnLayout | null {
  const targetColumn = columnById.get(targetColumnId);
  if (!targetColumn) return null;

  let offsetPx =
    parsePixelWidth(INDEX_COLUMN_WIDTH) + parsePixelWidth(profileWidth);

  for (const columnId of orderedColumnIds) {
    if (columnId === targetColumnId) {
      return {
        offsetPx,
        widthPx: parsePixelWidth(targetColumn.width),
      };
    }

    offsetPx += parsePixelWidth(columnById.get(columnId)?.width ?? "0px");
  }

  return null;
}

export function buildCandidateTableGridTemplateColumns(
  orderedColumnIds: CandidateTableColumnId[],
  columnById: Map<CandidateTableColumnId, CandidateTableColumnDef>,
  profileWidth: string
) {
  const dynamicWidths = orderedColumnIds.map(
    (id) => columnById.get(id)?.width ?? "180px"
  );

  return [
    INDEX_COLUMN_WIDTH,
    profileWidth,
    ...dynamicWidths,
    TABLE_END_SPACER_WIDTH,
  ].join(" ");
}
