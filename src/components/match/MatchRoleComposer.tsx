"use client";

import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
import { Input, inputSurfaceClassName } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  MATCH_ROLE_STATUS_VALUES,
  type MatchEmploymentType,
  type MatchRoleStatus,
} from "@/lib/match/shared";
import { motion } from "framer-motion";
import { ChevronDown, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type MatchRoleComposerProps = {
  initialValues?: {
    description?: string | null;
    employmentTypes?: MatchEmploymentType[];
    externalJdUrl?: string | null;
    name?: string;
    status?: MatchRoleStatus;
  } | null;
  isSaving?: boolean;
  onCancel: () => void;
  onSubmit: (values: {
    description: string;
    employmentTypes: MatchEmploymentType[];
    externalJdUrl: string;
    name: string;
    status: MatchRoleStatus;
  }) => void | Promise<void>;
  title: string;
};

const STATUS_LABEL: Record<MatchRoleStatus, string> = {
  active: "진행중",
  ended: "종료",
  paused: "중단",
  top_priority: "최우선",
};

const EMPLOYMENT_TYPE_OPTIONS: {
  label: string;
  value: MatchEmploymentType;
}[] = [
  { label: "풀타임", value: "full_time" },
  { label: "파트타임", value: "part_time" },
];

export default function MatchRoleComposer({
  initialValues,
  isSaving = false,
  onCancel,
  onSubmit,
  title,
}: MatchRoleComposerProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [externalJdUrl, setExternalJdUrl] = useState(
    initialValues?.externalJdUrl ?? ""
  );
  const [description, setDescription] = useState(
    initialValues?.description ?? ""
  );
  const [employmentTypes, setEmploymentTypes] = useState<MatchEmploymentType[]>(
    initialValues?.employmentTypes ?? []
  );
  const [status, setStatus] = useState<MatchRoleStatus>(
    initialValues?.status ?? "active"
  );

  useEffect(() => {
    setName(initialValues?.name ?? "");
    setExternalJdUrl(initialValues?.externalJdUrl ?? "");
    setDescription(initialValues?.description ?? "");
    setEmploymentTypes(initialValues?.employmentTypes ?? []);
    setStatus(initialValues?.status ?? "active");
  }, [initialValues]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const canSubmit = useMemo(() => name.trim().length > 0, [name]);
  const labelStyle = "mb-3 text-xs text-white/75";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6 sm:px-6">
      <motion.button
        type="button"
        aria-label="role 편집 폼 닫기"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/20"
        onClick={onCancel}
      />

      <motion.section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, y: 28, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-[1] w-full max-w-[560px] overflow-hidden rounded-[16px] bg-hgray200 shadow-[0_32px_90px_rgba(0,0,0,0.2)] ring-1 ring-white/10"
      >
        <div className="px-5 py-5">
          <div className="flex items-start justify-between gap-6">
            <div className="max-w-[500px]">
              <h2 className="text-lg font-medium leading-tight text-white">
                {title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/60">
                role title, 우선순위, 고용 형태, JD 맥락을 한 번에 정리합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-white/55 transition hover:bg-white/5 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit || isSaving) return;
            void onSubmit({
              description,
              employmentTypes,
              externalJdUrl,
              name,
              status,
            });
          }}
          className="px-5 pb-5"
        >
          <div className="grid gap-7">
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,196px)]">
              <label className="block">
                <div className={labelStyle}>직무명</div>
                <Input
                  placeholder="예: Founding Product Designer"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>

              <div>
                <div className={labelStyle}>현재 상태</div>
                <ActionDropdown
                  align="start"
                  contentClassName="min-w-[180px]"
                  trigger={
                    <button
                      type="button"
                      className={cn(
                        inputSurfaceClassName,
                        "inline-flex items-center justify-between text-left text-sm"
                      )}
                    >
                      <span>{STATUS_LABEL[status]}</span>
                      <ChevronDown size={15} className="text-white/45" />
                    </button>
                  }
                >
                  {MATCH_ROLE_STATUS_VALUES.map((item) => (
                    <ActionDropdownItem
                      key={item}
                      onSelect={() => setStatus(item)}
                      className="flex items-center justify-between gap-3"
                    >
                      <span>{STATUS_LABEL[item]}</span>
                      {status === item ? (
                        <span className="text-xs text-white/45">선택됨</span>
                      ) : null}
                    </ActionDropdownItem>
                  ))}
                </ActionDropdown>
              </div>
            </div>

            <label className="block">
              <div className={labelStyle}>외부 JD 링크</div>
              <Input
                type="url"
                placeholder="https://..."
                value={externalJdUrl}
                onChange={(event) => setExternalJdUrl(event.target.value)}
              />
            </label>

            <div>
              <div className={labelStyle}>고용 형태 (복수 선택 가능)</div>
              <div className="flex flex-wrap gap-2">
                {EMPLOYMENT_TYPE_OPTIONS.map(({ label, value }) => {
                  const active = employmentTypes.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setEmploymentTypes((current) =>
                          current.includes(value)
                            ? current.filter((item) => item !== value)
                            : [...current, value]
                        );
                      }}
                      className={cn(
                        "inline-flex items-center rounded-lg border px-3 py-2 text-sm transition",
                        active
                          ? "border-accenta1 bg-accenta1 text-black"
                          : "border-white/10 text-white/70 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block">
              <div className={labelStyle}>직무 설명</div>
              <textarea
                rows={5}
                className={cn(
                  inputSurfaceClassName,
                  "min-h-[148px] resize-none py-3"
                )}
                placeholder="역할의 기대치, 팀 맥락, 가장 중요한 hiring bar를 적어주세요."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </div>

          <div className="mt-8 flex flex-col w-full justify-between gap-4 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={!canSubmit || isSaving}
              className="inline-flex w-full items-center justify-center rounded-lg bg-accenta1 px-4 py-2.5 text-sm font-semibold text-black transition hover:ring-2 hover:ring-accenta1/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "저장 중..." : "저장하기"}
            </button>
          </div>
        </form>
      </motion.section>
    </div>
  );
}
