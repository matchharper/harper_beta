import { memo, useMemo, useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { useCreateOpsCareerProfileMemo } from "@/hooks/ops/useOpsCareer";
import type { CareerTalentOpsProfileMemo } from "@/lib/ops/careerServer";
import { formatKst } from "./utils";

type OpsProfileMemoFeedProps = {
  memos: CareerTalentOpsProfileMemo[];
  userId: string;
};

function getMemoTimestamp(memo: CareerTalentOpsProfileMemo) {
  return memo.updatedAt ?? memo.createdAt;
}

export const OpsProfileMemoFeed = memo(function OpsProfileMemoFeed({
  memos,
  userId,
}: OpsProfileMemoFeedProps) {
  const [draft, setDraft] = useState("");
  const createMemo = useCreateOpsCareerProfileMemo(userId);
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
          <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-5 text-center text-sm text-neutral-soft">
            아직 메모가 없습니다.
          </div>
        ) : (
          sortedMemos.map((memo) => (
            <div
              key={memo.id}
              className="rounded-md border border-neutral-1000-a05 bg-bg-default px-3 py-2"
            >
              <div className="mb-1.5 text-[11px] text-neutral-soft">
                {formatKst(getMemoTimestamp(memo))}
                {memo.updatedBy ? ` · ${memo.updatedBy}` : ""}
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
          placeholder="메모를 입력하세요."
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
    </div>
  );
});
