function optionalToolString(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function asToolRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function formatRoleContextList(value: unknown): string | null {
  if (Array.isArray(value)) {
    return value.map(formatRoleContextList).filter(Boolean).join("; ");
  }
  const record = asToolRecord(value);
  if (record) {
    return Object.entries(record)
      .map(([key, entry]) => {
        const content = formatRoleContextList(entry);
        return content ? `${key}: ${content}` : "";
      })
      .filter(Boolean)
      .join(", ");
  }
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value).trim()
    : null;
}

export function formatRoleContextForModel(roles: readonly Record<string, unknown>[]) {
  return roles
    .map((item) => {
      const roleId = optionalToolString(item.roleId) ?? "unknown";
      if (item.found !== true) return `Role ${roleId}: unavailable for this user.`;
      const role = asToolRecord(item.role);
      const company = asToolRecord(item.companyDb);
      const recommendation = asToolRecord(item.recommendation);
      const activityPage = asToolRecord(recommendation?.activityPage);
      const lines: Array<string | null | undefined> = [
        `Role: ${optionalToolString(role?.name) ?? roleId} (roleId: ${roleId})`,
        `Company: ${optionalToolString(company?.name) ?? "unknown"}`,
        role?.sourceType ? `Source: ${role.sourceType}` : null,
        role?.status ? `Status: ${role.status}` : null,
        role?.locationText ? `Location: ${role.locationText}` : null,
        role?.workMode ? `Work mode: ${role.workMode}` : null,
        role?.type ? `Employment type: ${formatRoleContextList(role.type)}` : null,
        role?.seniorityLevel ? `Seniority: ${role.seniorityLevel}` : null,
        role?.salaryRange ? `Salary: ${role.salaryRange}` : null,
        role?.externalJdUrl ? `Job posting: ${role.externalJdUrl}` : null,
        role?.postedAt ? `Posted: ${role.postedAt}` : null,
        role?.expiresAt ? `Expires: ${role.expiresAt}` : null,
        role?.description ? `Job description: ${role.description}` : null,
        company?.shortDescription ? `Company summary: ${company.shortDescription}` : null,
        company?.description ? `Company detail: ${company.description}` : null,
        company?.hqLocation ? `Company HQ: ${company.hqLocation}` : null,
        company?.employeeCountRange ? `Company size: ${company.employeeCountRange}` : null,
        role?.internalRequest ? `Private company request (reasoning only): ${role.internalRequest}` : null,
        recommendation?.recommendedAt ? `Recommended: ${recommendation.recommendedAt}` : null,
        recommendation?.fitSummary ? `Recommendation: ${recommendation.fitSummary}` : null,
        recommendation?.fitReasons ? `Fit reasons: ${formatRoleContextList(recommendation.fitReasons)}` : null,
        recommendation?.tradeoffs ? `Tradeoffs: ${formatRoleContextList(recommendation.tradeoffs)}` : null,
        recommendation?.preferenceFit ? `Preference fit: ${formatRoleContextList(recommendation.preferenceFit)}` : null,
        recommendation?.feedback ? `Your feedback: ${recommendation.feedback}` : null,
        recommendation?.feedbackReason ? `Your feedback reason: ${recommendation.feedbackReason}` : null,
        recommendation?.savedStage ? `Saved stage: ${recommendation.savedStage}` : null,
        recommendation?.upcomingMeeting ? String(recommendation.upcomingMeeting) : null,
        recommendation?.recentActivity ? `Recent activity:\n${recommendation.recentActivity}` : null,
        activityPage
          ? `Activity page: offset ${activityPage.offset ?? 0}, limit ${activityPage.limit ?? 10}, hasMore ${activityPage.hasMore === true}`
          : null,
        item.reconsiderationScheduled ? "Reconsideration scheduled: true" : null,
      ];
      return lines.filter(Boolean).join("\n");
    })
    .join("\n\n");
}
