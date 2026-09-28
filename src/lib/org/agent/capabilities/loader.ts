import { COMPANY_CAPABILITIES, type CompanyCapabilityId } from "./registry";
import { resolveCompanyCapabilities } from "./resolver";

export function loadCompanyCapabilities(input: unknown, loaded: Set<CompanyCapabilityId>, surface: "chat" | "slack") {
  const validIds = COMPANY_CAPABILITIES.map((c) => c.id);
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => key !== "capabilityIds")) {
    return { ok: false, error: "Expected only capabilityIds.", validIds };
  }
  const ids = (input as { capabilityIds?: unknown }).capabilityIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > validIds.length || ids.some((id) => !validIds.includes(id))) {
    return { ok: false, error: "Unknown or invalid capabilityIds. Nothing was loaded.", validIds };
  }
  const requested = [...new Set(ids)] as CompanyCapabilityId[];
  const tentative = new Set([...loaded, ...requested]);
  // Resolve all policies and schemas before mutating state (atomic activation).
  const resolved = resolveCompanyCapabilities({ surface, mode: "progressive", loaded: tentative });
  if (requested.some((id) => !resolved.activeCapabilityIds.includes(id))) {
    return { ok: false, error: "Capability unavailable on this surface. Nothing was loaded.", validIds };
  }
  const alreadyLoaded = requested.filter((id) => loaded.has(id));
  requested.forEach((id) => loaded.add(id));
  return { ok: true, loaded: requested, alreadyLoaded, availableNextCompletion: resolved.tools.map((t) => t.function.name) };
}
