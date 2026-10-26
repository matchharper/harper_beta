import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  reconcileOrgCandidateSave,
  reconcileOrgCompanyIntro,
  reconcileOrgRole,
} from "./mutationCache";
import type {
  OrgBoardResponse,
  OrgBootstrapResponse,
  OrgCompanyIntroMutationResponse,
  OrgRole,
  OrgTalentDetailResponse,
} from "./server";

const role = {
  roleId: "r",
  workspaceId: "w",
  name: "Old",
  teamId: "team",
  memory: "Keep memory",
  lastConversationAt: "2026-10-21",
} as OrgRole;
const item = {
  roleId: "r",
  talentId: "t",
  roleName: "Old",
  recommendationId: "company-intro:i",
  stage: "company_intro",
  companyIntro: { id: "i", status: "ready" },
  capabilities: { pass: true, requestIntro: true, viewResume: false },
};
const board = {
  workspaceId: "w",
  roleId: "r",
  items: [item],
  totalCount: 1,
} as OrgBoardResponse;
const introResult: OrgCompanyIntroMutationResponse = {
  ok: true,
  introCandidateId: "i",
  status: "requested",
  candidateUpdate: {
    roleId: "r",
    talentId: "t",
    status: "awaiting_talent",
    requestedAt: "2026-10-21T00:00:00Z",
    candidateSentAt: null,
    talentDecisionAt: null,
    closeReason: null,
    companyAppeal: "Our message",
    nextStageId: null,
    updatedAt: "2026-10-21T00:00:00Z",
  },
};
const boardKey = queryKeys.org.board({ workspaceId: "w", roleId: "r" });

test("saving and unsaving publish the confirmed timestamp while a board refresh is delayed or fails", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(boardKey, board);
  let fail!: (error: Error) => void;
  const observer = new QueryObserver(client, {
    queryKey: boardKey,
    staleTime: Infinity,
    queryFn: () =>
      new Promise<OrgBoardResponse>((_, reject) => {
        fail = reject;
      }),
  });
  const stop = observer.subscribe(() => {});
  const input = {
    workspaceId: "w",
    roleId: "r",
    recommendationId: item.recommendationId,
  };
  try {
    await reconcileOrgCandidateSave(client, input, "2026-10-21T00:00:00Z");
    assert.equal(observer.getCurrentResult().isFetching, true);
    assert.equal(
      observer.getCurrentResult().data?.items[0].savedAt,
      "2026-10-21T00:00:00Z"
    );
    fail(new Error("Network unavailable"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(observer.getCurrentResult().isRefetchError, true);
    assert.equal(
      observer.getCurrentResult().data?.items[0].savedAt,
      "2026-10-21T00:00:00Z"
    );
    await reconcileOrgCandidateSave(client, input, null);
    assert.equal(observer.getCurrentResult().data?.items[0].savedAt, null);
  } finally {
    stop();
    client.clear();
  }
});

test("Intro completion discards a pre-write read, updates the candidate, and leaves unrelated caches alone", async () => {
  const client = new QueryClient();
  client.setQueryData(boardKey, board);
  const otherRole = queryKeys.org.board({ workspaceId: "w", roleId: "other" });
  const otherWorkspace = queryKeys.org.board({ workspaceId: "other" });
  const labels = queryKeys.org.boardProfileLabels({
    workspaceId: "w",
    recommendationIds: ["company-intro:i"],
  });
  for (const key of [otherRole, otherWorkspace, labels])
    client.setQueryData(key, { untouched: true });
  let resolveRead!: (value: OrgBoardResponse) => void;
  let aborted = false;
  const staleRead = client
    .fetchQuery({
      queryKey: boardKey,
      staleTime: 0,
      queryFn: ({ signal }) => {
        signal.addEventListener("abort", () => {
          aborted = true;
        });
        return new Promise<OrgBoardResponse>((resolve) => {
          resolveRead = resolve;
        });
      },
    })
    .catch(() => undefined);
  try {
    await reconcileOrgCompanyIntro(client, "w", introResult);
    assert.equal(aborted, true);
    const updated = client.getQueryData<OrgBoardResponse>(boardKey)!;
    assert.equal(updated.items[0].stage, "intro_requested");
    assert.equal(updated.items[0].companyIntro?.candidateSentAt, null);
    assert.equal(updated.items[0].capabilities.requestIntro, false);
    assert.equal(updated.items[0].capabilities.viewResume, false);
    resolveRead(board);
    await staleRead;
    assert.equal(client.getQueryData(boardKey), updated);
    for (const key of [otherRole, otherWorkspace, labels])
      assert.equal(client.getQueryState(key)?.isInvalidated, false);
  } finally {
    resolveRead?.(board);
    client.clear();
  }
});

test("Role save reconciles aliases and preserves memory/team while background refresh is still pending", async () => {
  const client = new QueryClient();
  const bootstrap = {
    workspace: { workspaceId: "w" },
    roles: [role],
    teamRoles: [{ roleId: "r", name: "Old", teamId: "team" }],
  } as OrgBootstrapResponse;
  const key = queryKeys.org.bootstrap("w");
  client.setQueryData(key, bootstrap);
  client.setQueryData(queryKeys.org.bootstrap(""), bootstrap);
  client.setQueryData(queryKeys.org.bootstrap("other"), {
    workspace: { workspaceId: "other" },
    roles: [],
  });
  let finish!: (value: OrgBootstrapResponse) => void;
  const observer = new QueryObserver(client, {
    queryKey: key,
    staleTime: Infinity,
    queryFn: () =>
      new Promise<OrgBootstrapResponse>((resolve) => {
        finish = resolve;
      }),
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await reconcileOrgRole(client, {
      ...role,
      name: "Saved",
      memory: null,
      lastConversationAt: null,
    });
    assert.equal(observer.getCurrentResult().isFetching, true);
    for (const alias of [key, queryKeys.org.bootstrap("")]) {
      const data = client.getQueryData<OrgBootstrapResponse>(alias)!;
      assert.equal(data.roles[0].name, "Saved");
      assert.equal(data.roles[0].memory, "Keep memory");
      assert.equal(data.roles[0].lastConversationAt, "2026-10-21");
      assert.equal(data.roles[0].teamId, "team");
      assert.equal(data.teamRoles?.[0].name, "Saved");
    }
    assert.equal(
      client.getQueryState(queryKeys.org.bootstrap("other"))?.isInvalidated,
      false
    );
  } finally {
    finish?.(bootstrap);
    unsubscribe();
    client.clear();
  }
});

test("Intro pass updates detail and invalidates billing for only the affected workspace", async () => {
  const client = new QueryClient();
  const key = queryKeys.org.detail({
    workspaceId: "w",
    roleId: "r",
    talentId: "t",
  });
  client.setQueryData(key, {
    workspace: { workspaceId: "w" },
    role,
    talent: { userId: "t" },
    companyIntro: item.companyIntro,
    capabilities: item.capabilities,
    recommendation: { stage: "company_intro" },
  });
  const billing = ["org", "billing", "summary", "w"];
  const otherBilling = ["org", "billing", "summary", "other"];
  client.setQueryData(billing, {});
  client.setQueryData(otherBilling, {});
  try {
    await reconcileOrgCompanyIntro(client, "w", {
      ...introResult,
      status: "passed",
      candidateUpdate: { ...introResult.candidateUpdate!, status: "passed" },
    });
    const detail = client.getQueryData<OrgTalentDetailResponse>(key)!;
    assert.equal(detail.recommendation.stage, "process_stopped");
    assert.equal(detail.capabilities.pass, false);
    assert.equal(client.getQueryState(billing)?.isInvalidated, true);
    assert.equal(client.getQueryState(otherBilling)?.isInvalidated, false);
  } finally {
    client.clear();
  }
});

test("unprojectable connected response waits for canonical data instead of inventing permissions", async () => {
  const client = new QueryClient();
  client.setQueryData(boardKey, board);
  let finish!: (value: OrgBoardResponse) => void;
  const observer = new QueryObserver(client, {
    queryKey: boardKey,
    staleTime: Infinity,
    queryFn: () =>
      new Promise<OrgBoardResponse>((resolve) => {
        finish = resolve;
      }),
  });
  const unsubscribe = observer.subscribe(() => {});
  let completed = false;
  try {
    const pending = reconcileOrgCompanyIntro(client, "w", {
      ok: true,
      introCandidateId: "i",
      status: "already_connected",
    }).then(() => {
      completed = true;
    });
    await Promise.resolve();
    assert.equal(completed, false);
    assert.equal(client.getQueryData(boardKey), board);
    finish({ ...board, items: [] });
    await pending;
    assert.equal(completed, true);
  } finally {
    finish?.(board);
    unsubscribe();
    client.clear();
  }
});

test("deleted Roles leave active lists immediately while historical team assignments remain", async () => {
  const client = new QueryClient();
  const bootstrapKey = queryKeys.org.bootstrap("w");
  client.setQueryData(bootstrapKey, {
    workspace: { workspaceId: "w" },
    roles: [role],
    teamRoles: [{ roleId: "r", name: role.name, teamId: role.teamId }],
  });
  client.setQueryData(boardKey, board);
  const allRoles = queryKeys.org.board({ workspaceId: "w" });
  client.setQueryData(allRoles, {
    ...board,
    items: [item, { ...item, roleId: "other" }],
    totalCount: 2,
  });
  try {
    await reconcileOrgRole(client, { ...role, status: "deleted" });
    assert.equal(
      client.getQueryData<OrgBootstrapResponse>(bootstrapKey)?.roles.length,
      0
    );
    assert.equal(
      client.getQueryData<OrgBootstrapResponse>(bootstrapKey)?.teamRoles
        ?.length,
      1
    );
    assert.equal(
      client.getQueryData<OrgBoardResponse>(boardKey)?.items.length,
      0
    );
    assert.equal(
      client.getQueryData<OrgBoardResponse>(allRoles)?.items[0].roleId,
      "other"
    );
    assert.equal(
      client.getQueryData<OrgBoardResponse>(allRoles)?.totalCount,
      1
    );
  } finally {
    client.clear();
  }
});
