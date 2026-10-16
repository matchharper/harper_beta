type Data = Record<string, unknown>;
function record(value: unknown): Data | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Data : null;
}
function omit(value: Data, keys: string[]): Data {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}
function pick(value: Data, keys: string[]): Data {
  return Object.fromEntries(keys.filter(key => key in value).map(key => [key, value[key]]));
}

// Keep transport/UI receipts intact; only the provider-facing serialization is reduced.
export function withCompactTalentToolModelResult(name: string, result: unknown): unknown {
  const raw = record(result);
  if (!raw || typeof raw.modelOutput === "string") return result;
  let model: Data;
  switch (name) {
    case "update_setting": {
      model = omit(raw, ["remainingInternalRoles", "impactLevel", "internalRoleHistoryLimit", "updatedSettingFields"]);
      if (Array.isArray(raw.remainingInternalRoles)) {
        model.remainingInternalRoles = raw.remainingInternalRoles.slice(0, 5).map(item => {
          const role = record(item);
          return role ? pick(role, ["id", "roleId", "companyName", "title", "feedback", "internalProgress", "companyRequestIntroProgress"]) : item;
        });
        // This is a bounded history sample, not the total number of unresolved proposals.
        model.internalRoleHistoryTruncated = raw.remainingInternalRoles.length > 5 || raw.remainingInternalRoles.length === raw.internalRoleHistoryLimit;
      } else if ("remainingInternalRoles" in raw) {
        model.remainingInternalRoles = null;
      }
      break;
    }
    case "recommend_job_postings": {
      // Instant search has a different result contract and is deliberately unchanged.
      if (!("lifecycleEffect" in raw)) return result;
      model = omit(raw, ["lifecycleEffect", "statusRun", "blockingRun", "requestedRequest", "statusRunId", "statusRelation", "replacedRun"]);
      const active = record(raw.blockingRun) ?? record(raw.statusRun);
      if (active) model.activeRequest = pick(active, ["purposeText", "maxResults", "status"]);
      break;
    }
    case "manage_career_coaching_activity": {
      model = omit(raw, ["activityMessage", "currentActivity", "uiAction"]);
      const activity = record(record(raw.activityMessage)?.coachingActivity) ?? record(raw.currentActivity);
      if (activity) model.currentActivity = pick(activity, ["messageId", "revision", "status", "topic", "agenda", "channel", "plannedMinutes", "suggestedMinutes"]);
      break;
    }
    case "read_talent_activity_events":
      model = omit(raw, ["summaries"]);
      break;
    case "open_url":
      model = omit(raw, ["excerpt", "documentId", "cached", "createdAt"]);
      break;
    default:
      return result;
  }
  return { ...raw, modelOutput: JSON.stringify(model) };
}
