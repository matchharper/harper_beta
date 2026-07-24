import { LoaderCircle, X } from "lucide-react";
import React, { useState } from "react";
import { showToast } from "@/components/toast/toast";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { BareButton, MuteButton } from "@/components/ui/button";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { useCareerT } from "@/i18n/useCareerT";

const CareerSupportInquiryModal = ({
  onClose,
  defaultEmail = "",
}: {
  onClose: () => void;
  defaultEmail?: string;
}) => {
  const t = useCareerT();

  const logCareerEvent = useCareerLogEvent();
  const { fetchWithAuth } = useCareerApi();
  const [email, setEmail] = useState(() => defaultEmail);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    if (submitting) return;
    logCareerEvent("click_support_close");
    onClose();
  };

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    const trimmedContent = content.trim();

    if (submitting) return;

    if (!trimmedEmail) {
      showToast({
        message: t(
          "career.common.career_support_inquiry_modal.1kxvbd7",
          "이메일을 입력해 주세요."
        ),
        variant: "white",
      });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      showToast({
        message: t(
          "career.common.career_support_inquiry_modal.1fep109",
          "올바른 이메일 형식으로 입력해 주세요."
        ),
        variant: "white",
      });
      return;
    }

    if (!trimmedContent) {
      showToast({
        message: t(
          "career.common.career_support_inquiry_modal.0snjgs4",
          "문의 내용을 입력해 주세요."
        ),
        variant: "white",
      });
      return;
    }

    logCareerEvent("click_support_submit");
    setSubmitting(true);

    try {
      const response = await fetchWithAuth("/api/feedback/career", {
        method: "POST",
        body: JSON.stringify({
          email: trimmedEmail,
          content: trimmedContent,
          pagePath:
            typeof window !== "undefined"
              ? window.location.pathname
              : "/career",
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.error) {
        throw new Error(
          data?.error ??
            t(
              "career.common.career_support_inquiry_modal.1o8h20r",
              "문의 저장에 실패했습니다."
            )
        );
      }

      onClose();
      setContent("");
      showToast({
        message: t(
          "career.common.career_support_inquiry_modal.17hinuj",
          "문의가 접수되었습니다."
        ),
        variant: "white",
      });
    } catch (error) {
      console.error("career inquiry submit failed:", error);
      showToast({
        message:
          error instanceof Error
            ? error.message
            : t(
                "career.common.career_support_inquiry_modal.0ustycb",
                "문의 접수 중 오류가 발생했습니다."
              ),
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center p-4">
      <BareButton
        type="button"
        aria-label={"문의 모달 닫기"}
        onClick={handleClose}
        className="absolute inset-0 bg-black/15 backdrop-blur-[2px]"
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
        className="relative z-10 w-full max-w-[460px] rounded-2xl border border-neutral-1000-a05 bg-bg-floating p-5 shadow-[0_20px_60px_color-mix(in_srgb,var(--color-neutral-1000)_18%,transparent)]"
      >
        <MuteButton
          type="button"
          variant="transparent"
          onClick={handleClose}
          disabled={submitting}
          aria-label={"문의 모달 닫기"}
          className="absolute right-3 top-3 h-11 w-11 p-0 md:h-auto md:w-auto md:p-[7px]"
        >
          <X className="h-4 w-4" />
        </MuteButton>
        <div className="pr-8">
          <h2 className="text-base font-medium text-neutral-primary">
            {t(
              "career.common.career_support_inquiry_modal.012iiio",
              "개선사항 혹은 문의사항을 알려주세요."
            )}
          </h2>
          <p className="mt-2 text-sm leading-6 text-neutral-muted">
            {t(
              "career.common.career_support_inquiry_modal.reply_email_notice",
              "확인 후 {email}로 답변드리겠습니다.",
              {
                values: {
                  email,
                },
              }
            )}
          </p>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-normal text-neutral-muted">
              {t(
                "career.common.career_support_inquiry_modal.1x7y6fe",
                "Harper가 커리어 에이전트로써 어떤걸 해주기를 원하시나요?"
              )}
              <br />
              {t(
                "career.common.career_support_inquiry_modal.0au4clq",
                "아래에서 자유롭게 작성해주세요."
              )}
            </span>
            <UiTextarea
              unstyled
              value={content}
              onChange={(event) => setContent(event.target.value)}
              disabled={submitting}
              rows={4}
              placeholder={t(
                "career.common.career_support_inquiry_modal.10hs5il",
                "개선사항이나 문의사항을 입력해 주세요."
              )}
              className="w-full resize-none rounded-xl border border-neutral-1000-a05 bg-bg-floating px-3 py-3 text-base leading-6 text-neutral-primary outline-none transition placeholder:text-neutral-placeholder focus:border-neutral-400 focus:ring-2 focus:ring-neutral-1000-a05 disabled:cursor-not-allowed disabled:opacity-60 md:text-sm"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <MuteButton
            type="button"
            size="lg"
            onClick={handleClose}
            disabled={submitting}
          >
            {t("career.common.career_support_inquiry_modal.11apzn2", "닫기")}
          </MuteButton>
          <MuteButton
            type="submit"
            disabled={submitting}
            variant="dark"
            size="lg"
          >
            {submitting ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                {t(
                  "career.common.career_support_inquiry_modal.1kjxfan",
                  "접수 중"
                )}
              </>
            ) : (
              t(
                "career.common.career_support_inquiry_modal.submit_inquiry",
                "문의 보내기"
              )
            )}
          </MuteButton>
        </div>
      </form>
    </div>
  );
};

export default React.memo(CareerSupportInquiryModal);
