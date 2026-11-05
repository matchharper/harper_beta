import { useRef, useState } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { CompanyLogo } from "@/components/career/watchlist/CompanyLogo";
import { useCareerT } from "@/i18n/useCareerT";
import { getDisplayableCompanyLogoUrl } from "@/lib/imageUrl";
import type { CareerHistoryOpportunity } from "../types";
import ApplyWithHarperButton from "./ApplyWithHarperButton";
import {
  getHiringPostApplyLabel,
  getHiringPostContactText,
  isHiringPostOpportunity,
} from "./hiringPost";

export default function ExternalOpportunityApplyModal({
  item,
  pending,
  error,
  onClose,
  onSave,
  onApplied,
  onOpenLink,
  onOpenChat,
}: {
  item: CareerHistoryOpportunity;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (
    stage: "saved" | "applied"
  ) => boolean | void | Promise<boolean | void>;
  onApplied: () => void;
  onOpenLink: (url: string) => void;
  onOpenChat: () => void;
}) {
  const t = useCareerT();
  const applyingRef = useRef(false);
  const [applying, setApplying] = useState(false);
  const busy = pending || applying;
  const hiringPost = isHiringPostOpportunity(item) ? item.hiringPost : null;
  const applyLink =
    hiringPost?.contactMethod === "apply_link" ? hiringPost.applyUrl : null;
  const postUrl = applyLink ?? item.externalJdUrl ?? item.href;

  const apply = async (
    action: () => boolean | void | Promise<boolean | void>
  ) => {
    if (busy || applyingRef.current) return false;
    applyingRef.current = true;
    setApplying(true);
    try {
      return (await action()) === true;
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  };

  return (
    <TalentCareerModal
      open
      mobileBottomSheet
      panelClassName="max-w-[440px]"
      onClose={() => {
        if (!busy) onClose();
      }}
      closeOnBackdrop={!busy}
      showCloseButton={!busy}
      title={
        hiringPost
          ? getHiringPostApplyLabel(t)
          : t("career.history.external_application.apply", "지원하기")
      }
      description={
        hiringPost
          ? t(
              "career.history.hiring_post.description",
              "채용 공고가 아니라 회사 사람이 올린 글이에요. 글에서 안내한 방법으로 연락하면 돼요."
            )
          : t(
              "career.history.external_application.description",
              "Harper에게 최종 지원까지 요청할 수 있습니다."
            )
      }
      bodyClassName="px-4 sm:px-5"
      footer={
        hiringPost ? (
          <div className="flex w-full flex-col gap-2">
            {postUrl ? (
              <MuteButton
                className="w-full"
                size="lg"
                disabled={busy}
                onClick={() => onOpenLink(postUrl)}
              >
                {applyLink
                  ? t(
                      "career.history.hiring_post.open_apply_link",
                      "지원 링크 열기"
                    )
                  : t("career.history.hiring_post.open_post", "글 열기")}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </MuteButton>
            ) : null}
            <ApplyWithHarperButton
              item={item}
              className="w-full"
              size="lg"
              pending={busy}
              onBeforeStart={() => apply(() => onSave("saved"))}
              onOpenChat={() => {
                onClose();
                onOpenChat();
              }}
              requestText={(opportunity) =>
                t(
                  "career.history.hiring_post.harper_request",
                  "{opportunity} 채용 글 작성자에게 연락하고 싶어. 보낼 메시지를 같이 준비해줘.",
                  { values: { opportunity } }
                )
              }
            >
              {t(
                "career.history.hiring_post.with_harper",
                "Harper와 연락 준비하기"
              )}
            </ApplyWithHarperButton>
            <MuteButton
              className="w-full"
              size="lg"
              variant="transparent"
              disabled={busy}
              aria-busy={applying}
              onClick={() =>
                void apply(async () => {
                  if ((await onSave("applied")) !== true) return false;
                  onClose();
                  onApplied();
                  return true;
                })
              }
            >
              {t("career.history.hiring_post.sent", "직접 연락했어요")}
            </MuteButton>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2">
            <MuteButton
              className="w-full"
              size="lg"
              disabled={busy}
              aria-busy={applying}
              onClick={() =>
                void apply(async () => {
                  const url = item.externalJdUrl ?? item.href;
                  if (url) onOpenLink(url);
                  if ((await onSave("applied")) !== true) return false;
                  onClose();
                  onApplied();
                  return true;
                })
              }
            >
              {t(
                "career.history.external_application.direct",
                "채용 페이지에서 지원"
              )}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </MuteButton>
            <ApplyWithHarperButton
              item={item}
              className="w-full"
              size="lg"
              pending={busy}
              onBeforeStart={() => apply(() => onSave("saved"))}
              onOpenChat={() => {
                onClose();
                onOpenChat();
              }}
            >
              {t(
                "career.history.external_application.with_harper",
                "Harper와 지원하기"
              )}
            </ApplyWithHarperButton>
          </div>
        )
      }
    >
      <div className="flex items-center gap-2 text-sm flex-col bg-bg-weak p-4 rounded-control">
        <CompanyLogo
          logoUrl={getDisplayableCompanyLogoUrl(item.companyLogoUrl)}
          name={item.companyName}
          size="xl"
        />
        <p className="min-w-0 break-words text-base mt-1">{item.companyName}</p>
        <p className="min-w-0 break-words">{item.title}</p>
      </div>
      {hiringPost ? (
        <div className="mt-3 space-y-1 text-sm">
          {hiringPost.posterName ? (
            <p className="text-neutral-muted">
              {t("career.history.hiring_post.poster", "올린 사람: {name}", {
                values: {
                  name: [hiringPost.posterName, hiringPost.posterTitle]
                    .filter(Boolean)
                    .join(" · "),
                },
              })}
            </p>
          ) : null}
          <p>{getHiringPostContactText(item, t)}</p>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-critical">
          {error}
        </p>
      ) : null}
    </TalentCareerModal>
  );
}
