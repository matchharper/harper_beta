import { LoaderCircle } from "lucide-react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { OrgAllRolesOverview } from "@/components/org/OrgAllRolesOverview";
import { OrgAppBar } from "@/components/org/OrgAppBar";
import { OrgEditDialog } from "@/components/org/OrgEditDialog";
import { OrgLoginScreen } from "@/components/org/OrgLoginScreen";
import { OrgPipeline } from "@/components/org/OrgPipeline";
import { OrgRoleTabs } from "@/components/org/OrgRoleTabs";
import { TalentDetailSimpleView } from "@/components/org/TalentDetailSimpleView";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  useOrgBoard,
  useOrgBootstrap,
  useOrgTalentDetail,
  useSetOrgCandidateStage,
  useUpdateOrgRole,
  useUpdateOrgWorkspace,
} from "@/hooks/org/useOrg";
import { isInternalEmail } from "@/lib/internalAccess";
import type {
  OrgBoardItem,
  OrgRole,
  OrgStageChangeOptions,
} from "@/lib/org/server";
import { useAuthStore } from "@/store/useAuthStore";

function getQueryText(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function buildOrgHref(args: { orgId?: string | null; roleId?: string | null }) {
  const params = new URLSearchParams();
  const orgId = args.orgId?.trim();
  const roleId = args.roleId?.trim();
  if (orgId) params.set("orgId", orgId);
  if (roleId) params.set("roleId", roleId);
  const query = params.toString();
  return query ? `/org?${query}` : "/org";
}

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-default text-neutral-primary">
      <div className="inline-flex items-center gap-2 text-sm text-neutral-muted">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        불러오는 중
      </div>
    </main>
  );
}

function EmptyWorkspaceScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-default px-4 text-neutral-primary">
      <div className="text-center text-sm text-neutral-muted">
        아직 가입된 Workspace가 없습니다.
      </div>
    </main>
  );
}

export default function OrgPage() {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const orgId = router.isReady ? getQueryText(router.query.orgId) : "";
  const urlRoleId = router.isReady ? getQueryText(router.query.roleId) : "";
  const [signOutPending, setSignOutPending] = useState(false);
  const [nameQuery, setNameQuery] = useState("");
  const [recommendedFromDate, setRecommendedFromDate] = useState("");
  const [recommendedToDate, setRecommendedToDate] = useState("");
  const [selectedItem, setSelectedItem] = useState<OrgBoardItem | null>(null);
  const [editMode, setEditMode] = useState<"workspace" | "role" | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);

  const bootstrapQuery = useOrgBootstrap({
    enabled: router.isReady && Boolean(user),
    orgId,
  });
  const workspace = bootstrapQuery.data?.workspace ?? null;
  const canSwitchWorkspace = isInternalEmail(user?.email);
  const roles = useMemo(
    () => bootstrapQuery.data?.roles ?? [],
    [bootstrapQuery.data?.roles]
  );
  const activeRoleId = urlRoleId || "all";
  const effectiveActiveRoleId =
    activeRoleId === "all" || roles.some((role) => role.roleId === activeRoleId)
      ? activeRoleId
      : "all";
  const isAllTab = effectiveActiveRoleId === "all";
  const selectedRoleId = isAllTab ? null : effectiveActiveRoleId;
  const visibleSelectedItem =
    selectedItem &&
    (isAllTab || !selectedRoleId || selectedItem.roleId === selectedRoleId)
      ? selectedItem
      : null;
  const boardQuery = useOrgBoard({
    enabled: Boolean(workspace),
    query: isAllTab ? "" : nameQuery,
    recommendedFromDate: isAllTab ? "" : recommendedFromDate,
    recommendedToDate: isAllTab ? "" : recommendedToDate,
    roleId: selectedRoleId,
    workspaceId: workspace?.workspaceId ?? null,
  });
  const detailQuery = useOrgTalentDetail({
    enabled: Boolean(workspace && visibleSelectedItem),
    recommendationId: visibleSelectedItem?.recommendationId ?? null,
    roleId: visibleSelectedItem?.roleId ?? null,
    talentId: visibleSelectedItem?.talentId ?? null,
    workspaceId: workspace?.workspaceId ?? null,
  });
  const setStage = useSetOrgCandidateStage();
  const updateWorkspace = useUpdateOrgWorkspace();
  const updateRole = useUpdateOrgRole();
  const activeRole = useMemo(
    () => roles.find((role) => role.roleId === effectiveActiveRoleId) ?? null,
    [effectiveActiveRoleId, roles]
  );
  const editingRole = useMemo(
    () =>
      editMode === "role"
        ? (roles.find(
            (role) => role.roleId === (editingRoleId ?? effectiveActiveRoleId)
          ) ?? null)
        : null,
    [editMode, editingRoleId, effectiveActiveRoleId, roles]
  );

  const openWorkspaceEdit = () => {
    setEditingRoleId(null);
    setEditMode("workspace");
  };

  const openRoleEdit = (roleId: string) => {
    if (!roleId || roleId === "all") return;
    setEditingRoleId(roleId);
    setEditMode("role");
  };

  const closeEditDialog = () => {
    setEditMode(null);
    setEditingRoleId(null);
  };

  useEffect(() => {
    if (!router.isReady || !user || !bootstrapQuery.data?.workspace || orgId)
      return;
    const nextOrgId = bootstrapQuery.data.workspace.workspaceId;
    router.replace(
      buildOrgHref({ orgId: nextOrgId, roleId: urlRoleId || "all" }),
      undefined,
      { shallow: true }
    );
  }, [bootstrapQuery.data?.workspace, orgId, router, urlRoleId, user]);

  const handleSignOut = async () => {
    setSignOutPending(true);
    try {
      await signOut();
      router.replace("/org");
    } finally {
      setSignOutPending(false);
    }
  };

  const handleWorkspaceSelect = (workspaceId: string) => {
    if (!workspaceId || workspaceId === workspace?.workspaceId) return;
    setNameQuery("");
    setRecommendedFromDate("");
    setRecommendedToDate("");
    setSelectedItem(null);
    setEditMode(null);
    setEditingRoleId(null);
    router.push(buildOrgHref({ orgId: workspaceId, roleId: "all" }));
  };

  const handleRoleTabChange = (roleId: string) => {
    const nextRoleId = roleId || "all";
    setSelectedItem(null);
    setEditMode(null);
    setEditingRoleId(null);
    if (!workspace) return;
    router.push(
      buildOrgHref({ orgId: workspace.workspaceId, roleId: nextRoleId }),
      undefined,
      { shallow: true }
    );
  };

  const handleStageChange = (
    item: OrgBoardItem,
    stage: OrgBoardItem["stage"],
    options?: OrgStageChangeOptions
  ) => {
    if (!workspace) return;
    setStage.mutate({
      acceptReason: options?.acceptReason ?? null,
      introEmails: options?.introEmails ?? null,
      recommendationId: item.recommendationId,
      roleId: item.roleId,
      stage,
      stopNote: options?.stopNote ?? null,
      stopReason: options?.stopReason ?? null,
      talentId: item.talentId,
      workspaceId: workspace.workspaceId,
    });
  };

  if (authLoading || !router.isReady) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <OrgLoginScreen orgId={orgId} />;
  }

  if (bootstrapQuery.isLoading) {
    return <LoadingScreen />;
  }

  if (bootstrapQuery.error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg-default px-4 text-neutral-primary">
        <div className={cx(opsTheme.errorNotice, "w-full max-w-md")}>
          {bootstrapQuery.error instanceof Error
            ? bootstrapQuery.error.message
            : "Organization을 불러오지 못했습니다."}
        </div>
      </main>
    );
  }

  if (!workspace) {
    return <EmptyWorkspaceScreen />;
  }

  const selectedAcceptStageId =
    visibleSelectedItem && boardQuery.data?.stages
      ? (boardQuery.data.stages.find(
          (stage) =>
            stage.id !== "pending_connection" &&
            stage.id !== "process_stopped" &&
            (!stage.roleId || stage.roleId === visibleSelectedItem.roleId)
        )?.id ?? null)
      : null;
  const pendingRecommendationId = setStage.isPending
    ? (setStage.variables?.recommendationId ?? null)
    : null;

  return (
    <>
      <Head>
        <title>{workspace.companyName} · Organization</title>
      </Head>
      <main className="min-h-screen bg-bg-default text-neutral-primary">
        <OrgAppBar
          canSwitchWorkspace={canSwitchWorkspace}
          currentUser={bootstrapQuery.data?.currentUser ?? null}
          members={bootstrapQuery.data?.members ?? []}
          onEditWorkspace={openWorkspaceEdit}
          onSignOut={() => void handleSignOut()}
          onWorkspaceSelect={handleWorkspaceSelect}
          signOutPending={signOutPending}
          workspace={workspace}
          workspaces={bootstrapQuery.data?.workspaces ?? []}
        />
        <div className="mx-auto max-w-[1440px] space-y-3 px-3 py-3 sm:px-5">
          <OrgRoleTabs
            activeRoleId={effectiveActiveRoleId}
            onChange={handleRoleTabChange}
            roles={roles}
          />

          {isAllTab ? (
            <OrgAllRolesOverview
              board={boardQuery.data}
              error={
                boardQuery.error instanceof Error ? boardQuery.error : null
              }
              isLoading={boardQuery.isLoading}
              onEditRole={openRoleEdit}
              onRoleSelect={handleRoleTabChange}
              roles={roles}
            />
          ) : (
            <OrgPipeline
              activeRoleId={effectiveActiveRoleId}
              activeRoleName={activeRole?.name ?? null}
              board={boardQuery.data}
              currentUserEmail={
                bootstrapQuery.data?.currentUser?.email ?? user.email ?? null
              }
              error={
                boardQuery.error instanceof Error ? boardQuery.error : null
              }
              isLoading={boardQuery.isLoading}
              nameQuery={nameQuery}
              onEditRole={() => openRoleEdit(effectiveActiveRoleId)}
              onNameQueryChange={setNameQuery}
              onRecommendedDateChange={(from, to) => {
                setRecommendedFromDate(from);
                setRecommendedToDate(to);
              }}
              onSelect={setSelectedItem}
              onStageChange={handleStageChange}
              pendingRecommendationId={pendingRecommendationId}
              recommendedFromDate={recommendedFromDate}
              recommendedToDate={recommendedToDate}
              workspaceId={workspace.workspaceId}
            />
          )}
        </div>
      </main>

      <TalentDetailSimpleView
        acceptStageId={selectedAcceptStageId}
        companyName={workspace.companyName}
        currentUserEmail={
          bootstrapQuery.data?.currentUser?.email ?? user.email ?? null
        }
        decisionPending={Boolean(
          visibleSelectedItem &&
          pendingRecommendationId === visibleSelectedItem.recommendationId
        )}
        detail={detailQuery.data}
        error={detailQuery.error instanceof Error ? detailQuery.error : null}
        isLoading={detailQuery.isLoading}
        onAcceptCandidate={async ({ acceptReason, introEmails, stage }) => {
          if (!visibleSelectedItem) return;
          if (!workspace) return;
          await setStage.mutateAsync({
            acceptReason,
            introEmails,
            recommendationId: visibleSelectedItem.recommendationId,
            roleId: visibleSelectedItem.roleId,
            stage,
            stopNote: null,
            stopReason: null,
            talentId: visibleSelectedItem.talentId,
            workspaceId: workspace.workspaceId,
          });
        }}
        onClose={() => setSelectedItem(null)}
        onRejectCandidate={(options) => {
          if (!visibleSelectedItem) return;
          handleStageChange(visibleSelectedItem, "process_stopped", options);
        }}
        open={Boolean(visibleSelectedItem)}
        talentId={visibleSelectedItem?.talentId ?? null}
        workspaceId={workspace.workspaceId}
      />

      <OrgEditDialog
        key={[
          editMode ?? "closed",
          workspace.workspaceId,
          workspace.updatedAt,
          editingRole?.roleId ?? "",
          editingRole?.updatedAt ?? "",
        ].join(":")}
        mode={editMode === "role" ? "role" : "workspace"}
        open={Boolean(editMode)}
        pending={updateWorkspace.isPending || updateRole.isPending}
        value={
          editMode === "role" && editingRole
            ? {
                description: editingRole.description,
                employmentTypes: editingRole.employmentTypes,
                externalJdUrl: editingRole.externalJdUrl,
                locationText: editingRole.locationText,
                name: editingRole.name,
                request: editingRole.request,
                status: editingRole.status,
                workMode: editingRole.workMode,
              }
            : {
                companyDescription: workspace.companyDescription,
                pitch: workspace.pitch,
                request: workspace.request,
              }
        }
        onClose={closeEditDialog}
        onSubmit={(value) => {
          if (editMode === "role") {
            if (!editingRole) return;
            updateRole.mutate(
              {
                description: value.description ?? null,
                employmentTypes: value.employmentTypes ?? [],
                externalJdUrl: value.externalJdUrl ?? null,
                locationText: value.locationText ?? null,
                name: value.name ?? null,
                request: value.request ?? null,
                roleId: editingRole.roleId,
                status: value.status ?? null,
                workMode: value.workMode ?? null,
                workspaceId: workspace.workspaceId,
              },
              { onSuccess: closeEditDialog }
            );
            return;
          }
          updateWorkspace.mutate(
            {
              companyDescription: value.companyDescription ?? null,
              pitch: value.pitch ?? null,
              request: value.request ?? null,
              workspaceId: workspace.workspaceId,
            },
            { onSuccess: closeEditDialog }
          );
        }}
      />
    </>
  );
}
