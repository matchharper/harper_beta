"use client";

import React, { useEffect, useState } from "react";
import BaseModal from "./BaseModal";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { CheckIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { notifyToSlack } from "@/lib/slack";
import { Textarea as UiTextarea } from "@/components/ui/textarea";

type SimpleTextModalProps = {
  open: boolean;
  title?: string; // 모달 상단 제목(고정이면 생략 가능)
  candidId: string;
  initialText?: string; // 열릴 때 기본값
  placeholder?: string;
  name?: string;

  onClose: () => void;
  onConfirm: () => void;
  isLike?: boolean;
};

const SimpleAreaModal = ({
  open,
  title = "입력",
  candidId,
  initialText = "",
  placeholder = "내용을 입력하세요",
  name = "",
  onClose,
  onConfirm,
  isLike = false,
}: SimpleTextModalProps) => {
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { companyUser } = useCompanyUserStore();

  useEffect(() => {
    if (!open) return;
    setText(initialText ?? "");
  }, [open, initialText]);

  if (!open) return null;

  const handleConfirm = async () => {
    try {
      setIsLoading(true);
      if (isLike) {
        await supabase.from("connection").insert({
          user_id: companyUser?.user_id,
          candid_id: candidId,
          typed: 4,
          text: text,
        });
        await notifyToSlack(
          `🔍 *${companyUser?.name}님이 선호 후보자로 등록: ${name}*\n\n` +
            `• *이유*: ${text}\n` +
            `• *candid ID*: ${candidId}\n` +
            `• *Time(Standard Korea Time)*: ${new Date().toLocaleString("ko-KR")}`
        );
      } else {
        await supabase.from("connection").insert({
          user_id: companyUser?.user_id,
          candid_id: candidId,
          typed: 5,
          text: text,
        });
        await notifyToSlack(
          `🔍 *${companyUser?.name}님이 후보자를 패스함: ${name}*\n\n` +
            `• *이유*: ${text}\n` +
            `• *candid ID*: ${candidId}\n` +
            `• *Time(Standard Korea Time)*: ${new Date().toLocaleString("ko-KR")}`
        );
      }
      onConfirm();
      setIsLoading(false);
    } catch (e) {
      setIsLoading(false);
      console.error("Failed to confirm:", e);
    }
  };

  return (
    <BaseModal
      onClose={onClose}
      onConfirm={handleConfirm}
      isLoading={isLoading}
      confirmLabel={
        isLike ? (
          <div className="flex items-center gap-2">
            <CheckIcon className="w-4 h-4 text-neutral-00" />
            저장하기
          </div>
        ) : (
          "저장하기"
        )
      }
      isCloseButton={true}
      size="sm"
    >
      <div className="flex flex-col gap-3">
        {/* 제목 */}
        <div className="text-lg font-normal text-neutral-primary">
          {title}
        </div>
        {isLike ? (
          <div className="text-sm mt-0 font-light text-neutral-primary leading-relaxed">
            <span className="text-neutral-primary">
              어떤 점이 마음에 드셨나요?
            </span>
            <br />
            선호 이유를 알려주시면, 다음 추천에 반영됩니다.
          </div>
        ) : (
          <div className="text-sm mt-0 font-light text-neutral-primary">
            아쉬운 점을 짧게 남겨주시면, 다음 추천에 반영됩니다.
          </div>
        )}

        {/* 내용 */}
        <UiTextarea
          unstyled
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          disabled={isLoading}
          rows={4}
          className="w-full mt-2 placeholder:text-sm resize-none rounded-xl border border-neutral-1000-a05 bg-bg-default px-3 py-2 text-sm text-neutral-primary outline-none disabled:bg-bg-basement disabled:text-neutral-disabled"
        />
      </div>
    </BaseModal>
  );
};

export default React.memo(SimpleAreaModal);
