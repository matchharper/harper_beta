"use client";

import React, { useEffect, useState } from "react";
import BaseModal from "./BaseModal";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { supabase } from "@/lib/supabase";
import { notifyToSlack } from "@/lib/slack";

type ConnectionAreaModalProps = {
  open: boolean;
  title?: string;
  candidId: string;
  initialText?: string;
  placeholder?: string;
  name?: string;
  isLoading?: boolean;
  isSaving?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

const ConnectionAreaModal = ({
  open,
  title = "연결 요청",
  candidId,
  initialText = "",
  placeholder = "전달할 메시지를 입력하세요.",
  name = "",
  isLoading = false,
  isSaving = false,
  onClose,
  onConfirm,
}: ConnectionAreaModalProps) => {
  const [text, setText] = useState("");
  const { companyUser } = useCompanyUserStore();

  useEffect(() => {
    if (!open) return;
    setText(initialText ?? "");
  }, [open, initialText]);

  if (!open) return null;

  const isBusy = isLoading || isSaving;

  const handleConfirm = async () => {
    try {
      await supabase.from("connection").insert({
        user_id: companyUser?.user_id,
        candid_id: candidId,
        typed: 7,
        text: text,
      });
      await notifyToSlack(
        `🔍 *${companyUser?.name}님이 연결 요청: ${name}*\n\n` +
          `• *메시지*: ${text}\n` +
          `• *candid ID*: ${candidId}\n` +
          `• *Time(Standard Korea Time)*: ${new Date().toLocaleString("ko-KR")}`
      );
      onConfirm();
    } catch (e) {
      console.error("Failed to confirm:", e);
    }
  };

  return (
    <BaseModal
      onClose={onClose}
      onConfirm={handleConfirm}
      isLoading={isSaving}
      confirmLabel="연결 요청 보내기"
      isCloseButton={true}
      size="sm"
    >
      <div className="flex flex-col gap-3">
        <div className="text-lg font-normal text-white">{title}</div>
        <div className="text-sm mt-0 font-light text-hgray800">
          연결 요청과 함께 Harper측에 전달하고 싶은 내용을 적어주세요.
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          disabled={isBusy}
          rows={4}
          className="w-full mt-2 placeholder:text-sm resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-hgray900 outline-none disabled:bg-hgray50 disabled:text-hgray500"
        />
      </div>
    </BaseModal>
  );
};

export default React.memo(ConnectionAreaModal);
