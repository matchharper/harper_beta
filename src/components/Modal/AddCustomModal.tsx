"use client";

import React, { useEffect, useState } from "react";
import BaseModal from "./BaseModal";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { CheckIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { notifyToSlack } from "@/lib/slack";

type SimpleTextModalProps = {
    open: boolean;
    candidId: string;
    onClose: () => void;
    onConfirm: () => void;
    isLike?: boolean;
};

const SimpleTextModal = ({
    open,
    candidId,
    onClose,
    isLike = false,
}: SimpleTextModalProps) => {
    const [customLists, setCustomLists] = useState<any[]>([]);
    const [alreadyAddedList, setAlreadyAddedList] = useState<any[]>([]);
    const [selectedCustomLists, setSelectedCustomLists] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchCustomLists = async () => {
            const { data, error } = await supabase.from("company_users").select("*").eq("is_custom", true);
            const { data: connectionData, error: connectionError } = await supabase.from("connection").select("*").eq("typed", 3).eq("candid_id", candidId);
            if (error) {
                console.error("Failed to fetch custom lists:", error);
                return;
            }
            if (connectionError) {
                console.error("Failed to fetch connection lists:", connectionError);
                return;
            }
            setAlreadyAddedList(connectionData?.map((item: any) => item.user_id) ?? []);
            setCustomLists(data);
        }
        fetchCustomLists();
    }, []);

    const handleSelectCustomList = (customListId: string) => {
        console.log(selectedCustomLists, customListId);
        if (selectedCustomLists.includes(customListId)) {
            setSelectedCustomLists(selectedCustomLists.filter((item: any) => item !== customListId));
        } else {
            setSelectedCustomLists([...selectedCustomLists, customListId]);
        }
    }

    const addToList = async () => {
        setIsSaving(true);
        for (const customListId of selectedCustomLists) {
            const { data, error } = await supabase.from("connection").insert({
                user_id: customListId,
                candid_id: candidId,
                typed: 3,
            });
        }
        setAlreadyAddedList([...alreadyAddedList, ...selectedCustomLists]);
        setIsSaving(false);
        setSelectedCustomLists([]);
    }

    if (!open) return null;

    return (
        <BaseModal
            onClose={onClose}
            onConfirm={() => addToList()}
            isLoading={isSaving}
            confirmLabel={isLike ? <div className="flex items-center gap-2">
                <CheckIcon className="w-4 h-4 text-green-500" />
                관심 등록 및 연결 요청
            </div> : "추가하기"}
            isCloseButton={true}
            size="sm"
        >
            <div className="flex flex-col gap-3">
                {/* 제목 */}
                <div className="text-lg font-normal text-white">후보자 추가</div>
                <div></div>

                <div>
                    {customLists.map((customList) => (
                        <div key={customList.user_id} onClick={() => handleSelectCustomList(customList.user_id)} className={`cursor-pointer p-1 rounded-md ${alreadyAddedList?.includes(customList.user_id) ? "bg-red-500/10 text-red-500" : selectedCustomLists?.includes(customList.user_id) ? "bg-accenta1/50 text-black" : "bg-transparent"}`}>
                            <div>{customList.name} - {customList.email} - {customList.company}</div>
                        </div>
                    ))}
                </div>
            </div>
        </BaseModal>
    );
};

export default React.memo(SimpleTextModal);
