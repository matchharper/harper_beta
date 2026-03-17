import React, { CSSProperties } from "react";

export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

type ContributionGridProps = {
  data?: ContributionLevel[][];
  monthsToShow?: number;
  rowsToShow?: number;
  minCellSize?: number;
  labelColumnWidth?: number;
  className?: string;
  showMonthLabels?: boolean;
  showWeekLabels?: boolean;
};

type ContributionWeekLabel = {
  label: string;
  row: number;
};

const months = [
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
  "Jan",
  "Feb",
];

const weekLabels: ContributionWeekLabel[] = [
  { label: "Mon", row: 1 },
  { label: "Wed", row: 3 },
  { label: "Fri", row: 5 },
];

export const defaultContributionData: ContributionLevel[][] = [
  [
    2, 0, 3, 0, 0, 2, 0, 3, 2, 3, 0, 3, 3, 0, 0, 3, 3, 3, 3, 3, 3, 0, 3, 3, 3,
    3, 4, 3, 3, 3, 0, 3, 3, 0, 3, 4, 3, 0, 0, 0, 0, 0, 3, 0, 3, 3, 3, 3,
  ],
  [
    3, 4, 0, 3, 3, 2, 0, 3, 0, 3, 3, 3, 4, 0, 3, 4, 3, 3, 4, 3, 4, 3, 4, 3, 3,
    3, 4, 3, 4, 3, 3, 4, 3, 4, 3, 4, 2, 3, 3, 2, 4, 2, 3, 3, 0, 2, 2, 0,
  ],
  [
    3, 3, 2, 4, 4, 1, 4, 0, 4, 1, 1, 0, 3, 3, 4, 0, 4, 4, 4, 0, 4, 4, 0, 2, 3,
    3, 1, 3, 3, 3, 3, 3, 1, 3, 4, 4, 3, 3, 2, 3, 4, 2, 4, 3, 3, 4, 1, 0,
  ],
  [
    3, 1, 3, 3, 0, 3, 3, 0, 1, 4, 4, 3, 3, 3, 4, 1, 0, 4, 4, 0, 4, 4, 3, 4, 3,
    3, 4, 4, 0, 0, 0, 0, 3, 1, 0, 3, 1, 1, 1, 0, 3, 3, 3, 3, 3, 3, 1, 4,
  ],
  [
    3, 3, 3, 1, 3, 3, 3, 3, 2, 4, 0, 4, 4, 4, 1, 4, 0, 4, 0, 4, 1, 4, 3, 4, 4,
    2, 4, 3, 4, 4, 1, 4, 1, 2, 4, 4, 0, 2, 4, 0, 0, 4, 3, 1, 3, 3, 4, 0,
  ],
  [
    3, 4, 4, 4, 4, 4, 1, 3, 1, 3, 0, 1, 3, 0, 4, 1, 3, 4, 3, 4, 0, 1, 4, 4, 3,
    1, 4, 4, 1, 0, 4, 4, 0, 1, 4, 0, 3, 0, 0, 4, 4, 0, 0, 3, 0, 1, 4, 4,
  ],
  [
    2, 0, 0, 0, 0, 0, 0, 0, 0, 4, 3, 0, 3, 3, 0, 2, 4, 4, 4, 1, 3, 2, 4, 4, 0,
    0, 0, 4, 1, 3, 3, 0, 1, 0, 3, 3, 0, 0, 3, 3, 0, 0, 3, 1, 3, 0, 0, 3,
  ],
];

function contributionColor(level: ContributionLevel) {
  switch (level) {
    case 0:
      return "bg-[#131B24]";
    case 1:
      return "bg-[#003B11]";
    case 2:
      return "bg-[#006F24]";
    case 3:
      return "bg-[#00A335]";
    case 4:
      return "bg-[#00D753]";
    default:
      return "bg-zinc-800";
  }
}

export function ContributionGrid({
  data = defaultContributionData,
  monthsToShow = 12,
  rowsToShow,
  minCellSize = 14,
  labelColumnWidth = 48,
  className = "",
  showMonthLabels = true,
  showWeekLabels = true,
}: ContributionGridProps) {
  const totalColumns = data[0]?.length ?? 0;
  const visibleRows = Math.min(
    Math.max(rowsToShow ?? data.length, 1),
    data.length
  );
  const safeMonthsToShow = Math.min(Math.max(monthsToShow, 1), months.length);
  const columnsPerMonth = totalColumns / months.length;
  const visibleColumns = Math.max(
    1,
    Math.round(columnsPerMonth * safeMonthsToShow)
  );
  const startColumn = Math.max(totalColumns - visibleColumns, 0);
  const visibleData = data
    .slice(0, visibleRows)
    .map((row) => row.slice(startColumn, startColumn + visibleColumns));

  const monthLabelByColumn = new Map<number, string>();
  months.forEach((month, monthIndex) => {
    const monthStart = Math.floor(columnsPerMonth * monthIndex);
    if (
      monthStart >= startColumn &&
      monthStart < startColumn + visibleColumns
    ) {
      monthLabelByColumn.set(monthStart - startColumn, month);
    }
  });

  const gridTemplate = `${showWeekLabels ? `${labelColumnWidth}px ` : ""}repeat(${visibleColumns}, minmax(${minCellSize}px, 1fr))`;
  const headerStyle: CSSProperties = { gridTemplateColumns: gridTemplate };
  const bodyStyle: CSSProperties = { gridTemplateColumns: gridTemplate };
  const cellStyle: CSSProperties = { minHeight: `${minCellSize}px` };

  return (
    <div className={`overflow-x-auto no-scrollbar ${className}`.trim()}>
      <div className="min-w-fit">
        {showMonthLabels ? (
          <div
            className="mb-2 grid items-center gap-2 text-sm text-zinc-400"
            style={headerStyle}
          >
            {showWeekLabels ? <div /> : null}
            {Array.from({ length: visibleColumns }).map((_, columnIndex) => (
              <div
                key={`month-${columnIndex}`}
                className="col-span-1 flex items-center justify-start"
              >
                {monthLabelByColumn.has(columnIndex) ? (
                  <span className="text-[11px] font-medium text-zinc-500">
                    {monthLabelByColumn.get(columnIndex)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid gap-[5px]" style={bodyStyle}>
          {visibleData.map((row, rowIdx) => (
            <React.Fragment key={`row-${rowIdx}`}>
              {showWeekLabels ? (
                <div className="flex items-center text-[11px] font-medium text-zinc-500">
                  {weekLabels.find((item) => item.row === rowIdx)?.label ?? ""}
                </div>
              ) : null}
              {row.map((level, colIdx) => (
                <div
                  key={`cell-${rowIdx}-${colIdx}`}
                  style={cellStyle}
                  className={`aspect-square rounded-[2px] transition-all duration-200 hover:scale-105 hover:outline hover:outline-1 hover:outline-zinc-700 ${contributionColor(
                    level
                  )}`}
                />
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
