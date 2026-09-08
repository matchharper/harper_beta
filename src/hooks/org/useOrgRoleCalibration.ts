import { queryOptions, useQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { CompanyRoleCalibrationResponse } from "@/lib/org/roleCalibration";
import { queryKeys } from "@/lib/queryKeys";

export function orgRoleCalibrationQueryOptions(args: {
  calibrationId?: string | null;
  enabled?: boolean;
  profileId?: string | null;
  roleId?: string | null;
  workspaceId?: string | null;
}) {
  const workspaceId = args.workspaceId?.trim() ?? "";
  const roleId = args.roleId?.trim() ?? "";
  const calibrationId = args.calibrationId?.trim() ?? "";
  const profileId = args.profileId?.trim() ?? "";
  return queryOptions({
    queryKey: queryKeys.org.roleCalibration(
      workspaceId,
      roleId,
      calibrationId,
      profileId
    ),
    queryFn: () => {
      const params = new URLSearchParams({ roleId, workspaceId });
      if (calibrationId) params.set("calibrationId", calibrationId);
      if (profileId) params.set("profileId", profileId);
      return fetchWithInternalAuth<CompanyRoleCalibrationResponse>(
        `/api/org/role-calibration?${params.toString()}`
      );
    },
    enabled:
      (args.enabled ?? true) &&
      Boolean(workspaceId) &&
      Boolean(roleId) &&
      (!profileId || Boolean(calibrationId)),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });
}

export function useOrgRoleCalibration(args: {
  calibrationId?: string | null;
  enabled?: boolean;
  profileId?: string | null;
  roleId?: string | null;
  workspaceId?: string | null;
}) {
  return useQuery(orgRoleCalibrationQueryOptions(args));
}
