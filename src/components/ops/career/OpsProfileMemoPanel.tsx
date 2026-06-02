import { memo, useCallback, useMemo, useState } from "react";
import { LoaderCircle, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { Tooltips } from "@/components/ui/tooltip";
import {
  useCreateOpsCareerProfileMemo,
  useDeleteOpsCareerProfileMemo,
  useUpdateOpsCareerProfileMemo,
} from "@/hooks/useOpsCareer";
import type { CareerTalentOpsProfileMemo } from "@/lib/opsCareerServer";
import { formatKst } from "./utils";

type OpsProfileMemoPanelProps = {
  memos: CareerTalentOpsProfileMemo[];
  userId: string;
};

type EditingState =
  | { mode: "create" }
  | { memoId: string; mode: "edit" }
  | null;

const iconButtonClass =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-beige900/10 bg-white/55 text-beige900/55 transition hover:border-beige900/18 hover:bg-white hover:text-beige900 disabled:cursor-not-allowed disabled:opacity-45";

function getMemoTimestamp(memo: CareerTalentOpsProfileMemo) {
  return memo.updatedAt ?? memo.createdAt;
}

export const OpsProfileMemoPanel = memo(function OpsProfileMemoPanel({
  memos,
  userId,
}: OpsProfileMemoPanelProps) {
  const [editing, setEditing] = useState<EditingState>(null);
  const [draft, setDraft] = useState("");
  const [deletingMemoId, setDeletingMemoId] = useState<string | null>(null);
  const createMutation = useCreateOpsCareerProfileMemo(userId);
  const updateMutation = useUpdateOpsCareerProfileMemo(userId);
  const deleteMutation = useDeleteOpsCareerProfileMemo(userId);
  const sortedMemos = useMemo(
    () =>
      [...memos].sort((a, b) =>
        (getMemoTimestamp(b) ?? "").localeCompare(getMemoTimestamp(a) ?? "")
      ),
    [memos]
  );
  const editingMemo =
    editing?.mode === "edit"
      ? (sortedMemos.find((memo) => memo.id === editing.memoId) ?? null)
      : null;
  const trimmedDraft = draft.trim();
  const hasChanges =
    editing?.mode === "create"
      ? trimmedDraft.length > 0
      : editing?.mode === "edit"
        ? trimmedDraft.length > 0 &&
          trimmedDraft !== (editingMemo?.content.trim() ?? "")
        : false;
  const savePending = createMutation.isPending || updateMutation.isPending;
  const activeError =
    editing?.mode === "create"
      ? createMutation.error
      : editing?.mode === "edit"
        ? updateMutation.error
        : null;

  const startCreating = useCallback(() => {
    setDraft("");
    setEditing({ mode: "create" });
  }, []);

  const startEditing = useCallback((memo: CareerTalentOpsProfileMemo) => {
    setDraft(memo.content);
    setEditing({ memoId: memo.id, mode: "edit" });
  }, []);

  const cancelEditing = useCallback(() => {
    setDraft("");
    setEditing(null);
  }, []);

  const saveMemo = useCallback(() => {
    if (!editing || !hasChanges) return;

    if (editing.mode === "create") {
      createMutation.mutate(trimmedDraft, {
        onSuccess: () => {
          setDraft("");
          setEditing(null);
        },
      });
      return;
    }

    updateMutation.mutate(
      { content: trimmedDraft, memoId: editing.memoId },
      {
        onSuccess: () => {
          setDraft("");
          setEditing(null);
        },
      }
    );
  }, [createMutation, editing, hasChanges, trimmedDraft, updateMutation]);

  const deleteMemo = useCallback(
    (memo: CareerTalentOpsProfileMemo) => {
      if (!window.confirm("이 메모를 삭제할까요?")) return;

      setDeletingMemoId(memo.id);
      deleteMutation.mutate(memo.id, {
        onSuccess: () => {
          if (editing?.mode === "edit" && editing.memoId === memo.id) {
            setDraft("");
            setEditing(null);
          }
        },
        onSettled: () => {
          setDeletingMemoId(null);
        },
      });
    },
    [deleteMutation, editing]
  );

  const renderEditor = (modeLabel: string) => (
    <div className="rounded-md border border-[#9bb89c]/45 bg-[#edf6ed] p-2">
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={4}
        maxLength={4000}
        className="min-h-[104px] w-full resize-y rounded-md border border-[#9bb89c]/55 bg-white/80 px-3 py-2 font-geist text-[15px] leading-6 text-black outline-none focus:border-[#5f8a64]"
        placeholder="내부 메모를 입력하세요."
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-geist text-[11px] text-beige900/40">
          {modeLabel}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cancelEditing}
            disabled={savePending}
            className="h-8 rounded-md px-3 font-geist text-xs font-medium text-black/70 transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={saveMemo}
            disabled={!hasChanges || savePending}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#315f3d] px-3 font-geist text-xs font-medium text-white transition hover:bg-[#264b31] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savePending ? (
              <>
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                저장 중
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                저장
              </>
            )}
          </button>
        </div>
      </div>
      {activeError ? (
        <div className="mt-2 font-geist text-xs text-red-700">
          {activeError instanceof Error
            ? activeError.message
            : "메모 저장에 실패했습니다."}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="w-full shrink-0 lg:w-[360px]">
      <div className="flex justify-start lg:justify-end">
        <button
          type="button"
          onClick={startCreating}
          className={cx(
            opsTheme.buttonSecondary,
            "h-8 px-3 text-xs font-medium"
          )}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          메모 추가
        </button>
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {editing?.mode === "create" ? renderEditor("새 메모") : null}

        {sortedMemos.length === 0 && editing?.mode !== "create" ? (
          <div className="rounded-md border border-dashed border-beige900/15 bg-white/35 px-3 py-2 font-geist text-xs text-beige900/40">
            아직 메모가 없습니다.
          </div>
        ) : null}

        {sortedMemos.map((memo) => {
          const isEditingMemo =
            editing?.mode === "edit" && editing.memoId === memo.id;
          const isDeleting = deletingMemoId === memo.id;

          return (
            <div
              key={memo.id}
              className="rounded-md border border-[#9bb89c]/35 bg-[#e5f1e5] px-3 py-2 font-geist text-black"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-[11px] text-black/45">
                  {formatKst(getMemoTimestamp(memo))}
                  {memo.updatedBy ? ` · ${memo.updatedBy}` : ""}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Tooltips text="메모 수정">
                    <button
                      type="button"
                      onClick={() => startEditing(memo)}
                      disabled={savePending || deleteMutation.isPending}
                      aria-label="메모 수정"
                      className={iconButtonClass}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </Tooltips>
                  <Tooltips text="메모 삭제">
                    <button
                      type="button"
                      onClick={() => deleteMemo(memo)}
                      disabled={savePending || deleteMutation.isPending}
                      aria-label="메모 삭제"
                      className={cx(
                        iconButtonClass,
                        "hover:border-[#c98b77]/45 hover:text-[#8a2e1d]"
                      )}
                    >
                      {isDeleting ? (
                        <LoaderCircle
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden
                        />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </button>
                  </Tooltips>
                </div>
              </div>

              {isEditingMemo ? (
                renderEditor("메모 수정")
              ) : (
                <div className="whitespace-pre-wrap text-[15px] leading-6">
                  {memo.content}
                </div>
              )}
            </div>
          );
        })}

        {deleteMutation.error ? (
          <div className="font-geist text-xs text-red-700">
            {deleteMutation.error instanceof Error
              ? deleteMutation.error.message
              : "메모 삭제에 실패했습니다."}
          </div>
        ) : null}
      </div>
    </div>
  );
});
