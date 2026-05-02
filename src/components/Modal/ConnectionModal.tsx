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
  const { companyUser } = useCompanyUserStore.getState();

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
    if (!isRequested || !companyUser?.user_id) return;

    supabase
      .from("request")
      .select("text, created_at")
      .eq("user_id", companyUser.user_id)
      .eq("candid_id", candidId)
      .eq("status", 0)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("error ", error);
          return;
        }
        setRequestText(data?.text ?? "");
        setRequestDate(dateToFormatLong(data?.created_at ?? ""));
      });
  }, [isRequested, companyUser.user_id, candidId]);

  const { mutate: toggleRequestMutation } = useToggleRequest();

  const onConfirmHandler = async () => {
    if (!companyUser?.user_id || !candidId) {
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
      toggleRequestMutation({ userId: companyUser.user_id, candidId });
      const { error } = await supabase.from("request").insert({
        user_id: companyUser.user_id,
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

    toggleRequestMutation({ userId: companyUser.user_id, candidId });
    const { error } = await supabase
      .from("request")
      .update({
        status: 1,
      })
      .eq("user_id", companyUser.user_id)
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
        } rounded-[28px] bg-beige50 p-6 shadow-sm border border-beige900/8`}
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
              <span className="text-beige900/55 ml-2 text-sm">
                {isRequested && requestDate
                  ? ` (Requested at ${requestDate})`
                  : ""}
              </span>
            </div>
            {isRequested ? (
              <div className="w-full mt-2 rounded-md border border-beige900/8 bg-beige100 px-4 py-3 text-sm text-beige900 focus:outline-none focus:ring-2 focus:ring-beige900/8">
                {requestText || "이미 Intro 요청을 보낸 상태입니다."}
              </div>
            ) : (
              <textarea
                placeholder={`[${name}]님을 커피챗으로 만나보고 싶습니다.`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                className="w-full text-beige900 mt-2 rounded-2xl border font-light border-beige900/8 bg-beige50 p-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-beige900/8"
              />
            )}
            <Tooltips
              text="Harper가 연결되기를 원하시는 분과의 중간 연결고리가 되어 드립니다. 꼭 목적을 함께 알려주세요."
              side="bottom"
            >
              <div className="text-xs text-beige900/55 mt-2 ml-2 flex flex-row items-center gap-1">
                <HelpCircle strokeWidth={1.5} className="w-3 h-3" /> Harper가
                어떻게 도와주나요?
              </div>
            </Tooltips>
          </div>
        )}

        <div className="w-full mt-8 flex flex-row items-end justify-end gap-2 transition-colors duration-200">
          {requestSent && (
            <button
              className="inline-flex items-center justify-center rounded-xl bg-beige900 px-6 py-3 text-sm font-medium text-beige100 disabled:cursor-not-allowed disabled:opacity-70"
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
            </button>
          )}
          {!requestSent && (
            <>
              <button
                className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-medium text-beige900/55 hover:bg-beige50/80"
                onClick={onClose}
              >
                {m.system.close}
              </button>
              <button
                className="inline-flex items-center justify-center rounded-xl bg-beige900 px-6 py-3 text-sm font-medium text-beige100 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={onConfirmHandler}
              >
                {isRequested ? "요청 취소" : "Intro 요청하기"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConnectionModal;
