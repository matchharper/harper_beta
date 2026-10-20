import type { OrgBuiltInStageId, OrgCustomStageId, OrgStageId } from "./server";
import { getOrgImplicitAcceptanceStage } from "./recommendationStage";
import { isOrgInternalStage } from "./candidateDecision";

function normalizeTagKey(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const INTERNAL_ACCEPTED_STAGE_TAG = "내부:수락";
export const STAGE_TAG_BY_STAGE: Record<
  Exclude<OrgBuiltInStageId, "company_intro" | "intro_requested">,
  string
> = {
  accepted: INTERNAL_ACCEPTED_STAGE_TAG,
  archived: "내부:아카이브",
  pending_connection: "내부:연결대기",
  connected: "내부:연결됨",
  final_offer: "내부:최종오퍼",
  process_stopped: "내부:프로세스중단",
};
const STAGE_BY_TAG_KEY = new Map(
  Object.entries(STAGE_TAG_BY_STAGE).map(([stage, tag]) => [
    normalizeTagKey(tag),
    stage as OrgBuiltInStageId,
  ])
);

export function getVisibleOrgStage(args: {
  connectedByOrgAction: boolean;
  customStageByTagKey: ReadonlyMap<string, OrgCustomStageId>;
  feedback: string | null | undefined;
  includeInternalAccepted: boolean;
  isInternalRecommendation: boolean;
  savedStage: string | null | undefined;
  tags: Array<{ tag: string }>;
}): { stage: OrgStageId; stageTag: string | null } | null {
  for (const tag of args.tags) {
    const tagKey = normalizeTagKey(tag.tag);
    if (tagKey === normalizeTagKey(INTERNAL_ACCEPTED_STAGE_TAG)) {
      if (args.connectedByOrgAction) {
        return { stage: "connected", stageTag: tag.tag };
      }
      return args.includeInternalAccepted
        ? { stage: "accepted", stageTag: tag.tag }
        : null;
    }
    const builtIn = STAGE_BY_TAG_KEY.get(tagKey);
    if (builtIn) {
      if (isOrgInternalStage(builtIn) && !args.includeInternalAccepted) {
        return null;
      }
      return { stage: builtIn, stageTag: tag.tag };
    }
    if (tagKey === normalizeTagKey("내부:연결됨")) {
      return { stage: "connected", stageTag: tag.tag };
    }

    const custom = args.customStageByTagKey.get(tagKey);
    if (custom) return { stage: custom, stageTag: tag.tag };

    if (
      tagKey === normalizeTagKey("내부:거절") ||
      tagKey === normalizeTagKey("내부:보류")
    ) {
      return null;
    }
  }

  const implicitAcceptanceStage = getOrgImplicitAcceptanceStage({
    connectedByOrgAction: args.connectedByOrgAction,
    feedback: args.feedback,
    includeInternalAccepted: args.includeInternalAccepted,
    isInternalRecommendation: args.isInternalRecommendation,
    savedStage: args.savedStage,
  });
  return implicitAcceptanceStage
    ? { stage: implicitAcceptanceStage, stageTag: null }
    : null;
}
