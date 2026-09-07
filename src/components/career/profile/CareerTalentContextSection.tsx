"use client";

import { useMemo, useState } from "react";
import { Brain, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
        (editor.collection === "memory" || label.trim())
      ),
    [content, editor, label]
  );

  const submit = async () => {
    if (!editor || !mutate || !canSubmit) return;
    const row = editor.row;
    const change: CareerTalentContextChange = row
      ? {
          content: content.trim(),
          expectedRevision: row.revision,
          id: row.id,
          ...(editor.collection === "brief" ? { label: label.trim() } : {}),
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
    <section className="space-y-4 px-1">
      <div className="rounded-[14px] border border-neutral-1000-a05 bg-bg-default p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[14px] font-medium text-neutral-primary">
              {t("career.profile.context.brief_title", "Search Brief")}
            </h3>
            <p className="mt-1 text-[12.5px] leading-5 text-neutral-muted">
              {t(
                "career.profile.context.brief_description",
                "하퍼가 기회를 찾고 판단할 때 적용하는 현재 기준이에요."
              )}
            </p>
          </div>
          <MuteButton
            className="shrink-0 gap-1.5"
            disabled={!mutate || pending}
            onClick={() => openEditor("brief", null)}
            size="sm"
            type="button"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("career.profile.context.add", "추가")}
          </MuteButton>
        </div>

        {brief.length > 0 ? (
          <dl className="mt-4 divide-y divide-neutral-1000-a05">
            {brief.map((row) => (
              <div
                className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[130px_minmax(0,1fr)_28px] sm:gap-4"
                key={row.id}
              >
                <dt className="text-[13px] font-medium text-neutral-muted">
                  {row.label}
                </dt>
                <dd className="m-0 whitespace-pre-line text-[14px] leading-6 text-neutral-primary">
                  {row.content}
                </dd>
                <MuteButton
                  aria-label={t("career.profile.context.edit", "수정")}
                  disabled={!mutate || pending}
                  onClick={() => openEditor("brief", row)}
                  size="sm"
                  type="button"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </MuteButton>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-4 rounded-lg bg-bg-weak px-3 py-3 text-[13px] text-neutral-muted">
            {t(
              "career.profile.context.brief_empty",
              "아직 정해진 탐색 기준이 없어요. 대화하면서 함께 채워갈 수 있어요."
            )}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 rounded-[14px] border border-neutral-1000-a05 bg-bg-default px-4 py-3">
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
      </div>

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
          {editor?.collection === "brief" ? (
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
          "저장된 Search Brief 또는 기억에서 이 항목을 삭제해요. 원본 대화와 문서는 그대로 남아요."
        )}
        footer={
          <div className="flex justify-end gap-2">
            <MuteButton
              disabled={pending}
              onClick={() => setPendingDelete(null)}
              size="lg"
              type="button"
            >
              {t("career.profile.context.cancel", "취소")}
            </MuteButton>
            <MuteButton
              disabled={pending}
              onClick={() => void deleteRow()}
              size="lg"
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
