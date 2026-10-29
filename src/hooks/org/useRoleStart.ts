import { mutationOptions, queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { queryKeys } from "@/lib/queryKeys";
import type { RoleStartView } from "@/lib/org/roleStart/view";
import type { FirstThreeProfile } from "@/components/org/role-start/RoleStartCandidateProfile";

type Issue = { level: "conflict"; text: string };

export type RoleStartResponse = {
  session: RoleStartView | null;
  role: {
    status: string;
    hasDescription: boolean;
    description: string | null;
    name: string;
    locationText: string | null;
    workMode: string | null;
    employmentTypes: string[];
    salaryRange: string | null;
  };
  issues: Issue[];
  /** Work history and education of the first three while they are rated. */
  profiles?: Record<string, FirstThreeProfile>;
  /** The fixed compensation question, asked first when the JD stated none. */
  compensation?: { chips: Array<{ ko: string; en: string }> } | null;
};

export type RoleStartMutationResult = {
  session?: RoleStartView | null;
  issues?: Issue[];
  applied?: string;
  missingFields?: string[];
  role?: RoleStartResponse["role"];
  compensation?: RoleStartResponse["compensation"];
};

const ACTIVE_PHASES = new Set<RoleStartView["phase"]>(["drafting", "searching", "registering", "batch"]);

/** One cache and polling policy for the onboarding screen, start tab and chat. */
export function roleStartQueryOptions(roleId: string, workspaceId: string) {
  return queryOptions({
    queryKey: queryKeys.org.roleStart(workspaceId, roleId),
    queryFn: ({ signal }) => fetchWithInternalAuth<RoleStartResponse>(
      `/api/org/role-start?roleId=${encodeURIComponent(roleId)}&workspaceId=${encodeURIComponent(workspaceId)}`,
      { signal },
    ),
    staleTime: 30_000,
    refetchInterval: (current) => {
      const session = current.state.data?.session;
      if (!session) return current.state.dataUpdateCount < 12 ? 3_000 : false;
      const verdictsPending = session.phase === "evaluating" &&
        session.firstCandidates.some(candidate => !candidate.verdict && !candidate.failed);
      return ACTIVE_PHASES.has(session.phase) || verdictsPending ||
        (session.phase === "questions" && !session.pendingQuestion) ||
        (session.phase === "review" && session.refining) ? 1_000 : false;
    },
  });
}

export function useRoleStartQuery(roleId: string, workspaceId: string, enabled = true) {
  return useQuery({ ...roleStartQueryOptions(roleId, workspaceId), enabled: enabled && Boolean(roleId && workspaceId) });
}

export async function applyRoleStartMutation(client: QueryClient, workspaceId: string, roleId: string, result: RoleStartMutationResult) {
  const queryKey = queryKeys.org.roleStart(workspaceId, result.session?.roleId ?? roleId);
  // A GET begun before this write must not restore the previous question.
  await client.cancelQueries({ queryKey });
  client.setQueryData<RoleStartResponse>(queryKey, previous => {
    if (!("session" in result)) return previous;
    if (!previous && !result.role) return previous;
    if (previous?.session && result.session && previous.session.revision > result.session.revision) return previous;
    return {
      ...previous,
      session: result.session ?? null,
      role: result.role ?? previous!.role,
      issues: result.issues ?? previous?.issues ?? [],
      compensation: "compensation" in result ? result.compensation : previous?.compensation,
    };
  });
  // Auxiliary actions with no snapshot, and first-three profile enrichment,
  // refresh independently. The confirmed mutation is already usable.
  const data = client.getQueryData<RoleStartResponse>(queryKey);
  const needsProfiles = result.session?.phase === "evaluating" && result.session.firstCandidates.some(
    candidate => !data?.profiles?.[candidate.talentId],
  );
  if (!("session" in result) || !data || needsProfiles) void client.invalidateQueries({ queryKey });
}

export function roleStartMutationOptions(client: QueryClient, workspaceId: string, roleId: string) {
  return mutationOptions({
    mutationFn: (body: Record<string, unknown>) => fetchWithInternalAuth<RoleStartMutationResult>("/api/org/role-start", {
      body: JSON.stringify({ roleId, workspaceId, ...body }),
      headers: { "Content-Type": "application/json" }, method: "POST",
    }),
    onMutate: (body) => client.cancelQueries({ queryKey: queryKeys.org.roleStart(workspaceId, String(body.roleId ?? roleId)) }),
    onSuccess: (result, body) => applyRoleStartMutation(client, workspaceId, String(body.roleId ?? roleId), result),
  });
}
