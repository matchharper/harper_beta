import { RoleSectionHeading } from "@/components/org/role-overview/RoleOverviewShared";
import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import type { RoleStartBriefView } from "@/lib/org/roleStart/view";

/**
 * Reference people the team gave, as the Brief records them. Shown only;
 * matching reads nothing here, only the 평가 기준 the team accepted from them.
 */
export function RoleReferenceList({
  references,
}: {
  references: RoleStartBriefView["references"];
}) {
  const { c } = useOrgLocale();
  if (!references.length) return null;
  return (
    <div className="mt-8">
      <RoleSectionHeading
        description={c(
          "참고를 위해 알려 주신 분들이에요.",
          "People you gave as examples."
        )}
        title={c("참고 프로필", "Reference profiles")}
      />
      <ReferenceCards references={references} />
    </div>
  );
}

/** The recorded people as read-only cards; with onRemove each has a 빼기 button. */
export function ReferenceCards({
  busy,
  onRemove,
  references,
}: {
  busy?: boolean;
  onRemove?: (referenceId: string) => void;
  references: RoleStartBriefView["references"];
}) {
  const { c } = useOrgLocale();
  if (!references.length) return null;
  return (
    <div className="mt-3 grid gap-3">
      {onRemove ? (
        <p className="text-[12px] text-neutral-soft">
          {c(
            "빼도 이미 평가 기준에 들어간 점은 그대로 남아요. 필요하면 Brief에서 지워 주세요.",
            "Removing a person keeps what was already added to the evaluation criteria. Delete those in the Brief if needed."
          )}
        </p>
      ) : null}
      {references.map((reference) => (
        <div
          className="rounded-md bg-bg-basement px-4 py-3 text-[13px] leading-5"
          key={reference.id}
        >
          <div className="flex flex-wrap items-center gap-2 font-medium text-neutral-primary">
            <span>{reference.label}</span>
            <span className="font-normal text-neutral-soft">
              {reference.status === "read"
                ? c("읽음", "Read")
                : c("확인 불가", "Could not open")}
            </span>
            {onRemove ? (
              <MuteButton
                className="ml-auto"
                disabled={busy}
                onClick={() => onRemove(reference.id)}
                size="sm"
                variant="transparent"
              >
                {c("빼기", "Remove")}
              </MuteButton>
            ) : null}
          </div>
          {reference.url ? (
            <a
              className="mt-1 block truncate text-neutral-muted underline"
              href={reference.url}
              rel="noreferrer"
              target="_blank"
            >
              {reference.url}
            </a>
          ) : null}
          {reference.summary ? (
            <p className="mt-1 whitespace-pre-wrap text-neutral-muted">
              {reference.summary}
            </p>
          ) : null}
          {reference.liked.length ? (
            <p className="mt-1 text-neutral-muted">
              {c("마음에 든 점 → 평가 기준: ", "Liked → evaluation criteria: ")}
              {reference.liked.join(", ")}
            </p>
          ) : null}
          {reference.notUsed.length ? (
            <p className="mt-1 text-neutral-muted">
              {c("안 쓰는 점: ", "Not used: ")}
              {reference.notUsed.join(", ")}
            </p>
          ) : null}
          {reference.waiting.length ? (
            <p className="mt-1 text-neutral-muted">
              {c(
                "평가 기준이 가득 차서 대기: ",
                "Waiting (criteria are full): "
              )}
              {reference.waiting.join(", ")}
            </p>
          ) : null}
          {reference.conflicts.map((conflict) => (
            <p className="mt-1 text-neutral-muted" key={conflict.question}>
              {c("충돌: ", "Conflict: ")}
              {conflict.question} →{" "}
              {conflict.answer ??
                c("답 없음 · 지금 기준 유지", "No answer · current Brief kept")}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
