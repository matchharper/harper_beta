"use client";

import { Activity, Check, Copy, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { InternalOnlySurface } from "@/components/org/internal/InternalOnlySurface";
import { MuteButton } from "@/components/ui/button";
import { Code } from "@/components/ui/code";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { OrgRoleMatchingHealthToolResult } from "@/lib/org/agent/roleMatchingHealth";
import type { OrgRole } from "@/lib/org/server";

export function OrgRoleMatchingHealthDevControls({
  roles,
  workspaceId,
}: {
  roles: OrgRole[];
  workspaceId: string;
}) {
  const roleOptions = useMemo(
    () => roles.map((role) => ({ label: role.name, value: role.roleId })),
    [roles]
  );
  const [selectedRoleId, setSelectedRoleId] = useState(
    roleOptions[0]?.value ?? ""
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] =
    useState<OrgRoleMatchingHealthToolResult | null>(null);
  const [copied, setCopied] = useState(false);
  const activeRoleId = roleOptions.some(
    (role) => role.value === selectedRoleId
  )
    ? selectedRoleId
    : (roleOptions[0]?.value ?? "");
  const selectedRole = roles.find((role) => role.roleId === activeRoleId);
  const formattedResult = result ?? "";

  const loadResult = async () => {
    if (!activeRoleId || loading) return;
    setDialogOpen(true);
    setLoading(true);
    setError("");
    setResult(null);
    setCopied(false);
    try {
      const params = new URLSearchParams({
        roleId: activeRoleId,
        workspaceId,
      });
      const payload =
        await fetchWithInternalAuth<OrgRoleMatchingHealthToolResult>(
          `/api/org/dev/role-matching-health?${params.toString()}`
        );
      setResult(payload);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "결과를 불러오지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    if (!formattedResult) return;
    await navigator.clipboard.writeText(formattedResult);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <>
      <InternalOnlySurface
        className="border-y border-neutral-1000-a10 bg-bg-default px-4 pb-5 pt-12 sm:px-5"
        label="Harper 내부 전용 · Dev controls"
      >
        <div className="relative z-20 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Activity aria-hidden className="size-4 text-neutral-muted" />
              <h2 className="text-[14px] font-medium text-neutral-primary">
                Role matching health
              </h2>
            </div>
            <p className="text-[13px] font-light leading-5 text-neutral-muted">
              Role 하나를 선택해 company-side LLM용 tool result를 읽습니다.
              데이터는 변경하지 않습니다.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="grid min-w-0 gap-1.5 text-[12px] text-neutral-muted">
              대상 Role
              <Select
                items={roleOptions}
                onValueChange={(value) => value && setSelectedRoleId(value)}
                value={activeRoleId}
              >
                <SelectTrigger aria-label="Matching health 대상 Role">
                  <SelectValue placeholder="Role 선택" />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {roleOptions.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <MuteButton
              disabled={!activeRoleId || loading}
              onClick={() => void loadResult()}
              size="lg"
              variant="dark"
            >
              {loading ? <Loader2 aria-hidden className="animate-spin" /> : null}
              Tool result 불러오기
            </MuteButton>
          </div>
        </div>
      </InternalOnlySurface>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100svh-32px)] w-[calc(100%-24px)] max-w-[900px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg p-0">
          <DialogHeader className="border-b border-neutral-1000-a05 px-5 py-4 pr-12">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <DialogTitle className="truncate text-base">
                  {selectedRole?.name ?? "Role"} · matching health
                </DialogTitle>
                <DialogDescription>
                  company-side LLM에 그대로 들어갈 tool result입니다.
                </DialogDescription>
              </div>
              {result ? (
                <MuteButton onClick={() => void copyResult()} size="sm">
                  {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                  {copied ? "복사됨" : "텍스트 복사"}
                </MuteButton>
              ) : null}
            </div>
          </DialogHeader>

          <div className="min-h-0 overflow-auto p-5">
            {loading ? (
              <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-neutral-muted">
                <Loader2 aria-hidden className="size-4 animate-spin" />
                Tool result를 불러오는 중
              </div>
            ) : null}
            {!loading && error ? (
              <div className="rounded-md border border-critical/30 bg-critical-faded p-4 text-sm text-critical">
                {error}
              </div>
            ) : null}
            {!loading && result ? (
              <Code
                className="overflow-visible whitespace-pre-wrap"
                type="block"
              >
                {formattedResult}
              </Code>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
