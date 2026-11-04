import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import type { TalentChatTool } from "@/lib/talentOnboarding/llm";
import { careerPromptText, type CareerPromptExperiment } from "../prompts/promptExperiment";
import { CAREER_CATALOG_HEADER, CAREER_CATALOG_LOADER_GUIDE, careerCapabilityDescription } from "./catalog";
import {
  CAREER_HANDBOOK_LOADER,
  careerHandbookLoaderTool,
} from "../handbooks/registry";
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
  coreToolNames?: readonly string[];
  allowLoaders?: boolean;
  promptExperiment?: CareerPromptExperiment;
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
    ...(args.coreToolNames ?? []),
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
        TOOL_DESCRIPTIONS.load_career_capabilities,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          capabilityIds: {
            type: "array",
            items: { type: "string", enum: ids },
          },
        },
        required: ["capabilityIds"],
      },
    },
  };
  const allowLoaders =
    args.allowLoaders !== false && args.eligibleTools.length > 0;
  const hasLoader =
    allowLoaders && args.mode === "progressive" && ids.length > 0;
  // Preserve a stable core prefix and registry order regardless of load order.
  const tools =
    args.mode === "full"
      ? [
          ...args.eligibleTools,
          ...(allowLoaders ? [careerHandbookLoaderTool] : []),
        ]
      : [
          ...core,
          ...(hasLoader ? [loader] : []),
          ...(allowLoaders ? [careerHandbookLoaderTool] : []),
          ...deferred,
        ];
  const catalogText = !args.eligibleTools.length
    ? ""
    : [
        careerPromptText(args.promptExperiment, "capability_catalog", CAREER_CATALOG_HEADER),
        ...(hasLoader
          ? [
              careerPromptText(args.promptExperiment, "capability_catalog_loader", CAREER_CATALOG_LOADER_GUIDE),
            ]
          : []),
        ...catalog.flatMap((c) => {
          const description = careerCapabilityDescription(c, eligibleNames, args.promptExperiment);
          return description ? [`- ${c.id}: ${description}`] : [];
        }),
      ].filter(Boolean).join("\n");

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
      .filter(
        (n) => n !== CAREER_CAPABILITY_LOADER && n !== CAREER_HANDBOOK_LOADER
      ),
  };
}

export type ResolvedCareerCapabilities = ReturnType<
  typeof resolveCareerCapabilities
>;
