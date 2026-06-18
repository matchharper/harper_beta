import { showToast } from "@/components/toast/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Textarea from "@/components/ui/textarea";
import type {
  AdminCareerFunnelStep,
  AdminCareerUtmResponse,
  AdminCareerUtmSourceRow,
} from "@/lib/adminCareerAnalytics/types";
import { ADMIN_PAGE_PASSWORD } from "@/lib/admin";
import { buildCareerUtmUrl, normalizeCareerUtmSource } from "@/lib/career/utm";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, LoaderCircle, Pencil, Plus, RefreshCw, Shuffle, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

type AdminCareerUtmTabProps = {
  excludedEmails: string[];
};

type SourceMutationInput = {
  description: string;
  id?: string;
  source: string;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "-";
  return new Date(time).toLocaleString("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

const formatRate = (value: number | null) => {
  if (value === null) return "-";
  return `${Math.round(value * 100).toLocaleString("ko-KR")}%`;
};

const createRandomSource = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

async function fetchCareerUtmSources(args: {
  excludedEmails: string[];
  selectedSource: string | null;
}) {
  const params = new URLSearchParams();
  if (args.selectedSource) params.set("source", args.selectedSource);
  for (const email of args.excludedEmails) {
    params.append("excludedEmail", email);
  }

  const response = await fetch(`/api/admin/career/utm?${params.toString()}`, {
    headers: {
      "x-admin-password": ADMIN_PAGE_PASSWORD,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as
    | AdminCareerUtmResponse
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "UTM source를 불러오지 못했습니다."
    );
  }

  return payload as AdminCareerUtmResponse;
}

async function mutateCareerUtmSource(
  method: "DELETE" | "PATCH" | "POST",
  input: SourceMutationInput
) {
  const response = await fetch("/api/admin/career/utm", {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": ADMIN_PAGE_PASSWORD,
    },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    source?: { source?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "UTM source 변경에 실패했습니다.");
  }

  return payload;
}

function SourceFunnel({ steps }: { steps: AdminCareerFunnelStep[] }) {
  const maxCount = Math.max(...steps.map((step) => step.count), 1);

  return (
    <div className="space-y-2">
      {steps.map((step, index) => {
        const width = `${Math.max(
          (step.count / maxCount) * 100,
          step.count > 0 ? 4 : 0
        )}%`;

        return (
          <div
            key={step.key}
            className="grid gap-2 md:grid-cols-[160px_1fr_96px] md:items-center"
          >
            <div>
              <div className="text-[12px] font-medium text-black">
                {index + 1}. {step.label}
              </div>
              <div className="text-[11px] text-black/40">{step.detail}</div>
            </div>
            <div className="h-7 border border-black/10 bg-black/[0.03]">
              <div className="h-full bg-black" style={{ width }} />
            </div>
            <div className="flex items-center justify-between gap-2 md:block md:text-right">
              <div className="text-[14px] font-semibold text-black">
                {step.count.toLocaleString("ko-KR")}
              </div>
              <div className="text-[11px] text-black/45">
                {formatRate(step.rateFromEntry)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminCareerUtmTab({
  excludedEmails,
}: AdminCareerUtmTabProps) {
  const queryClient = useQueryClient();
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [sourceInput, setSourceInput] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState("");
  const [editingDescription, setEditingDescription] = useState("");

  const query = useQuery({
    queryKey: ["admin-career-utm", selectedSource, excludedEmails],
    queryFn: () => fetchCareerUtmSources({ excludedEmails, selectedSource }),
    placeholderData: (previousData) => previousData,
  });

  const effectiveSelectedSource =
    selectedSource ?? query.data?.selectedSource?.source ?? null;

  const selectedRow = useMemo(() => {
    if (!effectiveSelectedSource) return null;
    return (
      query.data?.sources.find(
        (source) => source.source === effectiveSelectedSource
      ) ?? null
    );
  }, [effectiveSelectedSource, query.data?.sources]);

  const createMutation = useMutation({
    mutationFn: (input: SourceMutationInput) =>
      mutateCareerUtmSource("POST", input),
    onSuccess: (payload) => {
      const createdSource = payload.source?.source ?? sourceInput;
      setSourceInput("");
      setDescriptionInput("");
      setSelectedSource(createdSource);
      showToast({ message: "UTM source를 만들었습니다.", variant: "white" });
      void queryClient.invalidateQueries({ queryKey: ["admin-career-utm"] });
    },
    onError: (error) => {
      showToast({
        message:
          error instanceof Error ? error.message : "UTM source 생성 실패",
        variant: "error",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: SourceMutationInput) =>
      mutateCareerUtmSource("PATCH", input),
    onSuccess: (payload) => {
      const nextSource = payload.source?.source ?? editingSource;
      setEditingId(null);
      setSelectedSource(nextSource);
      showToast({ message: "UTM source를 수정했습니다.", variant: "white" });
      void queryClient.invalidateQueries({ queryKey: ["admin-career-utm"] });
    },
    onError: (error) => {
      showToast({
        message:
          error instanceof Error ? error.message : "UTM source 수정 실패",
        variant: "error",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (input: SourceMutationInput) =>
      mutateCareerUtmSource("DELETE", input),
    onSuccess: (_payload, input) => {
      if (effectiveSelectedSource === input.source) setSelectedSource(null);
      showToast({ message: "UTM source를 삭제했습니다.", variant: "white" });
      void queryClient.invalidateQueries({ queryKey: ["admin-career-utm"] });
    },
    onError: (error) => {
      showToast({
        message:
          error instanceof Error ? error.message : "UTM source 삭제 실패",
        variant: "error",
      });
    },
  });

  const handleCreate = () => {
    const normalizedSource = normalizeCareerUtmSource(sourceInput);
    if (!normalizedSource) {
      showToast({
        message: "source는 영문/숫자/하이픈/언더스코어 1-80자로 입력해 주세요.",
        variant: "error",
      });
      return;
    }

    createMutation.mutate({
      description: descriptionInput,
      source: normalizedSource,
    });
  };

  const startEditing = (source: AdminCareerUtmSourceRow) => {
    setEditingId(source.id);
    setEditingSource(source.source);
    setEditingDescription(source.description ?? "");
  };

  const handleUpdate = () => {
    if (!editingId) return;
    const normalizedSource = normalizeCareerUtmSource(editingSource);
    if (!normalizedSource) {
      showToast({
        message: "source는 영문/숫자/하이픈/언더스코어 1-80자로 입력해 주세요.",
        variant: "error",
      });
      return;
    }

    updateMutation.mutate({
      description: editingDescription,
      id: editingId,
      source: normalizedSource,
    });
  };

  const handleDelete = (source: AdminCareerUtmSourceRow) => {
    if (!window.confirm(`${source.source} source를 삭제할까요?`)) return;
    deleteMutation.mutate({
      description: source.description ?? "",
      id: source.id,
      source: source.source,
    });
  };

  const handleCopy = async (source: string) => {
    try {
      await navigator.clipboard.writeText(buildCareerUtmUrl(source));
      showToast({ message: "source URL을 복사했습니다.", variant: "white" });
    } catch {
      showToast({ message: "복사에 실패했습니다.", variant: "error" });
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
      <div className="space-y-4">
        <Card className="rounded-md border-black/10 shadow-none">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-[14px] font-semibold text-black">
              UTM source 만들기
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-2 md:grid-cols-[220px_1fr_auto] md:items-start">
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={sourceInput}
                  onChange={(event) => setSourceInput(event.target.value)}
                  placeholder="source"
                  className="h-9 rounded-none border-black/15 text-[12px]"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9 rounded-none border-black/15 bg-white text-black shadow-none"
                  onClick={() => setSourceInput(createRandomSource())}
                  title="랜덤 UUID 생성"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="text-[11px] text-black/40">
                영문 소문자, 숫자, 하이픈, 언더스코어만 사용합니다.
              </div>
            </div>
            <Textarea
              value={descriptionInput}
              onChange={(event) => setDescriptionInput(event.target.value)}
              placeholder="설명"
              className="min-h-[72px] rounded-none border-black/15 text-[12px]"
            />
            <Button
              type="button"
              className="h-9 rounded-none text-[12px]"
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              만들기
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-md border-black/10 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 pb-2">
            <div>
              <CardTitle className="text-[14px] font-semibold text-black">
                Source 목록
              </CardTitle>
              <div className="mt-1 text-[12px] text-black/45">
                생성 날짜, 최근 진입 날짜, source URL, 설명을 관리합니다.
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 rounded-none border-black/15 bg-white text-[12px] text-black shadow-none"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              {query.isFetching ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            {query.error ? (
              <div className="mb-3 border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
                {query.error instanceof Error
                  ? query.error.message
                  : "UTM source를 불러오지 못했습니다."}
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow className="border-black/10 hover:bg-transparent">
                    <TableHead className="h-8 px-2 text-[11px]">
                      생성 날짜
                    </TableHead>
                    <TableHead className="h-8 px-2 text-[11px]">
                      최근 진입
                    </TableHead>
                    <TableHead className="h-8 px-2 text-[11px]">
                      Source
                    </TableHead>
                    <TableHead className="h-8 px-2 text-[11px]">
                      설명
                    </TableHead>
                    <TableHead className="h-8 px-2 text-right text-[11px]">
                      관리
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="px-2 py-6 text-center text-[12px] text-black/45"
                      >
                        UTM source를 불러오는 중입니다.
                      </TableCell>
                    </TableRow>
                  ) : query.data?.sources.length ? (
                    query.data.sources.map((source) => {
                      const isSelected =
                        effectiveSelectedSource === source.source;
                      const isEditing = editingId === source.id;

                      return (
                        <TableRow
                          key={source.id}
                          className={cn(
                            "cursor-pointer border-black/10",
                            isSelected && "bg-black/[0.04]"
                          )}
                          onClick={() => setSelectedSource(source.source)}
                        >
                          <TableCell className="px-2 py-2 text-[11px] text-black/55">
                            {formatDateTime(source.createdAt)}
                          </TableCell>
                          <TableCell className="px-2 py-2 text-[11px] text-black/55">
                            {formatDateTime(source.lastEnteredAt)}
                          </TableCell>
                          <TableCell className="px-2 py-2">
                            {isEditing ? (
                              <Input
                                value={editingSource}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) =>
                                  setEditingSource(event.target.value)
                                }
                                className="h-8 rounded-none border-black/15 font-mono text-[12px]"
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <code className="font-mono text-[12px] text-black">
                                  {source.source}
                                </code>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="icon"
                                  className="h-7 w-7 rounded-none border-black/15 bg-white text-black shadow-none"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleCopy(source.source);
                                  }}
                                  title="URL 복사"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[300px] px-2 py-2">
                            {isEditing ? (
                              <Input
                                value={editingDescription}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) =>
                                  setEditingDescription(event.target.value)
                                }
                                className="h-8 rounded-none border-black/15 text-[12px]"
                              />
                            ) : (
                              <div className="truncate text-[12px] text-black/60">
                                {source.description || "-"}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="px-2 py-2">
                            <div
                              className="flex justify-end gap-1"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {isEditing ? (
                                <>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon"
                                    className="h-7 w-7 rounded-none border-black/15 bg-white text-black shadow-none"
                                    onClick={handleUpdate}
                                    disabled={updateMutation.isPending}
                                    title="저장"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon"
                                    className="h-7 w-7 rounded-none border-black/15 bg-white text-black shadow-none"
                                    onClick={() => setEditingId(null)}
                                    title="취소"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon"
                                    className="h-7 w-7 rounded-none border-black/15 bg-white text-black shadow-none"
                                    onClick={() => startEditing(source)}
                                    title="수정"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon"
                                    className="h-7 w-7 rounded-none border-red-200 bg-white text-red-600 shadow-none"
                                    onClick={() => handleDelete(source)}
                                    disabled={deleteMutation.isPending}
                                    title="삭제"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="px-2 py-6 text-center text-[12px] text-black/45"
                      >
                        아직 생성한 UTM source가 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-md border-black/10 shadow-none">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-[14px] font-semibold text-black">
            Source funnel
          </CardTitle>
          <div className="mt-1 text-[12px] text-black/45">
            {selectedRow
              ? `${selectedRow.source} · entry ${selectedRow.entryCount.toLocaleString(
                  "ko-KR"
                )} · identified ${selectedRow.identifiedUserCount.toLocaleString(
                  "ko-KR"
                )}`
              : "왼쪽에서 source row를 선택하세요."}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-2">
          {query.data?.selectedSource ? (
            <>
              <SourceFunnel steps={query.data.selectedSource.steps} />
              <div className="border-t border-black/10 pt-3">
                <div className="mb-2 text-[12px] font-medium text-black">
                  진입한 사람들
                </div>
                <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                  {query.data.selectedSource.people.length === 0 ? (
                    <div className="border border-black/10 bg-black/[0.02] p-3 text-[12px] text-black/45">
                      아직 이 source로 진입한 사람이 없습니다.
                    </div>
                  ) : (
                    query.data.selectedSource.people.map((person) => (
                      <div
                        key={person.localId}
                        className="border border-black/10 bg-white p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-semibold text-black">
                              {person.name || person.email || "Anonymous"}
                            </div>
                            <div className="mt-0.5 truncate font-mono text-[11px] text-black/40">
                              {person.email || person.localId}
                            </div>
                          </div>
                          <span className="shrink-0 border border-black/10 bg-black/[0.03] px-2 py-1 text-[11px] font-medium text-black/65">
                            {person.currentStepLabel}
                          </span>
                        </div>
                        <div className="mt-2 text-[11px] text-black/42">
                          entry {formatDateTime(person.firstEnteredAt)} · login{" "}
                          {formatDateTime(person.lastLoginAt)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="border border-black/10 bg-black/[0.02] p-4 text-[12px] text-black/45">
              source를 만들면 여기에서 해당 source의 funnel을 볼 수 있습니다.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
