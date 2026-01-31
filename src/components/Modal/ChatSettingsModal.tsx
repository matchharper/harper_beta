"use client";

import React, { useEffect, useMemo, useState } from "react";
import BaseModal from "./BaseModal";
import { Checkbox } from "@/components/ui/Checkbox";
import type { UserSettings } from "@/hooks/useSettings";

const DEFAULT_MIN_YEARS = 0;
const DEFAULT_MAX_YEARS = 50;

type ChatSettingsModalProps = {
  open: boolean;
  settings: UserSettings;
  onClose: () => void;
  onSave: (next: UserSettings) => Promise<void>;
  isLoading?: boolean;
  isSaving?: boolean;
};

const clampYears = (n: number) => {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(60, n)); // 0~60년차로 제한 (원하면 조절)
};

const parseYears = (v: string): number | null => {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return clampYears(Math.floor(n));
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

  // 로컬 입력 상태(빈 문자열 유지하려고)
  const [minYearsText, setMinYearsText] = useState("");
  const [maxYearsText, setMaxYearsText] = useState("");

  useEffect(() => {
    if (!open) return;

    setDraft(settings);

    // settings -> input text 초기화
    const min = (settings as any).min_years_exp;
    const max = (settings as any).max_years_exp;

    setMinYearsText(typeof min === "number" ? String(min) : "");
    setMaxYearsText(typeof max === "number" ? String(max) : "");
  }, [
    open,
    settings.is_korean,
    settings.is_exclude_shortlist,
    // 아래 2개는 UserSettings에 필드가 있다고 가정
    (settings as any).min_years_exp,
    (settings as any).max_years_exp,
  ]);

  const isBusy = isLoading || isSaving;

  const yearsEnabled = useMemo(() => {
    const min = (draft as any).min_years_exp;
    const max = (draft as any).max_years_exp;
    return (
      (typeof min === "number" && min >= 0) ||
      (typeof max === "number" && max >= 0)
    );
  }, [draft]);

  if (!open) return null;

  const handleSave = async () => {
    try {
      await onSave(draft);
      onClose();
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  };

  const minVal = (draft as any).min_years_exp as number | null;
  const maxVal = (draft as any).max_years_exp as number | null;

  const minError =
    typeof minVal === "number" &&
    typeof maxVal === "number" &&
    minVal > maxVal;

  return (
    <BaseModal
      onClose={onClose}
      onConfirm={handleSave}
      isLoading={isSaving}
      confirmLabel="저장"
      isCloseButton={true}
      size="sm"
    >
      <div className="flex flex-col gap-2">
        <div className="text-lg font-normal text-hgray900">검색 기본 설정</div>
        <div className="text-sm text-hgray800">
          아래에서 설정된 값들은 검색시 요청하지 않아도 항상 적용됩니다.
        </div>

        <div className="space-y-3 mt-4">
          <label className="flex items-center gap-2 text-sm text-hgray800">
            <Checkbox
              checked={draft.is_korean}
              onChange={() =>
                setDraft((prev) => ({ ...prev, is_korean: !prev.is_korean }))
              }
            />
            한국인 혹은 한국어 가능 후보만 보기
          </label>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-hgray800">
              <Checkbox
                checked={yearsEnabled}
                onChange={() => {
                  setDraft((prev) => {
                    const curMin = (prev as any).min_years_exp;
                    const curMax = (prev as any).max_years_exp;
                    const enabled =
                      (typeof curMin === "number" && curMin >= 0) ||
                      (typeof curMax === "number" && curMax >= 0);

                    if (enabled) {
                      setMinYearsText("");
                      setMaxYearsText("");
                      return {
                        ...prev,
                        min_years_exp: null,
                        max_years_exp: null,
                      } as any;
                    }

                    setMinYearsText(String(DEFAULT_MIN_YEARS));
                    setMaxYearsText(String(DEFAULT_MAX_YEARS));
                    return {
                      ...prev,
                      min_years_exp: DEFAULT_MIN_YEARS,
                      max_years_exp: DEFAULT_MAX_YEARS,
                    } as any;
                  });
                }}
              />
              경력 범위 적용
            </label>

            {
              yearsEnabled &&
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={60}
                    step={1}
                    disabled={!yearsEnabled}
                    value={minYearsText}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMinYearsText(v);
                      const parsed = parseYears(v);
                      setDraft((prev) => ({
                        ...prev,
                        min_years_exp: parsed,
                      }) as any);
                    }}
                    onBlur={() => {
                      const parsed = parseYears(minYearsText);
                      setMinYearsText(
                        typeof parsed === "number" ? String(parsed) : ""
                      );
                    }}
                    className="w-16 rounded-md border border-hgray200 bg-white px-2 py-1 text-sm text-hgray100 disabled:bg-hgray50 disabled:text-hgray500"
                    placeholder="예: 3"
                  />
                  <span className="text-sm text-hgray800">년차 이상</span>
                </div>

                <span className="text-hgray800">~</span>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    step={1}
                    disabled={!yearsEnabled}
                    value={maxYearsText}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMaxYearsText(v);
                      const parsed = parseYears(v);
                      setDraft((prev) => ({
                        ...prev,
                        max_years_exp: parsed,
                      }) as any);
                    }}
                    onBlur={() => {
                      const parsed = parseYears(maxYearsText);
                      setMaxYearsText(
                        typeof parsed === "number" ? String(parsed) : ""
                      );
                    }}
                    className="w-16 rounded-md border border-hgray200 bg-white px-2 py-1 text-sm text-hgray100 disabled:bg-hgray50 disabled:text-hgray500"
                    placeholder="예: 10"
                  />
                </div>
                <span className="text-sm text-hgray800">년차 이하</span>
              </div>
            }
            {minError && yearsEnabled && (
              <div className="text-xs text-red-500">
                최소 년차가 최대 년차보다 클 수 없어요.
              </div>
            )}
          </div>
        </div>
      </div>
    </BaseModal>
  );
};

export default React.memo(ChatSettingsModal);
