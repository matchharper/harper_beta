import { ChevronRight, Loader2, LockKeyhole, PhoneCall } from "lucide-react";
import { useEffect, useState } from "react";
import {
  useCareerProfileContext,
  useCareerSidebarContext,
} from "@/components/career/CareerSidebarContext";
import type {
  CareerCallNote,
  CareerTalentDocument,
} from "@/components/career/types";
import { Badge } from "@/components/ui/badge";
import { BareButton, MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { formatCareerDate } from "@/lib/career/dateFormat";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";

type CareerCallNoteDetailProps = {
  document?: CareerTalentDocument | null;
  documentId: string;
  onBack: () => void;
};

const CareerCallNoteDetail = ({
  document,
  documentId,
  onBack,
}: CareerCallNoteDetailProps) => {
  const t = useCareerT();
  const { locale } = useMessages();
  const { onReadTalentCallNote } = useCareerProfileContext();
  const { callStartPending, onStartCallMode } = useCareerSidebarContext();
  const logCareerEvent = useCareerLogEvent();
  const [callNote, setCallNote] = useState<CareerCallNote | null>(null);
  const [loadedDocumentDates, setLoadedDocumentDates] = useState<{
    createdAt: string;
    updatedAt: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    void onReadTalentCallNote(documentId)
      .then((result) => {
        if (active) {
          setCallNote(result.callNote);
          setLoadedDocumentDates({
            createdAt: result.createdAt,
            updatedAt: result.updatedAt,
          });
          setError("");
        }
      })
      .catch(() => {
        if (active) {
          setError(
            t(
              "career.profile.documents.call_note_load_failed",
              "통화 기록을 불러오지 못했습니다."
            )
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [document?.updatedAt, documentId, loadAttempt, onReadTalentCallNote, t]);

  const fallbackTitle = t(
    "career.profile.documents.call_note_title",
    "Harper와의 통화"
  );
  const title =
    callNote && callNote.schema_version !== 1
      ? callNote.title
      : document?.fileName === "Harper call note" || !document
        ? fallbackTitle
        : document.fileName;
  const keyPoints =
    callNote && callNote.schema_version !== 1 ? callNote.key_points : [];
  const durationLabel = callNote
    ? t("career.call.duration", "{m}분 {s}초", {
        values: {
          m: Math.floor(callNote.duration_seconds / 60),
          s: callNote.duration_seconds % 60,
        },
      })
    : null;
  const documentCreatedAt =
    document?.createdAt || loadedDocumentDates?.createdAt || null;
  const documentUpdatedAt =
    document?.updatedAt || loadedDocumentDates?.updatedAt || null;
  const displayDate =
    documentUpdatedAt && documentUpdatedAt !== documentCreatedAt
      ? documentUpdatedAt
      : documentCreatedAt ?? callNote?.started_at ?? null;
  const dateLabel = formatCareerDate(displayDate, locale);
  const handleRetry = () => {
    setCallNote(null);
    setLoadedDocumentDates(null);
    setError("");
    setLoading(true);
    setLoadAttempt((value) => value + 1);
  };
  const handleResumeCall = () => {
    logCareerEvent("click_resume_call_note", { documentId });
    void onStartCallMode?.({ resumeCallNoteId: documentId });
  };

  return (
    <section className="pb-24 pt-4 md:pt-0">
      <div className="mb-4 flex min-h-8 items-center justify-between gap-3 md:mt-4">
        <nav className="flex min-w-0 items-center gap-1 text-[13px] leading-5 text-neutral-muted">
          <BareButton
            type="button"
            onClick={onBack}
            className="shrink-0 font-medium text-neutral-muted transition-colors hover:text-neutral-primary"
          >
            {t("career.profile.documents.title", "내 문서")}
          </BareButton>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-soft" />
          <span
            className="min-w-0 truncate font-medium text-neutral-primary"
            title={title}
          >
            {title}
          </span>
        </nav>
      </div>

      <article className="min-h-[480px] rounded-xl border border-neutral-1000-a05 bg-bg-floating px-5 py-6 shadow-sm sm:px-8 sm:py-8 md:min-h-[calc(100svh-180px)]">
        {loading ? (
          <div
            aria-live="polite"
            className="flex items-center gap-2 text-sm text-neutral-muted"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            {t(
              "career.profile.documents.call_note_loading",
              "통화 기록을 불러오는 중입니다."
            )}
          </div>
        ) : error ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 text-center">
            <p className="text-sm text-critical">{error}</p>
            <div className="flex items-center gap-2">
              <MuteButton onClick={handleRetry}>
                {t("career.profile.documents.call_note_retry", "다시 시도")}
              </MuteButton>
              <MuteButton variant="transparent" onClick={onBack}>
                {t("career.profile.documents.call_note_back", "문서 목록으로")}
              </MuteButton>
            </div>
          </div>
        ) : callNote ? (
          <div className="mx-auto w-full max-w-[800px]">
            <header className="flex flex-col gap-4 border-b border-neutral-1000-a05 pb-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold leading-8 text-neutral-primary sm:text-2xl">
                  {title}
                </h1>
                <p className="mt-1.5 text-[13px] text-neutral-soft">
                  {[dateLabel, durationLabel].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <MuteButton
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={!onStartCallMode || callStartPending}
                  onClick={handleResumeCall}
                >
                  {callStartPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PhoneCall className="h-3.5 w-3.5" />
                  )}
                  {t(
                    "career.profile.documents.call_note_resume",
                    "콜 이어서 하기"
                  )}
                </MuteButton>
                <Badge
                  size="md"
                  variant="faded"
                  radius="full"
                  icon={<LockKeyhole className="h-3.5 w-3.5" />}
                  className="h-auto min-h-7 w-fit shrink-0 flex-row flex-nowrap gap-1.5 px-2.5 py-1 leading-4 whitespace-nowrap"
                >
                  {t(
                    "career.profile.documents.call_note_read_only",
                    "읽기 전용"
                  )}
                </Badge>
              </div>
            </header>

            {keyPoints.length > 0 ? (
              <section className="mt-6 rounded-xl border border-neutral-1000-a05 bg-primary-faded px-5 py-5">
                <h2 className="text-sm font-semibold text-neutral-primary">
                  {t("career.profile.documents.call_note_key_points", "요약")}
                </h2>
                <ul className="mt-4 grid gap-3 text-sm font-medium leading-6 text-neutral-primary">
                  {keyPoints.map((point, index) => (
                    <li key={`${index}-${point}`} className="flex gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                      />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="mt-6 border-t border-neutral-1000-a05 pt-6">
              <h2 className="text-sm font-medium text-neutral-muted">
                {t(
                  "career.profile.documents.call_note_transcript",
                  "대화 내용"
                )}
              </h2>
              <div className="mt-4 divide-y divide-neutral-1000-a05">
                {callNote.entries.map((entry, index) => (
                  <div
                    key={`${entry.timestamp ?? "entry"}-${index}`}
                    className="grid gap-1.5 py-3.5 first:pt-0 sm:grid-cols-[72px_minmax(0,1fr)] sm:gap-4"
                  >
                    <p className="text-xs font-medium text-neutral-soft">
                      {entry.role === "harper"
                        ? "Harper"
                        : t("career.profile.documents.call_note_me", "나")}
                    </p>
                    <p className="whitespace-pre-wrap text-[13px] leading-[1.4rem] text-neutral-muted">
                      {entry.text}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </article>
    </section>
  );
};

export default CareerCallNoteDetail;
