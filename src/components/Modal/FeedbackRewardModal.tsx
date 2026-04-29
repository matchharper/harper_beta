"use client";

import React, { useState } from "react";
import BaseModal from "./BaseModal";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/toast/toast";
import { useFeedbackModalStore } from "@/store/useFeedbackModalStore";

const FeedbackRewardModal = () => {
  const { isOpen, close } = useFeedbackModalStore();
  const [feedbackText, setFeedbackText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const closeModal = () => {
    close();
    setFeedbackText("");
  };

  const onSubmitFeedback = async () => {
    const content = feedbackText.trim();
    if (!content || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        alert("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }

      const response = await fetch("/api/feedback/free-credit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ content }),
      });
      const data = await response.json();

      if (!response.ok || data?.error) {
        throw new Error(data?.error ?? "피드백 제출에 실패했습니다.");
      }

      closeModal();

      showToast({
        message: "피드백 감사합니다.",
      });
    } catch (error) {
      console.error("feedback submit failed:", error);
      alert("피드백 제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <BaseModal
      onClose={closeModal}
      onConfirm={onSubmitFeedback}
      confirmLabel="보내기"
      isLoading={isSubmitting}
      size="sm"
    >
      <div className="text-base font-normal text-beige900">피드백</div>
      <p className="mt-3 text-sm text-beige900/80 font-normal leading-relaxed">
        서비스 개선을 위해 피드백을 남겨주세요.
        <br />
        남겨주시는 모든 내용들이 큰 도움이 됩니다.
      </p>
      <textarea
        value={feedbackText}
        onChange={(e) => setFeedbackText(e.target.value)}
        rows={4}
        placeholder="피드백을 입력해 주세요."
        className="w-full mt-4 text-beige900 rounded-lg border font-light border-beige900/8 bg-beige50 p-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-beige900/8 resize-none"
      />
    </BaseModal>
  );
};

export default React.memo(FeedbackRewardModal);
