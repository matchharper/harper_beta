import { LoaderCircle, TriangleAlert } from "lucide-react";
import { MuteButton } from "@/components/ui/button";

export function OrgUnsavedChangesBar({
  canSave,
  hasChanges,
  onCancel,
  onSave,
  pending,
}: {
  canSave: boolean;
  hasChanges: boolean;
  onCancel: () => void;
  onSave: () => void;
  pending: boolean;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div
        className="pointer-events-auto flex w-full max-w-[480px] flex-col gap-3 rounded-lg border border-neutral-1000-a05 bg-bg-floating/70 backdrop-blur-md p-2 shadow-[0_18px_60px_color-mix(in_srgb,var(--color-neutral-1000)_18%,transparent)] sm:flex-row sm:items-center sm:justify-between"
        data-org-unsaved-changes-bar=""
      >
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-1 text-critical">
            <TriangleAlert className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-neutral-primary">
              {hasChanges
                ? "저장하지 않은 변경사항이 있습니다."
                : "정보를 수정하고 있습니다."}
            </div>
            <div className="text-[12px] leading-5 text-neutral-muted">
              {hasChanges
                ? "저장하지 않고 이동하면 변경사항이 반영되지 않습니다."
                : "값을 변경한 뒤 저장해 주세요."}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 justify-end gap-2">
          <MuteButton disabled={pending} onClick={onCancel} size="md">
            수정 취소
          </MuteButton>
          <MuteButton
            disabled={!canSave || pending}
            onClick={onSave}
            size="md"
            variant="primary"
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            변경사항 저장
          </MuteButton>
        </div>
      </div>
    </div>
  );
}
