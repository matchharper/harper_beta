import type { OrgAgentPromptContext } from "@/lib/org/agent/context";
import type {
  OrgAgentMessageAction,
  OrgAgentMessageMetadata,
} from "@/lib/org/agent/types";
import type { OrgRole, OrgWorkspace } from "@/lib/org/server";
import {
  isCompanyDetailsLongTextKey,
  type CompanyDataKey,
  type CompanyDetailsLongTextKey,
} from "@/lib/org/agent/companyDataCatalog";
import type { ResolvedCompanyDataChange } from "@/lib/org/agent/companyDataMutation";

type RequestChange = NonNullable<
  OrgAgentMessageMetadata["requestChanges"]
>[number];

export type OrgAgentToolResultMetadata = NonNullable<
  OrgAgentMessageMetadata["toolResults"]
>[number];

export type OrgAgentToolExecutionState = {
  activatedMoreData: Array<{
    activatedAt: string;
    activatedByUserMessageId: number;
    fullTextKeys: CompanyDetailsLongTextKey[];
    kind: "company_details" | "members" | "workspace_memory";
    scopeKey: string;
  }>;
  actions: OrgAgentMessageAction[];
  candidateConnectionConfirmations: NonNullable<
    OrgAgentMessageMetadata["candidateConnectionConfirmations"]
  >;
  contactDraftRef: NonNullable<
    OrgAgentMessageMetadata["contactDraftRef"]
  > | null;
  contactDraftRefs: NonNullable<OrgAgentMessageMetadata["contactDraftRefs"]>;
  company: OrgWorkspace;
  completeLongTextTargets: Set<string>;
  fullRoleRequestIds: Set<string>;
  internalTokenCorrectionCount: number;
  observedLongTextFingerprints: Map<string, string>;
  openedUrls: Set<string>;
  pendingFullRoleRequestIds: Set<string>;
  preferredRoleId: string | null;
  requestChanges: RequestChange[];
  requiredPresentationText: string | null;
  requiredPresentationTexts: string[];
  requiredContactPresentations: Array<{
    contactId: string;
    text: string;
  }>;
  requiredSlackContinuationLink: string | null;
  roleById: Map<string, OrgRole>;
  stagedProposal: null | {
    changes: ResolvedCompanyDataChange[];
    eventContent: string;
    preview: string;
    summary: string;
  };
  fallbackReply: string | null;
  toolResults: OrgAgentToolResultMetadata[];
  successfulWebSearchQueries: Set<string>;
  updateProposalRef: null | { proposalId: string; summary: string };
  updateSummaries: string[];
};

function enforceOrgAgentReplyInvariantsRaw(
  state: OrgAgentToolExecutionState,
  modelReply: string
) {
  const roleCreationResult = state.toolResults.findLast(
    (result) => result.name === "start_role_creation"
  );
  if (!roleCreationResult) {
    return modelReply;
  }
  if (
    roleCreationResult.status === "success" &&
    state.requiredSlackContinuationLink
  ) {
    const requiredLink = state.requiredSlackContinuationLink;
    const match = requiredLink.match(/^<([^|>]+)\|([^>]+)>$/);
    const fallback = state.fallbackReply?.trim() ?? "";
    let reply = modelReply.trim() || fallback;

    if (match) {
      const [, url, label] = match;
      const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      reply = reply
        .replace(new RegExp(`<${escapedUrl}(?:\\|[^>]*)?>`, "g"), requiredLink)
        .replace(
          new RegExp(`\\[[^\\]]+\\]\\(${escapedUrl}\\)`, "g"),
          requiredLink
        );
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const sentinel = "\u0000HARPER_ROLE_CONTINUATION_LINK\u0000";
      reply = reply
        .replaceAll(requiredLink, sentinel)
        .replace(
          new RegExp(
            `(^|\\n)[ \\t]*(?:#{1,6}[ \\t]+)?(?:\\*\\*|__|\\*)?${escapedLabel}(?:\\*\\*|__|\\*)?[ \\t]*(?=\\n|$)`,
            "g"
          ),
          "$1"
        )
        .replaceAll(sentinel, requiredLink)
        .replace(/\n{3,}/g, "\n\n");
    }

    const firstRequiredLinkIndex = reply.indexOf(requiredLink);
    if (firstRequiredLinkIndex >= 0) {
      const before = reply.slice(0, firstRequiredLinkIndex);
      const after = reply
        .slice(firstRequiredLinkIndex + requiredLink.length)
        .replaceAll(requiredLink, "")
        .replace(/\n{3,}/g, "\n\n");
      reply = `${before}${requiredLink}${after}`.trim();
    } else {
      reply = [reply, requiredLink].filter(Boolean).join("\n\n");
    }
    return reply;
  }
  return modelReply;
}

function enforceVerifiedWorkspaceLinkOrgId(
  state: OrgAgentToolExecutionState,
  reply: string
) {
  const workspaceId = state.company.workspaceId;
  if (!workspaceId || !reply.includes("https://matchharper.com/org/")) {
    return reply;
  }

  return reply.replace(/https:\/\/matchharper\.com\/org\/[^\s<>|)]+/g, (url) =>
    url.replace(/([?&](?:amp;)?orgId=)[^&\s<>|)]+/, `$1${workspaceId}`)
  );
}

/**
 * Preserve model-authored prose, while preventing a workspace-scoped Harper
 * link from silently pointing at a hallucinated organization. Links are not
 * added or required here; only an orgId already present in a Harper org URL is
 * replaced with the authoritative workspace id.
 */
export function enforceOrgAgentReplyInvariants(
  state: OrgAgentToolExecutionState,
  modelReply: string
) {
  return enforceVerifiedWorkspaceLinkOrgId(
    state,
    enforceOrgAgentReplyInvariantsRaw(state, modelReply)
  );
}

export function getOrgAgentRequiredPresentationTexts(
  state: OrgAgentToolExecutionState
) {
  return Array.from(
    new Set(
      [
        ...state.requiredPresentationTexts,
        ...state.requiredContactPresentations.map((item) => item.text),
        state.requiredPresentationText,
      ].filter((value): value is string => Boolean(value))
    )
  );
}

export function getOrgAgentContactDraftReferences(metadata: unknown) {
  const source =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const candidates = [
    ...(Array.isArray(source.contactDraftRefs) ? source.contactDraftRefs : []),
    source.contactDraftRef,
  ];
  const byContactAndRevision = new Map<
    string,
    { contactId: string; revision: number }
  >();
  for (const candidate of candidates) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      continue;
    }
    const item = candidate as Record<string, unknown>;
    const contactId = String(item.contactId ?? "").trim();
    const revision = Number(item.revision);
    if (!contactId || !Number.isInteger(revision) || revision < 1) continue;
    byContactAndRevision.set(`${contactId}:${revision}`, {
      contactId,
      revision,
    });
  }
  return Array.from(byContactAndRevision.values());
}

export function hasOrgAgentContactDraftReference(args: {
  contactId: string;
  metadata: unknown;
  revision: number;
}) {
  return getOrgAgentContactDraftReferences(args.metadata).some(
    (ref) => ref.contactId === args.contactId && ref.revision === args.revision
  );
}

export function captureOrgAgentContactDraftState(args: {
  input: Record<string, unknown>;
  state: OrgAgentToolExecutionState;
}) {
  const ref = args.state.contactDraftRef;
  if (ref) {
    const existingRef = args.state.contactDraftRefs.findIndex(
      (item) => item.contactId === ref.contactId
    );
    if (existingRef >= 0) args.state.contactDraftRefs[existingRef] = ref;
    else args.state.contactDraftRefs.push(ref);
    if (args.state.requiredPresentationText) {
      const presentation = {
        contactId: ref.contactId,
        text: args.state.requiredPresentationText,
      };
      const existingPresentation =
        args.state.requiredContactPresentations.findIndex(
          (item) => item.contactId === ref.contactId
        );
      if (existingPresentation >= 0) {
        args.state.requiredContactPresentations[existingPresentation] =
          presentation;
      } else {
        args.state.requiredContactPresentations.push(presentation);
      }
    }
    return;
  }
  const cancelledContactId = String(args.input.contactId ?? "").trim();
  if (!cancelledContactId || args.input.action !== "cancel") return;
  args.state.contactDraftRefs = args.state.contactDraftRefs.filter(
    (item) => item.contactId !== cancelledContactId
  );
  args.state.requiredContactPresentations =
    args.state.requiredContactPresentations.filter(
      (item) => item.contactId !== cancelledContactId
    );
}

export function createOrgAgentToolExecutionState(
  context: OrgAgentPromptContext
): OrgAgentToolExecutionState {
  const state = createOrgAgentToolExecutionStateFromSnapshot({
    completeRoleRequestIds: context.completeRoleRequestIds,
    roles: context.roles,
    workspace: context.workspace,
  });
  for (const observation of context.defaultLongTextObservations ?? []) {
    markOrgAgentLongTextComplete({
      key: observation.key,
      observedValue: observation.value,
      roleId: observation.roleId,
      state,
    });
  }
  for (const [key, marker] of Object.entries(
    context.retainedMoreData?.companyDetails?.fields ?? {}
  )) {
    if (marker.complete && isCompanyDetailsLongTextKey(key)) {
      markOrgAgentLongTextComplete({
        key,
        observedValue:
          context.retainedMoreData?.companyDetails?.values[key] ?? null,
        state,
      });
    }
  }
  if (context.retainedMoreData?.workspaceMemory?.complete) {
    markOrgAgentLongTextComplete({
      key: "workspace_memory",
      observedValue: context.retainedMoreData.workspaceMemory.content ?? null,
      state,
    });
  }
  return state;
}

/**
 * Builds the runtime bookkeeping state from already-loaded authoritative rows.
 * Debug and inspection paths can use this without paying for the full prompt,
 * recent conversation, retained-data, and pipeline context reads.
 */
export function createOrgAgentToolExecutionStateFromSnapshot(args: {
  completeRoleRequestIds?: string[];
  roles: OrgAgentPromptContext["roles"];
  workspace: OrgAgentPromptContext["workspace"];
}): OrgAgentToolExecutionState {
  const state: OrgAgentToolExecutionState = {
    activatedMoreData: [],
    actions: [],
    candidateConnectionConfirmations: [],
    contactDraftRef: null,
    contactDraftRefs: [],
    company: { ...args.workspace },
    completeLongTextTargets: new Set(),
    fullRoleRequestIds: new Set(args.completeRoleRequestIds ?? []),
    internalTokenCorrectionCount: 0,
    observedLongTextFingerprints: new Map(),
    openedUrls: new Set(),
    pendingFullRoleRequestIds: new Set(),
    preferredRoleId: null,
    requestChanges: [],
    requiredPresentationText: null,
    requiredPresentationTexts: [],
    requiredContactPresentations: [],
    requiredSlackContinuationLink: null,
    roleById: new Map(args.roles.map((role) => [role.roleId, { ...role }])),
    stagedProposal: null,
    fallbackReply: null,
    toolResults: [],
    successfulWebSearchQueries: new Set(),
    updateProposalRef: null,
    updateSummaries: [],
  };
  return state;
}

function longTextTarget(key: CompanyDataKey, roleId?: string | null) {
  return `${key}:${roleId ?? "workspace"}`;
}

/**
 * Fingerprints the exact application value that was made visible to the model.
 * Long-text fields are strings or null, but the tagged JSON fallback keeps the
 * comparison deterministic if a catalog type is expanded later.
 */
export function fingerprintOrgAgentObservedValue(value: unknown) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return `string:${JSON.stringify(value)}`;
  return `${typeof value}:${JSON.stringify(value)}`;
}

export function markOrgAgentLongTextComplete(args: {
  key: CompanyDataKey;
  observedValue: unknown;
  roleId?: string | null;
  state: OrgAgentToolExecutionState;
}) {
  const target = longTextTarget(args.key, args.roleId);
  args.state.completeLongTextTargets.add(target);
  args.state.observedLongTextFingerprints.set(
    target,
    fingerprintOrgAgentObservedValue(args.observedValue)
  );
}

export function isOrgAgentLongTextComplete(args: {
  currentValue: unknown;
  key: CompanyDataKey;
  roleId: string | null;
  state: OrgAgentToolExecutionState;
}) {
  const target = longTextTarget(args.key, args.roleId);
  return (
    args.state.completeLongTextTargets.has(target) &&
    args.state.observedLongTextFingerprints.get(target) ===
      fingerprintOrgAgentObservedValue(args.currentValue)
  );
}

/** Promote a completed read only after its result is ready for the next model step. */
export function promoteOrgAgentToolReadVisibility(
  state: OrgAgentToolExecutionState
) {
  for (const roleId of state.pendingFullRoleRequestIds) {
    state.fullRoleRequestIds.add(roleId);
  }
  state.pendingFullRoleRequestIds.clear();
}
