export type OpsCompanyManagementEmployeeCountRangeFilter =
  | ""
  | "0-1"
  | "1-10"
  | "11-50"
  | "51-200"
  | "101-250"
  | "201-500"
  | "501-1000"
  | "1001-5000"
  | "5001-10000"
  | "10001+";

type EmployeeCountRangeOption = {
  exactJsonValues: string[];
  label: string;
  value: OpsCompanyManagementEmployeeCountRangeFilter;
};

export const OPS_COMPANY_MANAGEMENT_EMPLOYEE_COUNT_RANGE_OPTIONS: ReadonlyArray<EmployeeCountRangeOption> =
  [
    {
      exactJsonValues: [],
      label: "employee_count_range 전체",
      value: "",
    },
    {
      exactJsonValues: [JSON.stringify({ end: 1, start: 0 })],
      label: "0-1명",
      value: "0-1",
    },
    {
      exactJsonValues: [
        JSON.stringify({ end: 10, start: 1 }),
        JSON.stringify({ end: 10, start: 2 }),
      ],
      label: "1-10 / 2-10명",
      value: "1-10",
    },
    {
      exactJsonValues: [JSON.stringify({ end: 50, start: 11 })],
      label: "11-50명",
      value: "11-50",
    },
    {
      exactJsonValues: [
        JSON.stringify({ end: 100, start: 51 }),
        JSON.stringify({ end: 200, start: 51 }),
      ],
      label: "51-100 / 51-200명",
      value: "51-200",
    },
    {
      exactJsonValues: [JSON.stringify({ end: 250, start: 101 })],
      label: "101-250명",
      value: "101-250",
    },
    {
      exactJsonValues: [
        JSON.stringify({ end: 500, start: 201 }),
        JSON.stringify({ end: 500, start: 251 }),
      ],
      label: "201-500 / 251-500명",
      value: "201-500",
    },
    {
      exactJsonValues: [JSON.stringify({ end: 1000, start: 501 })],
      label: "501-1000명",
      value: "501-1000",
    },
    {
      exactJsonValues: [JSON.stringify({ end: 5000, start: 1001 })],
      label: "1001-5000명",
      value: "1001-5000",
    },
    {
      exactJsonValues: [JSON.stringify({ end: 10000, start: 5001 })],
      label: "5001-10000명",
      value: "5001-10000",
    },
    {
      exactJsonValues: [JSON.stringify({ start: 10001 })],
      label: "10001명+",
      value: "10001+",
    },
];

export function getOpsCompanyManagementEmployeeCountRangeExactJsonValues(
  filter: OpsCompanyManagementEmployeeCountRangeFilter
) {
  return (
    OPS_COMPANY_MANAGEMENT_EMPLOYEE_COUNT_RANGE_OPTIONS.find(
      (option) => option.value === filter
    )?.exactJsonValues ?? []
  );
}
