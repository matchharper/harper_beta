"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { MatchingRunHistory } from "@/lib/companyFirstSearch/history";

type SearchData = MatchingRunHistory & {
  activeRun: { id: string; status: string } | null;
};
const statusLabel: Record<string, string> = {
  queued: "대기 중",
  running: "실행 중",
  succeeded: "완료",
  skipped: "건너뜀",
  failed: "실패",
  delivery_pending: "전달 대기",
};
const triggerLabel: Record<string, string> = {
  scheduled: "정기 검색",
  talent_first_requested: "수동 Talent-first",
  company_requested: "회사 요청",
  role_activated: "Role 활성화",
  manual: "수동 검색",
};
function time(value: string | null) {
  return value
    ? new Date(value).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        hour12: false,
      })
    : "—";
}

/** Internal operational controls shared by Ops and the Org home dev panel. */
export function RoleSearchControls({
  roles,
  workspaceId,
  surface,
  showHistory = true,
}: {
  roles: Array<{ roleId: string; name: string }>;
  workspaceId: string;
  surface: "ops" | "org";
  showHistory?: boolean;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.roleId ?? "");
  const roleId = roles.some((role) => role.roleId === selectedRoleId)
    ? selectedRoleId
    : (roles[0]?.roleId ?? "");
  // Keying the body also prevents in-flight mutation state leaking between roles.
  return (
    <section className="space-y-3">
      {showHistory && (
        <h3 className="text-sm font-medium">Role search history</h3>
      )}
      {roles.length > 1 && (
        <Select
          value={roleId}
          items={roles.map((role) => ({
            value: role.roleId,
            label: role.name,
          }))}
          onValueChange={(value) => value && setSelectedRoleId(value)}
        >
          <SelectTrigger aria-label="검색 이력 Role 선택">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((role) => (
              <SelectItem key={role.roleId} value={role.roleId}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {roleId ? (
        <RoleSearchBody
          key={`${workspaceId}:${roleId}:${surface}`}
          roleId={roleId}
          workspaceId={workspaceId}
          surface={surface}
          showHistory={showHistory}
        />
      ) : (
        <p className="text-sm text-neutral-muted">조회할 Role이 없습니다.</p>
      )}
    </section>
  );
}

function RoleSearchBody({
  roleId,
  workspaceId,
  surface,
  showHistory,
}: {
  roleId: string;
  workspaceId: string;
  surface: "ops" | "org";
  showHistory: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const client = useQueryClient();
  const endpoint =
    surface === "ops"
      ? "/api/internal/matching/search"
      : "/api/org/dev/role-search";
  const queryKey = ["dev-role-search", surface, workspaceId, roleId];
  const query = useQuery({
    queryKey: [...queryKey, offset],
    queryFn: () =>
      fetchWithInternalAuth<SearchData>(
        `${endpoint}?${new URLSearchParams({ workspaceId, roleId, offset: String(offset) })}`
      ),
    refetchInterval: 5_000,
  });
  const mutation = useMutation({
    mutationFn: () =>
      fetchWithInternalAuth<{ runId: string; status: string }>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, roleId }),
      }),
    onSuccess: async (run) => {
      await client.cancelQueries({ queryKey });
      client.setQueriesData<SearchData>({ queryKey }, (data) =>
        data
          ? { ...data, activeRun: { id: run.runId, status: run.status } }
          : data
      );
      setOffset(0);
      await client.invalidateQueries({ queryKey });
    },
    onError: async () => {
      await client.invalidateQueries({ queryKey });
    },
  });
  const active = query.data?.activeRun;
  const busy = mutation.isPending || Boolean(active);
  const error = mutation.error ?? query.error;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <MuteButton
          type="button"
          disabled={busy || query.isPending || query.isError}
          aria-busy={busy}
          className={
            busy
              ? "bg-action-faded text-action disabled:opacity-100"
              : undefined
          }
          onClick={() => mutation.mutate()}
        >
          {busy ? (
            <Loader2
              aria-hidden
              className="size-4 animate-spin motion-reduce:animate-none"
            />
          ) : (
            <Play aria-hidden className="size-4" />
          )}
          {busy
            ? active?.status === "running"
              ? "검색 실행 중"
              : "검색 대기 중"
            : "Talent-first 지금 실행"}
        </MuteButton>
        <MuteButton
          type="button"
          aria-label="검색 상태 새로고침"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw aria-hidden className="size-4" />
        </MuteButton>
        {query.isPending && (
          <span className="text-xs text-neutral-muted">검색 상태 확인 중…</span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-critical">
          {error.message}
        </p>
      )}
      {showHistory && (
        <>
          <p className="text-xs text-neutral-muted">
            한국 시간 기준 · 선정 인원은 발송 완료 인원과 다릅니다. 여러 Role을
            포함한 과거 실행은 실행 전체 집계입니다.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "요청 시각",
                  "실행 계기",
                  "상태",
                  "시작",
                  "종료",
                  "검토 인원",
                  "Talent-first 선정",
                  "Company-first 선정",
                ].map((label) => (
                  <TableHead key={label} className="whitespace-nowrap">
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.items.map((run, index) => (
                <TableRow key={run.id ?? `${run.createdAt}:${index}`}>
                  <TableCell className="whitespace-nowrap">
                    {time(run.createdAt)}
                  </TableCell>
                  <TableCell>
                    {triggerLabel[run.trigger] ?? run.trigger}
                  </TableCell>
                  <TableCell
                    className={
                      run.status === "queued" || run.status === "running"
                        ? "text-action"
                        : run.status === "failed"
                          ? "text-critical"
                          : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      {(run.status === "queued" ||
                        run.status === "running") && (
                        <Loader2
                          aria-hidden
                          className="size-3 animate-spin motion-reduce:animate-none"
                        />
                      )}
                      {statusLabel[run.status] ?? run.status}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {time(run.startedAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {time(run.finishedAt)}
                  </TableCell>
                  <TableCell>{run.reviewedTalents ?? "—"}</TableCell>
                  <TableCell>{run.candidateProposalsSelected ?? "—"}</TableCell>
                  <TableCell>{run.companyProposals ?? "—"}</TableCell>
                </TableRow>
              ))}
              {!query.isPending &&
                !query.isError &&
                !query.data?.items.length && (
                  <TableRow>
                    <TableCell colSpan={8}>검색 이력이 없습니다.</TableCell>
                  </TableRow>
                )}
            </TableBody>
          </Table>
          <div className="flex gap-2">
            <MuteButton
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              이전
            </MuteButton>
            <MuteButton
              disabled={query.data?.nextOffset == null}
              onClick={() => setOffset(query.data?.nextOffset ?? offset)}
            >
              다음
            </MuteButton>
          </div>
        </>
      )}
    </div>
  );
}
