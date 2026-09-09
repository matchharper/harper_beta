import { memo, useMemo, useState } from "react";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton, MuteButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import {
  useCreateOpsCareerProfileMemo,
  useDeleteOpsCareerProfileMemo,
} from "@/hooks/ops/useOpsCareer";
import type {
  CareerTalentOpsMemo,
  CareerTalentOpsProfileMemo,
} from "@/lib/ops/careerServer";
import { formatKst } from "./utils";

type OpsProfileMemoFeedProps = {
  memos: CareerTalentOpsMemo[];
  userId: string;
};

function getMemoTimestamp(memo: CareerTalentOpsMemo) {
  return memo.updatedAt ?? memo.createdAt;
}

export const OpsProfileMemoFeed = memo(function OpsProfileMemoFeed({
  memos,
  userId,
}: OpsProfileMemoFeedProps) {
  const [draft, setDraft] = useState("");
  const [memoToDelete, setMemoToDelete] =
    useState<CareerTalentOpsProfileMemo | null>(null);
  const createMemo = useCreateOpsCareerProfileMemo(userId);
  const deleteMemo = useDeleteOpsCareerProfileMemo(userId);
  const sortedMemos = useMemo(
    () =>
      [...memos].sort((left, right) =>
        (getMemoTimestamp(right) ?? "").localeCompare(
          getMemoTimestamp(left) ?? ""
        )
      ),
    [memos]
  );
  const trimmedDraft = draft.trim();

  return (
    <div className="rounded-md border border-neutral-1000-a05 bg-bg-floating p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-neutral-primary">메모</div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {sortedMemos.length === 0 ? (
          <></>
        ) : (
          sortedMemos.map((memo) => (
            <div
              key={`${memo.source}:${memo.id}`}
              className="rounded-md border border-neutral-1000-a05 bg-bg-default px-3 py-2"
            >
              {memo.source === "role" ? (
                <div className="mb-1 truncate text-[10px] font-medium text-neutral-muted">
                  {[memo.companyName, memo.roleName]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              ) : null}
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-[11px] text-neutral-soft">
                  {formatKst(getMemoTimestamp(memo))}
                  {(memo.updatedBy ?? memo.createdBy)
                    ? ` · ${memo.updatedBy ?? memo.createdBy}`
                    : ""}
                </div>
                {memo.source === "profile" ? (
                  <MuteButton
                    aria-label="메모 삭제"
                    className="shrink-0 text-neutral-soft hover:bg-critical-faded hover:text-critical"
                    disabled={deleteMemo.isPending}
                    onClick={() => {
                      deleteMemo.reset();
                      setMemoToDelete(memo);
                    }}
                    size="sm"
                    title="메모 삭제"
                    variant="transparent"
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                  </MuteButton>
                ) : null}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-6 text-neutral-primary">
                {memo.content}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 border-t border-neutral-1000-a05 pt-4">
        <UiTextarea
          unstyled
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          maxLength={4000}
          className="min-h-[112px] w-full resize-y rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 py-3 text-sm leading-6 text-neutral-primary outline-none transition placeholder:text-neutral-placeholder focus:border-neutral-400 focus:ring-2 focus:ring-neutral-1000-a10"
          placeholder="이 사람에게 관련된 메모를 남겨주세요."
        />
        <div className="mt-2 flex justify-end">
          <BareButton
            type="button"
            onClick={() => {
              if (!trimmedDraft || createMemo.isPending) return;
              createMemo.mutate(trimmedDraft, {
                onSuccess: () => setDraft(""),
              });
            }}
            disabled={!trimmedDraft || createMemo.isPending}
            className={cx(opsTheme.buttonPrimary, "h-9 px-3 text-xs")}
          >
            {createMemo.isPending ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            메모 추가
          </BareButton>
        </div>
        {createMemo.error ? (
          <div className={cx(opsTheme.errorNotice, "mt-3")}>
            {createMemo.error instanceof Error
              ? createMemo.error.message
              : "메모 저장에 실패했습니다."}
          </div>
        ) : null}
      </div>

      <Dialog
        open={Boolean(memoToDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteMemo.isPending) {
            setMemoToDelete(null);
            deleteMemo.reset();
          }
        }}
      >
        <DialogContent className="max-w-md rounded-lg" hideCloseButton>
          <DialogHeader>
            <DialogTitle>메모를 삭제할까요?</DialogTitle>
            <DialogDescription>
              누가 작성했는지와 관계없이 삭제되며, 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          {memoToDelete ? (
            <div className="line-clamp-4 rounded-md bg-bg-weak px-3 py-2 text-sm leading-6 text-neutral-muted">
              {memoToDelete.content}
            </div>
          ) : null}
          {deleteMemo.error ? (
            <div className={opsTheme.errorNotice}>
              {deleteMemo.error instanceof Error
                ? deleteMemo.error.message
                : "메모 삭제에 실패했습니다."}
            </div>
          ) : null}
          <DialogFooter>
            <MuteButton
              disabled={deleteMemo.isPending}
              onClick={() => {
                setMemoToDelete(null);
                deleteMemo.reset();
              }}
              variant="transparent"
            >
              취소
            </MuteButton>
            <MuteButton
              disabled={!memoToDelete || deleteMemo.isPending}
              onClick={() => {
                if (!memoToDelete || deleteMemo.isPending) return;
                deleteMemo.mutate(memoToDelete.id, {
                  onSuccess: () => setMemoToDelete(null),
                });
              }}
              variant="critical"
            >
              {deleteMemo.isPending ? (
                <LoaderCircle aria-hidden className="animate-spin" />
              ) : (
                <Trash2 aria-hidden />
              )}
              {deleteMemo.isPending ? "삭제 중" : "삭제"}
            </MuteButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
