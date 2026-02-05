"use client";

import React, { useEffect, useState } from "react";
import BaseModal from "./BaseModal";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { CheckIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { notifyToSlack } from "@/lib/slack";

type SimpleTextModalProps = {
    open: boolean;
    title?: string; // 모달 상단 제목(고정이면 생략 가능)
    candidId: string;
    initialText?: string; // 열릴 때 기본값
    placeholder?: string;
    name?: string;
    isLoading?: boolean;
    isSaving?: boolean;

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
    isLoading = false,
    isSaving = false,
    onClose,
    onConfirm,
    isLike = false,
}: SimpleTextModalProps) => {
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
        } catch (e) {
            console.error("Failed to confirm:", e);
        }
    };

    return (
        <BaseModal
            onClose={onClose}
            onConfirm={handleConfirm}
            isLoading={isSaving}
            confirmLabel={isLike ? <div className="flex items-center gap-2">
                <CheckIcon className="w-4 h-4 text-hgray100" />
                관심 등록 및 연결 요청
            </div> : "피드백 보내기"}
            isCloseButton={true}
            size="sm"
        >
            <div className="flex flex-col gap-3">
                {/* 제목 */}
                <div className="text-lg font-normal text-white">{title}</div>
                {
                    isLike ? (
                        <div className="text-sm mt-0 font-light text-hgray800">
                            {/* 관심 리스트에 저장했습니다.<br /> */}
                            원하신다면 연결 가능한 방법이 있는지 저희가 확인해 드릴게요.
                            {/* <div className='bg-white/40 my-3 h-[1px]' /> */}
                            <br />
                            <span className='text-white'>어떤 점이 가장 마음에 드셨나요?</span>
                            <br />
                            이유를 알려주시면 추천 정확도가 올라갑니다.
                        </div>
                    ) : (
                        <div className="text-sm mt-0 font-light text-hgray800">
                            이유를 짧게 남겨주시면,
                            다음엔 더 정확한 분을 모셔오겠습니다.
                        </div>
                    )
                }

                {/* 내용 */}
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={placeholder}
                    disabled={isBusy}
                    rows={4}
                    className="w-full mt-2 placeholder:text-xs resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-hgray900 outline-none disabled:bg-hgray50 disabled:text-hgray500"
                />
            </div>
        </BaseModal>
    );
};

export default React.memo(SimpleAreaModal);
