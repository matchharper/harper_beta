/** Offline static request inventory. No DB or provider calls. */
import { buildCompanySystemInput } from "../src/lib/org/agent/input";
import { resolveCompanyCapabilities } from "../src/lib/org/agent/capabilities/resolver";
for (const mode of ["progressive", "full"] as const) {
  const resolved = resolveCompanyCapabilities({ surface: "slack", mode, loaded: new Set() });
  const system = buildCompanySystemInput({ resolved, surface: "slack" });
  console.log(JSON.stringify({ mode, tools: resolved.tools.length, policyIds: resolved.policyIds, systemChars: system.length, schemaChars: JSON.stringify(resolved.tools).length, totalStaticChars: system.length + JSON.stringify(resolved.tools).length }));
}
