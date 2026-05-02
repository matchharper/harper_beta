"use client";

import React, { useEffect, useState } from "react";
import BaseModal from "./BaseModal";
import { Checkbox } from "@/components/ui/Checkbox";
import type { UserSettings } from "@/hooks/useSettings";

type ChatSettingsModalProps = {
  open: boolean;
  settings: UserSettings;
  onClose: () => void;
  onSave: (next: UserSettings) => Promise<void>;
  isLoading?: boolean;
  isSaving?: boolean;
};

const ChatSettingsModal = ({
  open,
  settings,
  onClose,
  onSave,
  isLoading = false,
  isSaving = false,
}: ChatSettingsModalProps) => {
  const [draft, setDraft] = useState<UserSettings>(settings);

  useEffect(() => {
    if (!open) return;
    setDraft(settings);
  }, [open, settings]);

  const isBusy = isLoading || isSaving;

  if (!open) return null;

  const handleSave = async () => {
    try {
      await onSave(draft);
      onClose();
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  };

  return (
    <BaseModal
      onClose={onClose}
      onConfirm={() => {
        if (isBusy) return;
        void handleSave();
      }}
      isLoading={isSaving}
      confirmLabel="저장"
      isCloseButton={true}
      size="sm"
    >
      <div className="flex flex-col gap-2">
        <div className="text-lg font-normal text-beige900">검색 기본 설정</div>
        <div className="text-sm text-beige900/80">
          아래에서 설정된 값들은 검색시 요청하지 않아도 항상 적용됩니다.
        </div>

        <div className="space-y-3 mt-4">
          <label className="flex items-center gap-2 text-sm text-beige900/80">
            <Checkbox
              checked={draft.is_korean}
              onChange={() =>
                setDraft((prev) => ({ ...prev, is_korean: !prev.is_korean }))
              }
            />
            한국 관련 사람만 보기 (한국인 혹은 한국 학교/회사 출신)
          </label>
          {isLoading && (
            <div className="text-xs text-beige900/55">
              기존 설정을 불러오는 중입니다.
            </div>
          )}
        </div>
      </div>
    </BaseModal>
  );
};

export default React.memo(ChatSettingsModal);
