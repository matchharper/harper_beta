"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ClipboardPen,
  FileText,
  MessageSquareText,
} from "lucide-react";
import { Typography } from "@/components/ui/typography";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { useCareerContentSuggestions } from "@/hooks/career/useCareerContentSuggestions";
import {
  CAREER_CONTENT_REGISTRABLE_KINDS,
  type CareerContentKind,
  type CareerContentSuggestion,
} from "@/lib/career/contentSuggestions";

const KIND_ICON: Record<CareerContentKind, typeof CalendarDays> = {
  event: CalendarDays,
  signup: ClipboardPen,
  article: FileText,
  post: MessageSquareText,
};

// Leave new items marked for a moment before telling the server they were seen.
const SEEN_DELAY_MS = 1500;

function useKindLabel() {
  const t = useCareerT();
  return (kind: CareerContentKind) =>
    kind === "event"
      ? t("career.content.kind.event", "행사")
      : kind === "signup"
        ? t("career.content.kind.signup", "신청")
        : kind === "article"
          ? t("career.content.kind.article", "글")
          : t("career.content.kind.post", "게시물");
}

function formatWhen(
  item: CareerContentSuggestion,
  locale: string,
  closes: (date: string) => string
): string | null {
  const tag = locale === "ko" ? "ko-KR" : "en-US";
  if (item.kind === "signup" && item.deadline) {
    return closes(
      new Intl.DateTimeFormat(tag, { month: "long", day: "numeric" }).format(
        new Date(item.deadline)
      )
    );
  }
  if ((item.kind === "event" || item.kind === "signup") && item.startsAt) {
    return new Intl.DateTimeFormat(tag, {
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(item.startsAt));
  }
  if (item.publishedAt) {
    return new Intl.DateTimeFormat(tag, {
      month: "long",
      day: "numeric",
    }).format(new Date(item.publishedAt));
  }
  return null;
}

export function CareerContentSuggestionCard({
  item,
  fresh,
  onOpen,
  onDismiss,
  onRegister,
}: {
  item: CareerContentSuggestion;
  fresh: boolean;
  onOpen: (item: CareerContentSuggestion) => void;
  onDismiss: (item: CareerContentSuggestion) => void;
  /** Events only: the user says they signed up, or takes it back. */
  onRegister?: (item: CareerContentSuggestion, registered: boolean) => void;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const kindLabel = useKindLabel();
  const Icon = KIND_ICON[item.kind];
  const registered = item.status === "registered";
  const meta = [
    kindLabel(item.kind),
    formatWhen(item, locale, (date) =>
      t("career.content.closes", "{date} 마감", { values: { date } })
    ),
    item.kind === "post" || item.kind === "article"
      ? item.source
      : (item.location ?? item.source),
  ].filter((value): value is string => Boolean(value));
  return (
    <article
      className="career-followup-card career-glass career-content-card"
      data-career-content-id={item.id}
      data-kind={item.kind}
    >
      <div className="career-content-meta">
        <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={1.6} />
        <span className="min-w-0 truncate">{meta.join(" · ")}</span>
        {fresh ? (
          <span
            className="career-content-new"
            aria-label={t("career.content.new", "새로 찾음")}
          />
        ) : null}
      </div>
      <Typography as="h3" variant="body-sm" className="career-content-title">
        {item.title}
      </Typography>
      <Typography
        as="p"
        variant="description"
        className="career-followup-description"
      >
        {item.reason}
      </Typography>
      <div className="career-content-actions">
        <a
          className="career-followup-action career-content-open"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onOpen(item)}
        >
          {t("career.content.open", "열기")}
          <ArrowUpRight
            aria-hidden
            className="size-4 shrink-0 text-neutral-soft"
          />
        </a>
        <div className="career-content-side">
          {CAREER_CONTENT_REGISTRABLE_KINDS.includes(item.kind) &&
          onRegister ? (
            <button
              type="button"
              className="career-card-close career-content-register"
              aria-pressed={registered}
              aria-label={`${item.title}: ${t("career.content.registered", "신청했어요")}`}
              onClick={() => onRegister(item, !registered)}
            >
              {registered ? (
                <Check
                  aria-hidden
                  className="size-3.5 shrink-0"
                  strokeWidth={2}
                />
              ) : null}
              {t("career.content.registered", "신청했어요")}
            </button>
          ) : null}
          <button
            type="button"
            className="career-card-close"
            aria-label={`${item.title}: ${t("career.content.dismiss", "닫기")}`}
            onClick={() => onDismiss(item)}
          >
            {t("career.content.dismiss", "닫기")}
          </button>
        </div>
      </div>
    </article>
  );
}

/** "볼 만한 것": events, articles and posts Harper saved beside the follow-ups. */
export function CareerContentSuggestionsPanel() {
  const t = useCareerT();
  const suggestions = useCareerContentSuggestions();
  const { react } = suggestions;
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  // Items that were new when first shown keep their dot for this visit,
  // even after the server has been told they were seen.
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());
  const items = (suggestions.data ?? []).filter((item) => !hidden.has(item.id));
  const unseenKey = items
    .filter((item) => item.status === "new" && !freshIds.has(item.id))
    .map((item) => item.id)
    .join(",");

  useEffect(() => {
    if (!unseenKey) return;
    const timer = window.setTimeout(() => {
      const ids = unseenKey.split(",");
      setFreshIds((previous) => new Set([...previous, ...ids]));
      for (const id of ids) react(id, "seen");
    }, SEEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [unseenKey, react]);

  if (suggestions.isPending || suggestions.isError || !items.length)
    return null;
  return (
    <section
      className="career-content"
      aria-label={t("career.content.title", "볼 만한 것")}
      data-career-content-suggestions
    >
      <Typography
        as="h2"
        variant="description"
        className="career-content-heading"
      >
        {t("career.content.title", "볼 만한 것")} {items.length}
      </Typography>
      <div className="space-y-3">
        {items.map((item) => (
          <CareerContentSuggestionCard
            key={item.id}
            item={item}
            fresh={item.status === "new" || freshIds.has(item.id)}
            onOpen={(current) => react(current.id, "opened")}
            onRegister={(current, registered) =>
              react(current.id, registered ? "registered" : "unregistered")
            }
            onDismiss={(current) => {
              setHidden((previous) => new Set(previous).add(current.id));
              react(current.id, "dismissed");
            }}
          />
        ))}
      </div>
    </section>
  );
}
