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
    if (isRequested) {
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
    }
  }, [isRequested, companyUser.user_id, candidId]);

  const { mutate: toggleRequestMutation } = useToggleRequest();

  const onConfirmHandler = async () => {
    if (!companyUser?.user_id || !candidId) {
      return;
    }
    toggleRequestMutation({ userId: companyUser.user_id, candidId });

    if (!isRequested && text) {
      const { error } = await supabase.from("request").insert({
        user_id: companyUser.user_id,
        candid_id: candidId,
        text: text,
      });
      await notifyToSlack(`💬 *Connection Request from user: ${
        companyUser?.name
      }* (${companyUser?.company ?? "회사 정보 없음"})

      • *To*: ${name} - ${headline}
      • *Content*: ${text}
      • *Time(Standard Korea Time)*: ${new Date().toLocaleString("ko-KR")}`);

      if (error) {
        return;
      }
      setText("");
      setRequestSent(true);
    } else {
      const { error } = await supabase
        .from("request")
        .update({
          status: 1,
        })
        .eq("user_id", companyUser.user_id)
        .eq("candid_id", candidId);
      showToast({ message: "Request canceled.", variant: "white" });
      onConfirm();
      onClose();
    }
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
        } rounded-[28px] bg-hgray300 p-6 shadow-sm border border-white/10`}
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
            Thank you for requesting! <br />
            Your credit increase is being reviewed, and a decision will be made
            soon. If opted in, you’ll receive updates on the status via email.{" "}
            <br />
            I’m looking for AI engineer, who is exp sdfert in xx I’m looking for
            AI engineer, who is exp sdfert in xx I’m looking for AI engineer,
            who is exp sdfert in xx
          </div>
        ) : (
          <div className="flex flex-col items-start justify-start mt-8 gap-1">
            <div className="text-[16px] font-light">
              Message
              <span className="text-hgray700 ml-2 text-sm">
                {isRequested && requestDate
                  ? ` (Requested at ${requestDate})`
                  : ""}
              </span>
            </div>
            {isRequested ? (
              <div className="w-full mt-2 rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brightnavy">
                {requestText}
              </div>
            ) : (
              <textarea
                placeholder={`Hi [${name}], \nI hope this message finds you well.`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                className="w-full text-white mt-2 rounded-2xl border font-light border-white/10 bg-white/5 p-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-white/10"
              />
            )}
          </div>
        )}

        <div className="w-full mt-8 flex flex-row items-end justify-end gap-2 transition-colors duration-200">
          {requestSent && (
            <button
              className="inline-flex items-center justify-center rounded-xl bg-accenta1 px-6 py-3 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-70"
              onClick={() => {
                onConfirm();
                onClose();
                showToast({
                  message: "Connection requested.",
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
                className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-medium text-white hover:bg-white/5"
                onClick={onClose}
              >
                {m.system.close}
              </button>
              <button
                className="inline-flex items-center justify-center rounded-xl bg-accenta1 px-6 py-3 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-70"
                onClick={onConfirmHandler}
              >
                {isRequested ? (
                  "Cancel Request"
                ) : (
                  <div>
                    {m.data.request}{" "}
                    <span className="ml-1 text-[10px] font-light text-hgray900 border border-white/10 rounded-md px-1 py-0.5">
                      BETA
                    </span>
                  </div>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConnectionModal;
