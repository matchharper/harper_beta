import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/router";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { useOrgBootstrap } from "@/hooks/org/useOrg";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import { getOrgPermissions, type OrgPermissions } from "@/lib/org/permissions";
import { buildOrgHref, type OrgWorkspacePageId } from "@/lib/org/routes";
import type {
  OrgBootstrapResponse,
  OrgMember,
  OrgRole,
  OrgWorkspace,
} from "@/lib/org/server";
import { useAuthStore } from "@/store/useAuthStore";
import { useOrgWorkspaceStore } from "@/store/useOrgWorkspaceStore";

function getQueryText(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

export type OrgWorkspaceContextValue = {
  bootstrap: OrgBootstrapResponse;
  currentUser: OrgMember | null;
  currentUserEmail: string | null;
  internalOpsAccess: boolean;
  orgId: string;
  page: OrgWorkspacePageId;
  permissions: OrgPermissions;
  roles: OrgRole[];
  user: User;
  workspace: OrgWorkspace;
  workspaces: OrgWorkspace[];
};

const OrgWorkspaceContext = createContext<OrgWorkspaceContextValue | null>(
  null
);

export function useOrgWorkspace() {
  const context = useContext(OrgWorkspaceContext);
  if (!context) {
    throw new Error(
      "useOrgWorkspace must be used within an OrgWorkspaceProvider"
    );
  }
  return context;
}

export function OrgWorkspaceProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: OrgWorkspaceContextValue;
}) {
  return (
    <OrgWorkspaceContext.Provider value={value}>
      {children}
    </OrgWorkspaceContext.Provider>
  );
}

export function useOrgWorkspaceController({
  legacyEntry,
  page,
}: {
  legacyEntry: boolean;
  page: OrgWorkspacePageId;
}) {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const orgId = router.isReady ? getQueryText(router.query.orgId) : "";
  const hasHydratedLastWorkspace = useOrgWorkspaceStore(
    (state) => state.hasHydrated
  );
  const lastWorkspaceId = useOrgWorkspaceStore(
    (state) => state.lastWorkspaceId
  );
  const setLastWorkspaceId = useOrgWorkspaceStore(
    (state) => state.setLastWorkspaceId
  );
  const requestedOrgId = orgId || lastWorkspaceId;
  const bootstrapQuery = useOrgBootstrap({
    enabled:
      router.isReady &&
      Boolean(user) &&
      (Boolean(orgId) || hasHydratedLastWorkspace),
    orgId: requestedOrgId,
  });
  const bootstrap = bootstrapQuery.data ?? null;
  const workspace = bootstrap?.workspace ?? null;
  const currentUser = bootstrap?.currentUser ?? null;
  const permissions = useMemo(
    () => getOrgPermissions(currentUser?.authority),
    [currentUser?.authority]
  );
  const internalOpsAccess = isInternalDomainEmail(user?.email);
  const roles = useMemo(() => bootstrap?.roles ?? [], [bootstrap?.roles]);

  useEffect(() => {
    if (
      !legacyEntry ||
      !router.isReady ||
      !user ||
      !hasHydratedLastWorkspace ||
      orgId ||
      !lastWorkspaceId
    ) {
      return;
    }
    void router.replace(
      buildOrgHref({
        orgId: lastWorkspaceId,
        page: "home",
      })
    );
  }, [
    hasHydratedLastWorkspace,
    lastWorkspaceId,
    legacyEntry,
    orgId,
    router,
    router.isReady,
    user,
  ]);

  useEffect(() => {
    if (!workspace) return;
    setLastWorkspaceId(workspace.workspaceId);
  }, [setLastWorkspaceId, workspace]);

  useEffect(() => {
    if (!router.isReady || !user || !bootstrap) return;
    if (!workspace) {
      if (requestedOrgId && requestedOrgId === lastWorkspaceId) {
        setLastWorkspaceId("");
      }
      if (orgId) void router.replace("/org");
      return;
    }
    if (!legacyEntry && orgId === workspace.workspaceId) {
      return;
    }
    if (legacyEntry) {
      void router.replace(
        buildOrgHref({
          orgId: workspace.workspaceId,
          page: "home",
        })
      );
      return;
    }
    void router.replace(
      {
        pathname: router.pathname,
        query: { ...router.query, orgId: workspace.workspaceId },
      },
      undefined,
      { shallow: true }
    );
  }, [
    bootstrap,
    lastWorkspaceId,
    legacyEntry,
    orgId,
    requestedOrgId,
    router,
    router.isReady,
    setLastWorkspaceId,
    user,
    workspace,
  ]);

  const contextValue = useMemo<OrgWorkspaceContextValue | null>(() => {
    if (!bootstrap || !user || !workspace) return null;
    return {
      bootstrap,
      currentUser,
      currentUserEmail: currentUser?.email ?? user.email ?? null,
      internalOpsAccess,
      orgId,
      page,
      permissions,
      roles,
      user,
      workspace,
      workspaces: bootstrap.workspaces,
    };
  }, [
    bootstrap,
    currentUser,
    internalOpsAccess,
    orgId,
    page,
    permissions,
    roles,
    user,
    workspace,
  ]);

  return {
    authLoading,
    bootstrapQuery,
    contextValue,
    orgId,
    routerReady: router.isReady,
    user,
    workspace,
  };
}
