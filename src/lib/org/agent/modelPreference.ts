import { migrateOrgAgentModel, type OrgAgentModelId } from "./modelConfig";

const storageKey = "harper:org-agent:model";

export function readOrgAgentModelPreference(): OrgAgentModelId | null {
  try {
    return migrateOrgAgentModel(window.localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

export function saveOrgAgentModelPreference(model: OrgAgentModelId | null) {
  if (model) window.localStorage.setItem(storageKey, model);
  else window.localStorage.removeItem(storageKey);
}
