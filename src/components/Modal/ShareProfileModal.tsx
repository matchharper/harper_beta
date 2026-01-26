import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import BaseModal from "./BaseModal";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/Checkbox";

async function copyToClipboard(text: string) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
}

export default function ShareProfileModal({
    open,
    onClose,
    candidId,
}: {
    open: boolean;
    onClose: () => void;
    candidId: string;
}) {
    const [includeChat, setIncludeChat] = useState<boolean>(false);
    const [url, setUrl] = useState<string>("");
    const [isCreating, setIsCreating] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [copied, setCopied] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string>("");
    const { companyUser } = useCompanyUserStore();

    useEffect(() => {
        if (!open) return;

        setUrl("");
        setErrorMsg("");
        setIsCreating(false);
        setIsCopying(false);
        setCopied(false);
        setIncludeChat(false);
    }, [open]);

    useEffect(() => {
        if (!copied) return;
        const t = window.setTimeout(() => setCopied(false), 1200);
        return () => window.clearTimeout(t);
    }, [copied]);

    const canCreate = useMemo(() => !!candidId && !isCreating, [candidId, isCreating]);

    const createShareLink = useCallback(async () => {
        if (!canCreate) return;
        setIsCreating(true);
        setErrorMsg("");

        try {
            const res = await fetch("/api/share/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    candidId,
                    includeChat,
                    createdBy: companyUser?.user_id,
                }),
            });

            const json = await res.json();
            if (!res.ok) {
                throw new Error(json?.error ?? "Failed to create share link");
            }

            const createdUrl = String(json.url || "");
            if (!createdUrl) throw new Error("Share URL is empty");
            setUrl(createdUrl);
        } catch (e: any) {
            setErrorMsg(e?.message ?? "Unknown error");
        } finally {
            setIsCreating(false);
        }
    }, [candidId, includeChat, canCreate, companyUser?.user_id]);

    const copyUrl = useCallback(async () => {
        if (!url) return;
        setIsCopying(true);
        setErrorMsg("");
        try {
            await copyToClipboard(url);
            setCopied(true);
        } catch (e: any) {
            setErrorMsg(e?.message ?? "Copy failed");
        } finally {
            setIsCopying(false);
        }
    }, [url]);

    useEffect(() => {
        if (!open || !url) return;
        copyUrl();
    }, [url, open, copyUrl]);

    if (!open) return null;

    return (
        <BaseModal
            onClose={onClose}
            onConfirm={createShareLink}
            isLoading={isCreating}
            confirmLabel={isCreating ? "링크 생성 중..." : "링크 생성"}
            isCloseButton={true}
            size="sm"
        >
            <div className="space-y-4">
                <div className="text-lg font-normal">프로필 공유</div>
                <label className="flex items-center gap-2 text-sm text-gray-300">
                    {/* <input
                        type="checkbox"
                        checked={includeChat}
                        onChange={(e) => setIncludeChat(e.target.checked)}
                        className="rounded border-gray-600 bg-gray-700 text-accenta1 focus:ring-accenta1"
                    /> */}
                    <Checkbox
                        checked={includeChat}
                        onChange={() => setIncludeChat(!includeChat)}
                    />
                    채팅 기록도 함께 공유
                </label>

                <div className="rounded-xl bg-hgray300 p-3 text-sm text-hgray800">
                    공유 링크를 가진 사람은 이 프로필을 볼 수 있어요.
                    <br />
                    외부 공유 시 주의하세요.
                </div>

                {url && (
                    <div className="space-y-2 mt-1">
                        <div className="text-xs text-gray-400 flex flex-row items-center justify-between">
                            <div>
                                공유 링크
                            </div>
                            <button
                                onClick={copyUrl}
                                className="text-xs text-gray-400 hover:text-accenta1"
                            >
                                {isCopying ? "복사 중..." : "복사"}
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 break-all rounded-lg border border-gray-700 bg-gray-900 p-2 text-sm text-gray-300">
                                {url}
                            </div>
                        </div>
                        {copied && (
                            <div className="text-sm text-green-500">복사됨 ✓</div>
                        )}
                    </div>
                )}

                {errorMsg && (
                    <div className="rounded-lg bg-red-900 p-2 text-sm text-red-300">
                        {errorMsg}
                    </div>
                )}
            </div>
        </BaseModal>
    );
}
