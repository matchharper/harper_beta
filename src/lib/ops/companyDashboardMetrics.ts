import type { CompanyDashboard, CompanyMetric } from "./companyDashboardTypes";
export function kstDay(value: string) {
  return new Date(new Date(value).getTime() + 9 * 3600_000)
    .toISOString()
    .slice(0, 10);
}
export function createCompanyMetricAccumulator(from: string, through: string) {
  const points = new Map<string, CompanyDashboard["points"][number]>();
  const seen = new Set<string>();
  return {
    add(
      workspaceId: string,
      metric: CompanyMetric,
      at: string,
      identity?: string
    ) {
      if (!at) return;
      const date = kstDay(at);
      if (identity) {
        const unique = `${workspaceId}:${metric}:${identity}`;
        if (seen.has(unique)) return;
        seen.add(unique);
      }
      if (date < from || date > through) return;
      const key = `${workspaceId}:${metric}:${date}`;
      const point = points.get(key) ?? { date, workspaceId, metric, value: 0 };
      point.value++;
      points.set(key, point);
    },
    values: () => [...points.values()],
  };
}
