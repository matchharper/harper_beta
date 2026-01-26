"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import React, { useMemo, useState } from "react";
import Animate from "../landing/Animate";
import { showToast } from "../toast/toast";

export type WaitlistExtraInfo = {
  currentRole: string;
  interests: string;
  profileUrl?: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: WaitlistExtraInfo) => Promise<void> | void;
};

export const WaitlistExtraInfoModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState("");
  const [currentRole, setCurrentRole] = useState<string>("");
  const [experienceLevel, setExperienceLevel] = useState<string>(
    EXPERIENCE_OPTIONS[0]
  );
  const [interests, setInterests] = useState<string>("");
  const [profileUrl, setProfileUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (profileUrl.trim() === "") {
      showToast({
        message: "프로필 링크를 입력해주세요.",
        variant: "white",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        currentRole,
        interests,
        profileUrl: profileUrl.trim() || undefined,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/2 text-black px-4">
      <Animate className="relative w-full max-w-lg rounded-xl bg-white p-4 shadow-2xl md:p-6">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm md:text-base font-semibold">
              등록해주셔서 감사합니다.
            </h2>
            <p className="mt-1 text-xs md:text-sm font-normal text-xgray500">
              아래 정보를 알려주시면 더 잘 맞는 팀과 기회를 소개해드릴 수
              있어요. 프로필 링크는 필수 사항입니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex absolute md:top-2 md:right-2 top-0 right-0 h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(e);
          }}
          className="flex flex-col gap-4"
        >
          {/* <div className="flex flex-row items-center justify-between gap-2">
            <div className="w-full">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                이름
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-0 placeholder:text-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                placeholder=""
              />
            </div>
            <div className="w-full">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                총 경력
              </label>
              <select
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
              >
                {EXPERIENCE_OPTIONS.map((exp) => (
                  <option key={exp} value={exp}>
                    {exp}
                  </option>
                ))}
              </select>
            </div>
          </div> */}

          {/* Current role */}
          <Input
            label="주요 프로필 링크"
            value={profileUrl}
            onChange={(e: any) => setProfileUrl(e.target.value)}
            placeholder="LinkedIn, GitHub 또는 개인 사이트 링크"
            isDefault
            isRequired
          />
          <Input
            label="현재 역할 혹은 희망하는 역할"
            value={currentRole}
            onChange={(e: any) => setCurrentRole(e.target.value)}
            placeholder="예: ML Engineer, AI Researcher, 학생 등"
          />
          <Input
            label="어떤 팀 혹은 기회를 찾고 계신가요?"
            value={interests}
            onChange={(e: any) => setInterests(e.target.value)}
            placeholder="예: 비자 지원 가능한 팀, 모든 파트타임 기회, 리서치 기반 스타트업, 인턴 등"
            rows={2}
          />

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full text-sm text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
            >
              나중에 할게요
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center rounded-lg bg-black px-4 py-3 text-sm font-normal text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:bg-gray-800"
            >
              {isSubmitting ? (
                <LoaderCircle className="w-4 h-4 animate-spin text-white" />
              ) : (
                "정보 제공하기"
              )}
            </button>
          </div>
        </form>
      </Animate>
    </div>
  );
};

{
  /* Interests */
}
{
  /* <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              어떤 형태의 기회를 찾고 계신가요? (복수 선택 가능)
            </label>
            <div className="flex flex-wrap gap-1">
              {INTEREST_OPTIONS.map((option) => {
                const active = interests.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleInterest(option)}
                    className={`rounded-md border px-3 py-1 text-xs md:text-sm transition ${
                      active
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div> */
}

{
  /* Profile URL */
}

const Input = ({
  label,
  value,
  onChange,
  placeholder,
  rows,
  isDefault,
  isRequired,
}: {
  label: string;
  value: string;
  onChange: any;
  placeholder: string;
  rows?: number;
  isDefault?: boolean;
  isRequired?: boolean;
}) => {
  const isDisabled = useMemo(() => value === "default", [value]);

  return (
    <div className="flex flex-col gap-1 w-full mt-0 md:mt-2">
      <div className="flex flex-row items-center justify-between text-[14px] font-medium">
        <div className="text-sm md:text-base">
          {label} {isRequired && <span className="text-red-500">*</span>}
        </div>
        {isDefault && (
          <div
            onClick={() => {
              if (isDisabled) {
                onChange({ target: { value: "" } });
              } else {
                onChange({ target: { value: "default" } });
              }
            }}
            className="flex flex-row items-center gap-1 text-[12px] font-normal text-xgray600"
          >
            <div
              className={`w-[14px] h-[14px] border border-xgray500 rounded-[3px] mt-[0px] flex items-center justify-center ${
                isDisabled ? "bg-brightnavy" : "bg-white"
              }`}
            >
              <Check strokeWidth={3} className="w-2 h-2 text-white" />
            </div>
            <div>없음</div>
          </div>
        )}
      </div>
      {!isDisabled ? (
        <>
          {rows ? (
            <textarea
              placeholder={placeholder}
              className="w-full px-3 py-2 border border-xgray400 rounded-[5px] text-xs md:text-[13px] font-normal leading-5 focus:ring-1 focus:ring-brightnavy outline-none"
              value={value}
              onChange={onChange}
              rows={rows}
            />
          ) : (
            <input
              placeholder={placeholder}
              className="w-full h-[36px] px-3 py-2 border border-xgray400 rounded-[5px] text-xs md:text-[13px] font-normal leading-5 focus:ring-1 focus:ring-brightnavy outline-none"
              value={value}
              onChange={onChange}
            />
          )}
        </>
      ) : (
        <div className="w-full h-[36px] px-3 py-2 bg-xlightgray border border-xgray400 rounded-[5px] text-xs md:text-[13px] font-normal leading-5 focus:ring-1 focus:ring-brightnavy outline-none" />
      )}
    </div>
  );
};

const ROLE_OPTIONS = [
  "ML Engineer",
  "AI Researcher",
  "Software Engineer",
  "Student",
  "Other",
];

const EXPERIENCE_OPTIONS = ["0–1년", "1–3년", "3–6년", "6년 이상"];

const INTEREST_OPTIONS = [
  "풀타임",
  "리모트",
  "파트타임",
  "인턴",
  "글로벌 팀 / 해외 회사",
];
