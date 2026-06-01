import { memo, useCallback, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import { useSaveOpsCareerProfileMemo } from "@/hooks/useOpsCareer";
import type { CareerTalentOpsProfileMemo } from "@/lib/opsCareerServer";

type OpsProfileMemoPanelProps = {
  memo: CareerTalentOpsProfileMemo | null;
  userId: string;
};

export const OpsProfileMemoPanel = memo(function OpsProfileMemoPanel({
  memo,
  userId,
}: OpsProfileMemoPanelProps) {
  const existingContent = memo?.content.trim() ?? "";
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(existingContent);
  const saveMutation = useSaveOpsCareerProfileMemo(userId);
  const hasMemo = Boolean(existingContent);
  const hasChanges = draft.trim() !== existingContent;

  const startEditing = useCallback(() => {
    setDraft(existingContent);
    setIsEditing(true);
  }, [existingContent]);

  const cancelEditing = useCallback(() => {
    setDraft(existingContent);
    setIsEditing(false);
  }, [existingContent]);

  const saveMemo = useCallback(() => {
    saveMutation.mutate(draft, {
      onSuccess: () => {
        setIsEditing(false);
      },
    });
  }, [draft, saveMutation]);

  return (
    <div className="w-full shrink-0 lg:w-[320px]">
      <div className="flex justify-start lg:justify-end">
        <button
          type="button"
          onClick={isEditing ? cancelEditing : startEditing}
          className={cx(
            opsTheme.buttonSecondary,
            "h-8 px-3 text-xs font-medium"
          )}
        >
          {isEditing ? "취소" : hasMemo ? "메모 수정" : "메모 작성"}
        </button>
      </div>

      {isEditing ? (
        <div className="mt-2 rounded-md border border-[#9bb89c]/45 bg-[#edf6ed] p-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            maxLength={4000}
            className="min-h-[104px] w-full resize-y rounded-md border border-[#9bb89c]/55 bg-white/80 px-3 py-2 font-geist text-[15px] leading-6 text-black outline-none focus:border-[#5f8a64]"
            placeholder="내부 메모를 입력하세요."
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancelEditing}
              disabled={saveMutation.isPending}
              className="h-8 rounded-md px-3 font-geist text-xs font-medium text-black/70 transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={saveMemo}
              disabled={!hasChanges || saveMutation.isPending}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#315f3d] px-3 font-geist text-xs font-medium text-white transition hover:bg-[#264b31] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveMutation.isPending ? (
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
          {saveMutation.error ? (
            <div className="mt-2 font-geist text-xs text-red-700">
              {saveMutation.error instanceof Error
                ? saveMutation.error.message
                : "메모 저장에 실패했습니다."}
            </div>
          ) : null}
        </div>
      ) : hasMemo ? (
        <div className="mt-2 whitespace-pre-wrap rounded-md border border-[#9bb89c]/35 bg-[#e5f1e5] px-3 py-2 font-geist text-[15px] leading-6 text-black">
          {existingContent}
        </div>
      ) : null}
    </div>
  );
});
