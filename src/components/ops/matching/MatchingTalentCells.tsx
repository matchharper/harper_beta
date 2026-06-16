import Image from "next/image";
import { MatchingTagPill } from "@/components/ops/matching/MatchingTalentInlineActions";
import { Tooltips } from "@/components/ui/tooltip";
import type {
  OpsMatchingProfileLabel,
  OpsMatchingTalentItem,
} from "@/lib/opsMatching";

function getProfileLabelParts(item: OpsMatchingProfileLabel) {
  if (item.detail && item.detail !== item.label) {
    return { detail: item.detail, label: item.label };
  }

  const parts = item.label
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return { detail: item.detail, label: item.label };

  return {
    detail: parts.slice(1).join(" · ") || item.detail,
    label: parts[0] ?? item.label,
  };
}

function profileLabelsTitle(labels: OpsMatchingProfileLabel[]) {
  return labels
    .map((item) => {
      const { detail, label } = getProfileLabelParts(item);
      return [label, detail, item.period].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

export function ProfileLabelCell({
  emptyLabel,
  labels,
}: {
  emptyLabel: string;
  labels: OpsMatchingProfileLabel[];
}) {
  const latest = labels[0] ?? null;
  if (!latest) {
    return <span className="text-neutral-soft">{emptyLabel}</span>;
  }
  const { detail, label } = getProfileLabelParts(latest);

  return (
    <Tooltips text={profileLabelsTitle(labels)} side="bottom">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium leading-5 text-neutral-primary">
          {label}
        </div>
        {detail ? (
          <div className="truncate text-[12px] leading-4 text-neutral-muted">
            {detail}
          </div>
        ) : null}
        {latest.period ? (
          <div className="mt-0.5 truncate text-[11px] leading-4 text-neutral-soft">
            {latest.period}
          </div>
        ) : null}
      </div>
    </Tooltips>
  );
}

export function TalentStatusBadges({
  talent,
}: {
  talent: OpsMatchingTalentItem;
}) {
  if (
    !talent.hasSubmittedMaterial &&
    !talent.isOnboardingDone &&
    talent.talentTags.length === 0
  ) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {talent.hasSubmittedMaterial ? (
        <span className="rounded bg-info-faded px-1.5 py-0.5 text-[10px] font-medium leading-4 text-info">
          제출 완료
        </span>
      ) : null}
      {talent.isOnboardingDone ? (
        <span className="rounded bg-positive-faded px-1.5 py-0.5 text-[10px] font-medium leading-4 text-positive">
          온보딩 완료
        </span>
      ) : null}
      {talent.talentTags.map((tag) => (
        <MatchingTagPill key={tag.id} tag={tag.tag} />
      ))}
    </div>
  );
}

export function TalentIdentity({ talent }: { talent: OpsMatchingTalentItem }) {
  const displayName = talent.name || talent.email || "이름 없음";
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {talent.profilePicture ? (
        <Image
          src={talent.profilePicture}
          alt=""
          width={32}
          height={32}
          unoptimized
          className="h-8 w-8 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-weak text-xs font-medium text-neutral-soft">
          {displayName.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-neutral-primary">
          {displayName}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-neutral-muted">
          {talent.email ?? talent.headline ?? "-"}
        </div>
      </div>
    </div>
  );
}
