import { X } from "lucide-react";
import { TalentDetail } from "@/components/ops/career/TalentDetail";
import { MatchingRoleProgressPanel } from "@/components/ops/matching/MatchingRoleProgressPanel";
import { cx } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import type {
  OpsMatchingRoleOption,
  OpsMatchingTalentItem,
} from "@/lib/ops/matching";

type MatchingTalentDrawerProps = {
  onClose: () => void;
  role?: OpsMatchingRoleOption | null;
  talent: OpsMatchingTalentItem | null;
};

export function MatchingTalentDrawer({
  onClose,
  role,
  talent,
}: MatchingTalentDrawerProps) {
  if (!talent) return null;

  const talentDisplayName = talent.name || talent.email || "현재 후보자";

  return (
    <div className="fixed inset-0 z-[70]">
      <BareButton
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/35"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          "absolute bottom-0 right-0 top-0 flex w-[90vw] min-w-0 flex-col overflow-hidden bg-bg-default shadow-[0_24px_90px_color-mix(in_srgb,var(--color-neutral-1000)_22%,transparent)]"
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-1000-a05 bg-bg-default px-5 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-neutral-primary">
              {talentDisplayName}
            </div>
            <div className="mt-0.5 truncate text-xs text-neutral-muted">
              {role ? `${role.companyName} · ${role.roleName}` : "Talent Pool"}
            </div>
          </div>
          <BareButton
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </BareButton>
        </div>

        <div
          className={cx(
            "grid min-h-0 flex-1 grid-cols-1",
            role && "lg:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)]"
          )}
        >
          <div className="min-h-0 overflow-y-auto">
            <TalentDetail userId={talent.userId} />
          </div>
          {role ? (
            <MatchingRoleProgressPanel
              role={role}
              talentDisplayName={talentDisplayName}
              talentId={talent.userId}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
