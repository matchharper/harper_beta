import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { cx, opsTheme } from "@/components/ops/theme";
import type { MemberFacts } from "@/lib/gtmPlays/pool.server";
import type { AnonymousCard } from "@/lib/gtmPlays/shared";
import { Badge, Button, Hint } from "./ui";

/** The pool's fused rank score, relative to the first row: not a similarity (the top is always 1.00). */
const SCORE_HINT = "1위를 1.00으로 둔 상대 점수예요(유사도 아님).";

function yearsLabel(years: number | null) {
  return years === null ? "-" : `${years}년`;
}

function period(start: string | null, end: string | null) {
  return `${start?.slice(0, 7) ?? "?"} ~ ${end?.slice(0, 7) ?? "현재"}`;
}

/** One member in full: what Chris reads before picking, and the anonymous card if one was made. */
function MemberDetail({ member, rank, card, picked, canPick, disabled, onToggle }: {
  member: MemberFacts;
  rank: number;
  card: AnonymousCard | null;
  picked: boolean;
  canPick: boolean;
  /** While the cards are being made, picks cannot change. */
  disabled: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className={cx(opsTheme.panelSoft, "space-y-4 p-4")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1 text-[12px] text-neutral-muted">
            #{rank} · 점수 {member.similarity}<Hint label="점수" text={SCORE_HINT} />
          </div>
          <h3 className="mt-0.5 text-base font-semibold">{member.name ?? "-"}</h3>
          <p className="text-sm text-neutral-muted">
            {[member.headline, member.location, member.years === null ? null : `경력 ${member.years}년`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onToggle ? (
            <Button variant={picked ? "secondary" : "primary"} disabled={disabled || (!picked && !canPick)} onClick={onToggle}>
              {picked ? "카드에서 빼기" : "카드에 넣기"}
            </Button>
          ) : null}
          <a className={cx(opsTheme.link, "inline-flex items-center gap-1 text-sm")} href={`/ops/career?userId=${member.talentId}`} target="_blank" rel="noreferrer">
            Ops 프로필 <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>

      {card ? (
        <div className="rounded-md bg-bg-default p-3">
          <div className="mb-1 flex items-center gap-2 text-[12px] text-neutral-muted">
            회사에 갈 카드 {card.years ? `· ${card.years}` : ""}
            <Badge>익명</Badge>
          </div>
          <div className="font-semibold">{card.title}</div>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm leading-6">
            {card.highlights.map((line) => <li key={line}>{line}</li>)}
          </ul>
          {card.fit ? <p className="mt-1.5 text-sm text-neutral-muted">{card.fit}</p> : null}
        </div>
      ) : null}

      <section>
        <div className="mb-1.5 text-[12px] font-medium text-neutral-muted">경력</div>
        {member.experiences.length ? (
          <ol className="space-y-3">
            {member.experiences.map((row, index) => (
              <li key={`${row.company}-${row.start}-${index}`} className="text-sm">
                <div>
                  <span className="font-medium">{row.role ?? "-"}</span>
                  <span> · {row.company ?? "-"}</span>
                  <span className="text-neutral-muted"> ({period(row.start, row.end)})</span>
                </div>
                {row.description ? (
                  <p className="mt-0.5 whitespace-pre-line leading-6 text-neutral-muted">{row.description}</p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-neutral-muted">기록 없음</p>}
      </section>

      {member.educations.length ? (
        <section>
          <div className="mb-1.5 text-[12px] font-medium text-neutral-muted">학력</div>
          <ul className="space-y-1 text-sm">
            {member.educations.map((row, index) => (
              <li key={`${row.school}-${index}`}>{[row.school, row.degree, row.field].filter(Boolean).join(" · ")}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Harper members closest to a JD or Role (#2, #4). A row opens that member's detail on the right. With
 * `onToggle`, each row gets a box and up to `limit` can be ticked for the cards (none while `disabled`).
 */
export function MemberTable({ members, picked = [], onToggle, limit, cards = [], disabled = false }: {
  members: MemberFacts[];
  picked?: string[];
  onToggle?: (talentId: string) => void;
  limit?: number;
  /** Cards already made, shown in the detail of their member. */
  cards?: AnonymousCard[];
  /** #2 while the cards are being made: picks cannot change. */
  disabled?: boolean;
}) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const selectable = Boolean(onToggle);
  const focusedIndex = Math.max(0, members.findIndex((member) => member.talentId === focusedId));
  const focused = members[focusedIndex] ?? null;
  const canPick = limit === undefined || picked.length < limit;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="max-h-[640px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-bg-default text-left text-[12px] text-neutral-muted">
            <tr>
              {selectable ? <th className="w-8 py-1" aria-label="카드에 넣기" /> : null}
              <th className="w-8 py-1 text-right">#</th>
              <th className="py-1 pl-3">이름</th>
              <th className="py-1">한 줄 소개</th>
              <th className="w-16 py-1 text-right">경력</th>
              <th className="w-20 py-1 text-right">
                <span className="inline-flex items-center justify-end gap-0.5"><Hint label="점수" text={SCORE_HINT} />점수</span>
              </th>
            </tr>
          </thead>
          <tbody className={cx("divide-y", opsTheme.divider)}>
            {members.map((member, index) => {
              const checked = picked.includes(member.talentId);
              const isFocused = focused?.talentId === member.talentId;
              return (
                <tr
                  key={member.talentId}
                  onClick={() => setFocusedId(member.talentId)}
                  aria-selected={isFocused}
                  className={cx("cursor-pointer", isFocused ? "bg-bg-weak" : "hover:bg-bg-weak/70")}
                >
                  {selectable ? (
                    <td className="py-1.5" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled || (!checked && !canPick)}
                        aria-label={`${member.name ?? `후보 ${index + 1}`} 카드에 넣기`}
                        onChange={() => onToggle?.(member.talentId)}
                      />
                    </td>
                  ) : null}
                  <td className="py-1.5 text-right tabular-nums text-neutral-muted">{index + 1}</td>
                  <td className={cx("whitespace-nowrap py-1.5 pl-3", checked && "font-medium")}>{member.name ?? "-"}</td>
                  <td className="max-w-[360px] truncate py-1.5 text-neutral-muted" title={member.headline ?? undefined}>{member.headline ?? ""}</td>
                  <td className="py-1.5 text-right tabular-nums">{yearsLabel(member.years)}</td>
                  <td className="py-1.5 text-right tabular-nums text-neutral-muted">{member.similarity}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="xl:sticky xl:top-4 xl:max-h-[640px] xl:self-start xl:overflow-auto">
        {focused ? (
          <MemberDetail
            key={focused.talentId}
            member={focused}
            rank={focusedIndex + 1}
            card={cards.find((card) => card.talentId === focused.talentId) ?? null}
            picked={picked.includes(focused.talentId)}
            canPick={canPick}
            disabled={disabled}
            onToggle={onToggle ? () => onToggle(focused.talentId) : undefined}
          />
        ) : null}
      </div>
    </div>
  );
}
