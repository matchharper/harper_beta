import { LoaderCircle, X } from "lucide-react";
import React, { useState } from "react";
import { showToast } from "@/components/toast/toast";
import { useCareerApi } from "@/hooks/career/useCareerApi";

const CareerSupportInquiryModal = ({
  onClose,
  defaultEmail = "",
}: {
  onClose: () => void;
  defaultEmail?: string;
}) => {
  const { fetchWithAuth } = useCareerApi();
  const [email, setEmail] = useState(() => defaultEmail);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    const trimmedContent = content.trim();

    if (submitting) return;

    if (!trimmedEmail) {
      showToast({ message: "이메일을 입력해 주세요.", variant: "white" });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      showToast({
        message: "올바른 이메일 형식으로 입력해 주세요.",
        variant: "white",
      });
      return;
    }

    if (!trimmedContent) {
      showToast({ message: "문의 내용을 입력해 주세요.", variant: "white" });
      return;
    }

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
        throw new Error(data?.error ?? "문의 저장에 실패했습니다.");
      }

      onClose();
      setContent("");
      showToast({ message: "문의가 접수되었습니다.", variant: "white" });
    } catch (error) {
      console.error("career inquiry submit failed:", error);
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "문의 접수 중 오류가 발생했습니다.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="문의 모달 닫기"
        onClick={handleClose}
        className="absolute inset-0 bg-beige900/15 backdrop-blur-[2px]"
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
        className="relative z-10 w-full max-w-[460px] rounded-2xl border border-beige900/10 bg-beige50 p-5 shadow-[0_20px_60px_rgba(37,20,6,0.18)]"
      >
        <button
          type="button"
          onClick={handleClose}
          disabled={submitting}
          aria-label="문의 모달 닫기"
          className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-lg text-beige900/50 transition hover:bg-beige900/5 hover:text-beige900 disabled:cursor-not-allowed disabled:opacity-40 md:h-8 md:w-8"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="pr-8">
          <h2 className="text-lg font-semibold text-beige900">
            개선사항 혹은 문의사항을 알려주세요.
          </h2>
          <p className="mt-2 text-sm leading-6 text-beige900/55">
            확인 후 입력하신 이메일로 답변드리겠습니다.
          </p>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-beige900/70">
              이메일
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
              placeholder="example@example.com"
              className="h-11 w-full rounded-xl border border-beige900/10 bg-white/75 px-3 text-base text-beige900 outline-none transition placeholder:text-beige900/30 focus:border-beige900/30 focus:ring-2 focus:ring-beige900/10 disabled:cursor-not-allowed disabled:opacity-60 md:text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-beige900/70">
              내용
            </span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              disabled={submitting}
              rows={4}
              placeholder="개선사항이나 문의사항을 입력해 주세요."
              className="w-full resize-none rounded-xl border border-beige900/10 bg-white/75 px-3 py-3 text-base leading-6 text-beige900 outline-none transition placeholder:text-beige900/30 focus:border-beige900/30 focus:ring-2 focus:ring-beige900/10 disabled:cursor-not-allowed disabled:opacity-60 md:text-sm"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-beige900/10 bg-white/65 px-4 text-sm font-medium text-beige900/70 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 md:h-10"
          >
            닫기
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-beige900 px-4 text-sm font-medium text-beige50 transition hover:bg-beige900/90 disabled:cursor-not-allowed disabled:opacity-40 md:h-10"
          >
            {submitting ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                접수 중
              </>
            ) : (
              "제출"
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default React.memo(CareerSupportInquiryModal);
