// components/common/ConfirmModal.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useToggleRequest } from "@/hooks/useToggleRequest";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { supabase } from "@/lib/supabase";
import NameProfile from "../NameProfile";
import { dateToFormatLong } from "@/utils/textprocess";
import { showToast } from "../toast/toast";
import { notifyToSlack } from "@/lib/slack";
import { useMessages } from "@/i18n/useMessage";
import { Tooltips } from "../ui/tooltip";
import { HelpCircle } from "lucide-react";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { BareButton } from "@/components/ui/button";

interface ConnectionModalProps {
  open: boolean;
  name?: string;
  headline?: string;
  location?: string;
  profilePicture?: string;
  onClose: () => void;
  candidId: string;
  onConfirm: () => void;
  isRequested: boolean;
}

const ConnectionModal: React.FC<ConnectionModalProps> = ({
  open,
  name,
  headline,
  location,
  profilePicture,
  onClose,
  candidId,
  onConfirm,
  isRequested,
}) => {
  const [text, setText] = useState("");
  const [requestText, setRequestText] = useState("");
  const [requestDate, setRequestDate] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const { m } = useMessages();
  const companyUser = useCompanyUserStore((s) => s.companyUser);
  const companyUserId = companyUser?.user_id ?? null;

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setRequestSent(false);
    if (!isRequested) {
      setRequestText("");
      setRequestDate("");
    }
  }, [open, isRequested]);

  useEffect(() => {
    if (!isRequested || !companyUserId) return;

    const loadRequest = async () => {
      const { data, error } = await supabase
        .from("request")
        .select("text, created_at")
        .eq("user_id", companyUserId)
        .eq("candid_id", candidId)
        .eq("status", 0)
        .maybeSingle();

      if (error) {
        console.error("error ", error);
        return;
      }
      setRequestText(data?.text ?? "");
      setRequestDate(dateToFormatLong(data?.created_at ?? ""));
    };

    void loadRequest();
  }, [isRequested, companyUserId, candidId]);

  const { mutate: toggleRequestMutation } = useToggleRequest();

  const onConfirmHandler = async () => {
    if (!companyUserId || !candidId) {
      return;
    }

    if (!isRequested) {
      const introText = text.trim();
      if (!introText) {
        showToast({
          message: "Intro 요청 메시지를 입력해주세요.",
          variant: "white",
        });
        return;
      }
      toggleRequestMutation({ userId: companyUserId, candidId });
      const { error } = await supabase.from("request").insert({
        user_id: companyUserId,
        candid_id: candidId,
        text: introText,
      });
      await notifyToSlack(`💬 *Connection Request from user: ${
        companyUser?.name
      }* (${companyUser?.company ?? "회사 정보 없음"})

      • *To*: ${name} - ${headline}
      • *Content*: ${introText}
      • *Time(Standard Korea Time)*: ${new Date().toLocaleString("ko-KR")}`);

      if (error) {
        return;
      }
      setText("");
      setRequestSent(true);
      return;
    }

    toggleRequestMutation({ userId: companyUserId, candidId });
    const { error } = await supabase
      .from("request")
      .update({
        status: 1,
      })
      .eq("user_id", companyUserId)
      .eq("candid_id", candidId);
    if (error) {
      return;
    }
    showToast({ message: "Intro 요청이 취소되었습니다.", variant: "white" });
    onConfirm();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 w-full transition-all duration-200">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        className={`relative z-50 w-full ${
          requestSent ? "max-w-[580px]" : "max-w-[640px]"
        } rounded-[28px] bg-bg-default p-6 shadow-sm border border-neutral-1000-a05`}
      >
        <NameProfile
          id={candidId}
          profile_picture={profilePicture ?? ""}
          name={name ?? ""}
          headline={headline ?? ""}
          location={location ?? ""}
        />

        {requestSent ? (
          <div className="flex flex-col items-start justify-start mt-8 gap-1 font-light text-[15px] leading-relaxed">
            Intro 요청이 전송되었습니다. <br />
            후보가 수락하면 연결을 도와드릴게요.
          </div>
        ) : (
          <div className="flex flex-col items-start justify-start mt-8 gap-1">
            <div className="text-[16px] font-light">
              Harper에게 보낼 내용
              <span className="text-neutral-muted ml-2 text-sm">
                {isRequested && requestDate
                  ? ` (Requested at ${requestDate})`
                  : ""}
              </span>
            </div>
            {isRequested ? (
              <div className="w-full mt-2 rounded-md border border-neutral-1000-a05 bg-bg-basement px-4 py-3 text-sm text-neutral-primary focus:outline-none focus:ring-2 focus:ring-neutral-1000-a05">
                {requestText || "이미 Intro 요청을 보낸 상태입니다."}
              </div>
            ) : (
              <UiTextarea
                unstyled
                placeholder={`[${name}]님을 커피챗으로 만나보고 싶습니다.`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                className="w-full text-neutral-primary mt-2 rounded-2xl border font-light border-neutral-1000-a05 bg-bg-default p-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-neutral-1000-a05"
              />
            )}
            <Tooltips
              text="Harper가 연결되기를 원하시는 분과의 중간 연결고리가 되어 드립니다. 꼭 목적을 함께 알려주세요."
              side="bottom"
            >
              <div className="text-xs text-neutral-muted mt-2 ml-2 flex flex-row items-center gap-1">
                <HelpCircle strokeWidth={1.5} className="w-3 h-3" /> Harper가
                어떻게 도와주나요?
              </div>
            </Tooltips>
          </div>
        )}

        <div className="w-full mt-8 flex flex-row items-end justify-end gap-2 transition-colors duration-200">
          {requestSent && (
            <BareButton
              className="inline-flex items-center justify-center rounded-xl bg-black px-6 py-3 text-sm font-medium text-neutral-00 disabled:cursor-not-allowed disabled:opacity-70"
              onClick={() => {
                onConfirm();
                onClose();
                showToast({
                  message: "Intro 요청이 전송되었습니다.",
                  variant: "white",
                });
              }}
            >
              Close
            </BareButton>
          )}
          {!requestSent && (
            <>
              <BareButton
                className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-medium text-neutral-muted hover:bg-bg-default"
                onClick={onClose}
              >
                {m.system.close}
              </BareButton>
              <BareButton
                className="inline-flex items-center justify-center rounded-xl bg-black px-6 py-3 text-sm font-medium text-neutral-00 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={onConfirmHandler}
              >
                {isRequested ? "요청 취소" : "Intro 요청하기"}
              </BareButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConnectionModal;
