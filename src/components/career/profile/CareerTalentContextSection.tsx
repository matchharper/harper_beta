"use client";

import { useMemo, useState } from "react";
import { InfoIcon, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltips } from "@/components/ui/tooltip";
import { useCareerT } from "@/i18n/useCareerT";
import type {
  CareerTalentContext,
  CareerTalentContextChange,
  CareerTalentContextCollection,
} from "../types";

type EditorState = {
  collection: CareerTalentContextCollection;
  row: CareerTalentContext | null;
} | null;

export default function CareerTalentContextSection({
  brief,
  memories,
  error,
  info,
  loadMemories,
  memoryHasMore,
  memoryLoaded,
  memoryLoadPending,
  mutate,
  pending,
}: {
  brief: CareerTalentContext[];
  memories: CareerTalentContext[];
  error?: string;
  info?: string;
  loadMemories?: (options?: { append?: boolean }) => boolean | Promise<boolean>;
  memoryHasMore?: boolean;
  memoryLoaded?: boolean;
  memoryLoadPending?: boolean;
  mutate?: (changes: CareerTalentContextChange[]) => boolean | Promise<boolean>;
  pending?: boolean;
}) {
  const t = useCareerT();
  const [editor, setEditor] = useState<EditorState>(null);
  const [label, setLabel] = useState("");
  const [content, setContent] = useState("");
  const [briefEditMode, setBriefEditMode] = useState(false);
  const [briefDrafts, setBriefDrafts] = useState<Record<number, string>>({});
  const [memoryListOpen, setMemoryListOpen] = useState(false);
  const [pendingDelete, setPendingDelete] =
    useState<CareerTalentContext | null>(null);

  const openEditor = (
    collection: CareerTalentContextCollection,
    row: CareerTalentContext | null
  ) => {
    setLabel(row?.label ?? "");
    setContent(row?.content ?? "");
    setEditor({ collection, row });
  };

  const canSubmit = useMemo(
    () =>
      Boolean(
        editor &&
        content.trim() &&
        (editor.collection === "memory" || editor.row || label.trim())
      ),
    [content, editor, label]
  );

  const briefChanges = useMemo<CareerTalentContextChange[]>(
    () =>
      brief.flatMap((row) => {
        const nextContent = (briefDrafts[row.id] ?? row.content).trim();
        if (!nextContent || nextContent === row.content.trim()) return [];
        return [
          {
            content: nextContent,
            expectedRevision: row.revision,
            id: row.id,
            op: "update" as const,
          },
        ];
      }),
    [brief, briefDrafts]
  );

  const canSaveBrief = useMemo(
    () =>
      Boolean(
        mutate &&
        briefChanges.length > 0 &&
        brief.every((row) =>
          Boolean((briefDrafts[row.id] ?? row.content).trim())
        )
      ),
    [brief, briefChanges.length, briefDrafts, mutate]
  );

  const beginBriefEdit = () => {
    setBriefDrafts(
      Object.fromEntries(brief.map((row) => [row.id, row.content]))
    );
    setBriefEditMode(true);
  };

  const cancelBriefEdit = () => {
    setBriefDrafts({});
    setBriefEditMode(false);
  };

  const saveBrief = async () => {
    if (!mutate || !canSaveBrief) return;
    if (await mutate(briefChanges)) cancelBriefEdit();
  };

  const submit = async () => {
    if (!editor || !mutate || !canSubmit) return;
    const row = editor.row;
    const change: CareerTalentContextChange = row
      ? {
          content: content.trim(),
          expectedRevision: row.revision,
          id: row.id,
          op: "update",
        }
      : {
          collection: editor.collection,
          content: content.trim(),
          ...(editor.collection === "brief" ? { label: label.trim() } : {}),
          op: "add",
        };
    if (await mutate([change])) setEditor(null);
  };

  const deleteRow = async () => {
    if (!pendingDelete || !mutate) return;
    if (
      await mutate([
        {
          expectedRevision: pendingDelete.revision,
          id: pendingDelete.id,
          op: "delete",
        },
      ])
    ) {
      setPendingDelete(null);
      setEditor(null);
      if (pendingDelete.collection === "brief") {
        if (brief.length <= 1) {
          cancelBriefEdit();
        } else {
          setBriefDrafts((current) => {
            const next = { ...current };
            delete next[pendingDelete.id];
            return next;
          });
        }
      }
    }
  };

  const editorTitle = editor
    ? editor.collection === "brief"
      ? editor.row
        ? t("career.profile.context.edit_brief", "탐색 기준 수정")
        : t("career.profile.context.add_brief", "탐색 기준 추가")
      : editor.row
        ? t("career.profile.context.edit_memory", "기억 수정")
        : t("career.profile.context.add_memory", "기억 추가")
    : "";

  return (
    <section className="space-y-4 md:px-1">
      <div>
        <div className="flex items-center justify-between gap-4">
          <h3 className="flex items-center gap-2 text-[14px] font-medium text-neutral-primary">
            {t("career.profile.context.brief_title", "Search Brief")}
            <Tooltips
              text={t(
                "career.profile.context.brief_description",
                "Harper가 기회를 찾고 판단할 때 적용하는 현재 기준이에요. 회사에 직접적으로 공개되지않고 선호하시는 기회를 찾기 위해 사용되며, 사용해서 회원님을 더 잘 소개할 수 있을 때 일부 언급될 수 있습니다."
              )}
            >
              <InfoIcon className="h-3.5 w-3.5 text-neutral-muted" />
            </Tooltips>
          </h3>
          {briefEditMode ? (
            <div className="flex shrink-0 items-center gap-2">
              <MuteButton
                disabled={pending}
                onClick={cancelBriefEdit}
                size="sm"
                type="button"
              >
                {t("career.profile.context.cancel", "취소")}
              </MuteButton>
              <MuteButton
                disabled={!canSaveBrief || pending}
                onClick={() => void saveBrief()}
                size="sm"
                type="button"
                variant="primary"
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {t("career.profile.context.save", "저장")}
              </MuteButton>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <MuteButton
                className="gap-1.5"
                disabled={!mutate || pending}
                onClick={() => openEditor("brief", null)}
                size="sm"
                type="button"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("career.profile.context.add", "추가")}
              </MuteButton>
              <MuteButton
                className="gap-1.5"
                disabled={!mutate || pending || brief.length === 0}
                onClick={beginBriefEdit}
                size="sm"
                type="button"
                variant="transparent"
              >
                <Pencil className="h-3.5 w-3.5" />
                {t("career.profile.context.edit", "수정")}
              </MuteButton>
            </div>
          )}
        </div>
      </div>
      <div className="rounded-[18px] border border-neutral-1000-a05 bg-bg-floating p-4 md:p-5 md:py-6">
        {brief.length > 0 ? (
          <dl className="mt-0 divide-y divide-neutral-1000-a05">
            {brief.map((row) => (
              <div
                className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[130px_minmax(0,1fr)] sm:gap-6"
                key={row.id}
              >
                <dt className="text-[13px] font-normal">
                  {briefEditMode ? (
                    <label htmlFor={`career-brief-${row.id}`}>
                      {row.label}
                    </label>
                  ) : (
                    row.label
                  )}
                </dt>
                <dd className="m-0 min-w-0">
                  {briefEditMode ? (
                    <div className="flex items-start gap-2">
                      <Textarea
                        aria-label={row.label ?? undefined}
                        autoResize
                        className="min-h-10 resize-y py-1.5  text-[13px] font-normal leading-5 text-neutral-800/90 resize-none"
                        disabled={pending}
                        id={`career-brief-${row.id}`}
                        maxLength={8000}
                        onChange={(event) =>
                          setBriefDrafts((current) => ({
                            ...current,
                            [row.id]: event.target.value,
                          }))
                        }
                        rows={1}
                        value={briefDrafts[row.id] ?? row.content}
                      />
                      <MuteButton
                        aria-label={t("career.profile.context.delete", "삭제")}
                        className="shrink-0 text-neutral-muted"
                        disabled={!mutate || pending}
                        onClick={() => setPendingDelete(row)}
                        size="sm"
                        type="button"
                        variant="transparent"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </MuteButton>
                    </div>
                  ) : (
                    <p className="whitespace-pre-line text-[13px] font-normal leading-5 text-neutral-800/90">
                      {row.content}
                    </p>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-4 text-[13px] text-neutral-muted">
            {t(
              "career.profile.context.brief_empty",
              "아직 정해진 탐색 기준이 없어요."
            )}
          </p>
        )}
      </div>

      {/* <div className="flex items-center justify-between gap-4 rounded-[14px] border border-neutral-1000-a05 bg-bg-floating p-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <Brain className="mt-0.5 h-4 w-4 shrink-0 text-neutral-muted" />
          <div>
            <div className="text-[13px] font-medium text-neutral-primary">
              {t("career.profile.context.memory_title", "Harper의 기억")}
              {memoryLoaded ? (
                <span className="ml-1.5 font-normal text-neutral-muted">
                  {memories.length}
                  {memoryHasMore ? "+" : ""}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[12px] leading-5 text-neutral-muted">
              {t(
                "career.profile.context.memory_description",
                "다음 대화와 기회 판단에 도움이 되도록 기억해 둔 맥락이에요."
              )}
            </p>
          </div>
        </div>
        <MuteButton
          className="shrink-0"
          onClick={() => {
            setMemoryListOpen(true);
            void loadMemories?.();
          }}
          size="sm"
          type="button"
        >
          {t("career.profile.context.manage", "관리")}
        </MuteButton>
      </div> */}

      {error ? (
        <p className="rounded-lg border border-critical/30 bg-critical-faded px-3 py-2 text-sm text-critical">
          {error}
        </p>
      ) : null}
      {info ? <p className="text-xs text-neutral-muted">{info}</p> : null}

      <TalentCareerModal
        bodyClassName="bg-bg-floating px-4 py-5 sm:px-5"
        closeOnBackdrop={!pending}
        footer={
          <div className="flex items-center justify-between gap-3">
            <div>
              {editor?.row ? (
                <MuteButton
                  className="gap-1.5"
                  disabled={pending}
                  onClick={() => setPendingDelete(editor.row)}
                  type="button"
                  variant="warn"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("career.profile.context.delete", "삭제")}
                </MuteButton>
              ) : null}
            </div>
            <div className="flex gap-2">
              <MuteButton
                disabled={pending}
                onClick={() => setEditor(null)}
                size="lg"
                type="button"
              >
                {t("career.profile.context.cancel", "취소")}
              </MuteButton>
              <MuteButton
                disabled={!canSubmit || pending}
                onClick={() => void submit()}
                size="lg"
                type="button"
                variant="primary"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("career.profile.context.save", "저장")}
              </MuteButton>
            </div>
          </div>
        }
        mobileBottomSheet
        onClose={() => {
          if (!pending) setEditor(null);
        }}
        open={Boolean(editor)}
        panelClassName="max-w-[560px] border border-neutral-1000-a05 bg-bg-floating"
        showCloseButton={!pending}
        title={editorTitle}
      >
        <div className="space-y-4">
          {error ? (
            <p className="rounded-lg border border-critical/30 bg-critical-faded px-3 py-2 text-sm text-critical">
              {error}
            </p>
          ) : null}
          {editor?.collection === "brief" && !editor.row ? (
            <label className="block space-y-2 text-[13px] font-medium text-neutral-primary">
              <span>{t("career.profile.context.label", "제목")}</span>
              <Input
                disabled={pending}
                maxLength={160}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={t(
                  "career.profile.context.label_placeholder",
                  "예: 선호 근무 지역"
                )}
                value={label}
              />
            </label>
          ) : null}
          <label className="block space-y-2 text-[13px] font-medium text-neutral-primary">
            <span>{t("career.profile.context.content", "내용")}</span>
            <Textarea
              className="min-h-28"
              disabled={pending}
              maxLength={8000}
              onChange={(event) => setContent(event.target.value)}
              placeholder={
                editor?.collection === "brief"
                  ? t(
                      "career.profile.context.brief_content_placeholder",
                      "기회를 찾을 때 반영할 기준을 적어주세요."
                    )
                  : t(
                      "career.profile.context.memory_content_placeholder",
                      "하퍼가 다음에도 기억하면 좋을 맥락을 적어주세요."
                    )
              }
              value={content}
            />
          </label>
        </div>
      </TalentCareerModal>

      <TalentCareerModal
        bodyClassName="bg-bg-floating px-4 py-5 sm:px-5"
        footer={
          <div className="flex flex-1 items-center justify-between gap-3">
            <div>
              {memoryHasMore ? (
                <MuteButton
                  disabled={memoryLoadPending}
                  onClick={() => void loadMemories?.({ append: true })}
                  size="lg"
                  type="button"
                >
                  {memoryLoadPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {t("career.profile.context.load_more", "더 보기")}
                </MuteButton>
              ) : null}
            </div>
            <MuteButton
              className="gap-1.5"
              disabled={!mutate || pending || memoryLoadPending}
              onClick={() => {
                setMemoryListOpen(false);
                openEditor("memory", null);
              }}
              size="lg"
              type="button"
              variant="primary"
            >
              <Plus className="h-4 w-4" />
              {t("career.profile.context.add_memory", "기억 추가")}
            </MuteButton>
          </div>
        }
        mobileBottomSheet
        onClose={() => setMemoryListOpen(false)}
        open={memoryListOpen}
        panelClassName="max-w-[640px] border border-neutral-1000-a05 bg-bg-floating"
        title={t("career.profile.context.memory_title", "Harper의 기억")}
      >
        <div className="space-y-3">
          {error ? (
            <p className="rounded-lg border border-critical/30 bg-critical-faded px-3 py-2 text-sm text-critical">
              {error}
            </p>
          ) : null}
          {memoryLoadPending && !memoryLoaded ? (
            <div className="flex justify-center py-10 text-neutral-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : error && !memoryLoaded ? (
            <MuteButton
              disabled={memoryLoadPending}
              onClick={() => void loadMemories?.()}
              size="sm"
              type="button"
            >
              {t("career.profile.context.retry", "다시 시도")}
            </MuteButton>
          ) : memories.length > 0 ? (
            <div className="divide-y divide-neutral-1000-a05">
              {memories.map((row) => (
                <div
                  className="flex items-start gap-3 py-3 first:pt-0"
                  key={row.id}
                >
                  <p className="min-w-0 flex-1 whitespace-pre-line text-[14px] leading-6 text-neutral-primary">
                    {row.content}
                  </p>
                  <MuteButton
                    aria-label={t("career.profile.context.edit", "수정")}
                    className="shrink-0"
                    disabled={!mutate || pending || memoryLoadPending}
                    onClick={() => {
                      setMemoryListOpen(false);
                      openEditor("memory", row);
                    }}
                    size="sm"
                    type="button"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </MuteButton>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-bg-weak px-3 py-4 text-[13px] text-neutral-muted">
              {t(
                "career.profile.context.memory_empty",
                "아직 저장된 기억이 없어요."
              )}
            </p>
          )}
        </div>
      </TalentCareerModal>

      <TalentCareerModal
        closeOnBackdrop={!pending}
        description={t(
          "career.profile.context.delete_description",
          "저장된 기준에서 이 항목을 삭제해요."
        )}
        footer={
          <div className="flex justify-end gap-2">
            <MuteButton
              disabled={pending}
              onClick={() => setPendingDelete(null)}
              size="md"
              type="button"
            >
              {t("career.profile.context.cancel", "취소")}
            </MuteButton>
            <MuteButton
              disabled={pending}
              onClick={() => void deleteRow()}
              size="md"
              type="button"
              variant="warn"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("career.profile.context.delete", "삭제")}
            </MuteButton>
          </div>
        }
        mobileBottomSheet
        onClose={() => {
          if (!pending) setPendingDelete(null);
        }}
        open={Boolean(pendingDelete)}
        panelClassName="max-w-[480px] border border-neutral-1000-a05 bg-bg-floating"
        showCloseButton={!pending}
        title={t(
          "career.profile.context.delete_title",
          "이 내용을 삭제할까요?"
        )}
      >
        {null}
      </TalentCareerModal>
    </section>
  );
}
