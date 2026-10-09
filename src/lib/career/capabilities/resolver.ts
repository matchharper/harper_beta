import type { TalentChatTool } from "@/lib/talentOnboarding/llm";
import {
  CAREER_CAPABILITIES,
  CAREER_CAPABILITY_LOADER,
  CAREER_CONDITIONAL_TOOLS,
  CAREER_CORE_TOOLS,
  type CareerCapabilityId,
  type CareerCapabilityMode,
} from "./registry";

export function resolveCareerCapabilities(args: {
  eligibleTools: readonly TalentChatTool[];
  loaded: ReadonlySet<CareerCapabilityId>;
  mode: CareerCapabilityMode;
}) {
  const eligibleNames = new Set(args.eligibleTools.map((t) => t.function.name));
  const catalog = CAREER_CAPABILITIES.filter((c) =>
    "requiresAll" in c && c.requiresAll
      ? c.tools.every(([name]) => eligibleNames.has(name))
      : c.tools.some(([name]) => eligibleNames.has(name))
  );
  const coreNames = new Set<string>([
    ...CAREER_CORE_TOOLS,
    ...CAREER_CONDITIONAL_TOOLS,
  ]);
  const alwaysActive = (capability: (typeof catalog)[number]) =>
    capability.tools.every(([name]) => coreNames.has(name));
  const active = catalog.filter(
    (c) => args.mode === "full" || args.loaded.has(c.id) || alwaysActive(c)
  );
  const activeNames = new Set<string>(
    active.flatMap((c) => c.tools.map(([name]) => name))
  );
  const core = args.eligibleTools.filter((t) => coreNames.has(t.function.name));
  const deferred = args.eligibleTools.filter(
    (t) => !coreNames.has(t.function.name) && activeNames.has(t.function.name)
  );
  const ids = catalog.filter((c) => !alwaysActive(c)).map((c) => c.id);
  const loader: TalentChatTool = {
    type: "function",
    function: {
      name: CAREER_CAPABILITY_LOADER,
      description:
        "Load detailed policies and callable tools for catalog capabilities, available in the next model response. Local and idempotent; loading neither needs nor grants user approval.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          capabilityIds: {
            type: "array",
            minItems: 1,
            maxItems: ids.length,
            items: { type: "string", enum: ids },
          },
        },
        required: ["capabilityIds"],
      },
    },
  };
  const hasLoader = args.mode === "progressive" && ids.length > 0;
  // Preserve a stable core prefix and registry order regardless of load order.
  const tools =
    args.mode === "full"
      ? [...args.eligibleTools]
      : [...core, ...(hasLoader ? [loader] : []), ...deferred];
  const catalogText = !args.eligibleTools.length
    ? ""
    : [
        "## Career capabilities",
        "Explain this catalog directly for capability overviews; load details for concrete tasks or unanswered specifics.",
        "These abilities are available even when their detailed tools are not loaded. For an unresolved information or material gap, explain what Harper can retrieve or produce and offer that concrete next step. Advice that already resolves the request and declined offers need no extra offer. Carry out clear requests without offering the same work again. Offers and loads grant no execution permission. Claim completion only from actual results.",
        "Earlier tool transcripts may be omitted. A current snapshot does not describe every prior state; correct an earlier claim only when evidence contradicts it, not because old traces are missing.",
        ...(hasLoader
          ? [
              "Load needed capabilities, then continue the request. Loading needs no confirmation; tools become callable in the next model response. Available abilities in other instructions include this catalog. Keep loading mechanics internal.",
            ]
          : []),
        ...catalog.map((c) => {
          const allowed = c.tools.filter(([name]) => eligibleNames.has(name));
          return `- ${c.id}: ${allowed.length === c.tools.length ? c.summary : `Only: ${allowed.map(([, effect]) => effect).join("; ")}. Other actions in this capability are unavailable in this request.`}`;
        }),
      ].join("\n");
  return {
    tools,
    catalogText,
    eligibleNames,
    offeredNames: new Set(tools.map((t) => t.function.name)),
    activeIds: active.map((c) => c.id),
    eligibleIds: catalog.map((c) => c.id),
    loadableIds: ids,
    policyToolNames: tools
      .map((t) => t.function.name)
      .filter((n) => n !== CAREER_CAPABILITY_LOADER),
  };
}

export type ResolvedCareerCapabilities = ReturnType<
  typeof resolveCareerCapabilities
>;
