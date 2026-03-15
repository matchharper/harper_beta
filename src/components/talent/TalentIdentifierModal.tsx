import React, { useMemo, useRef, useState } from "react";
import {
  FileText,
  Github,
  Globe2,
  GraduationCap,
  Loader2,
  Linkedin,
  Upload,
} from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";
import {
  savePendingTalentCapture,
  type TalentCaptureSource,
  validateTalentCaptureLink,
} from "@/lib/talentCapture/client";

type TalentIdentifierModalProps = {
  open: boolean;
  onClose: () => void;
};

const SOURCE_OPTIONS: Array<{
  value: TalentCaptureSource;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  placeholder?: string;
  helper: string;
}> = [
  {
    value: "resume",
    label: "이력서",
    Icon: FileText,
    helper: "PDF나 문서 파일만 올려도 됩니다.",
  },
  {
    value: "linkedin",
    label: "링크드인",
    Icon: Linkedin,
    placeholder: "https://www.linkedin.com/in/...",
    helper: "가장 빠르게 회원님을 식별할 수 있습니다.",
  },
  {
    value: "github",
    label: "GitHub",
    Icon: Github,
    placeholder: "https://github.com/...",
    helper: "대표 프로필이나 활동 링크를 남겨 주세요.",
  },
  {
    value: "scholar",
    label: "Scholar",
    Icon: GraduationCap,
    placeholder: "https://scholar.google.com/citations?...",
    helper: "Google Scholar 프로필 링크를 남겨 주세요.",
  },
  {
    value: "website",
    label: "개인 사이트",
    Icon: Globe2,
    placeholder: "https://...",
    helper: "개인 사이트, 포트폴리오, 블로그도 괜찮습니다.",
  },
];

const TalentIdentifierModal = ({
  open,
  onClose,
}: TalentIdentifierModalProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedSource, setSelectedSource] =
    useState<TalentCaptureSource>("linkedin");
  const [linkValue, setLinkValue] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedOption = useMemo(
    () => SOURCE_OPTIONS.find((option) => option.value === selectedSource),
    [selectedSource]
  );

  const canContinue =
    selectedSource === "resume"
      ? Boolean(resumeFile)
      : linkValue.trim().length > 0;

  const handleSourceChange = (source: TalentCaptureSource) => {
    setSelectedSource(source);
    setError("");
  };

  const buildRedirectTo = () => {
    const redirectUrl = new URL("/auths/callback", window.location.origin);
    redirectUrl.searchParams.set("flow", "talent_capture");
    redirectUrl.searchParams.set("next", "/career");

    const landingId = localStorage.getItem("harper_landing_id_0209");
    if (landingId) {
      redirectUrl.searchParams.set("lid", landingId);
    }

    const searchParams = new URLSearchParams(window.location.search);
    const countryLang = searchParams.get("cl");
    if (countryLang) {
      redirectUrl.searchParams.set("cl", countryLang);
    }

    const abtestType =
      searchParams.get("ab") ??
      localStorage.getItem("harper_company_abtest_type_2026_02");
    if (abtestType) {
      redirectUrl.searchParams.set("ab", abtestType);
    }

    return redirectUrl.toString();
  };

  const handleGoogleLogin = async (isSignup: boolean = true) => {
    if (isSubmitting) return;

    setError("");
    setIsSubmitting(true);

    try {
      if (isSignup) {
        if (selectedSource === "resume") {
          if (!resumeFile) {
            throw new Error("이력서 파일을 선택해 주세요.");
          }
          await savePendingTalentCapture({
            source: selectedSource,
            resumeFile,
          });
        } else {
          const validation = validateTalentCaptureLink(
            selectedSource,
            linkValue
          );
          if (!validation.ok) {
            throw new Error(validation.error);
          }

          await savePendingTalentCapture({
            source: selectedSource,
            link: validation.normalized,
          });
        }
      }

      const { data, error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: buildRedirectTo(),
        },
      });

      if (signInError) {
        throw signInError;
      }
      if (!data?.url) {
        throw new Error("로그인 URL을 생성하지 못했습니다.");
      }

      onClose();
      window.location.assign(data.url);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Google 로그인에 실패했습니다."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <TalentCareerModal
      open={open}
      onClose={() => {
        if (isSubmitting) return;
        onClose();
      }}
      title="하퍼 시작하기"
      description="아래 중 하나를 알려주시면 바로 시작할 수 있어요."
      panelClassName="max-w-[520px] shadow-[0_24px_72px_rgba(17,24,39,0.18)]"
      headerClassName="border-none px-3 py-4"
      bodyClassName="px-4 py-4 pb-8"
      closeButtonClassName="right-4 top-4 h-8 w-8 rounded-md"
      footer={
        <div className="flex flex-col gap-2">
          {error ? (
            <p className="rounded-md border border-xprimary/30 bg-xprimary/10 px-3 py-2 text-sm text-xprimary">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void handleGoogleLogin()}
            disabled={!canContinue || isSubmitting}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-xprimary px-4 text-sm font-medium text-hblack000 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                로그인 중...
              </>
            ) : (
              "Google 회원가입"
            )}
          </button>
          <div className="w-full bg-hblack50 h-[1px]"></div>
          <button
            type="button"
            onClick={() => void handleGoogleLogin(false)}
            className="inline-flex h-11 w-full items-center justify-center text-hblack800 gap-2 rounded-md bg-hblack50 px-4 text-sm font-medium transition-colors cursor-pointer hover:bg-hblack100"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                로그인 중...
              </>
            ) : (
              "이미 회원가입을 하셨다면(로그인)"
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {SOURCE_OPTIONS.map(({ value, label, Icon }) => {
            const active = selectedSource === value;

            return (
              <button
                key={value}
                aria-label="linkedin"
                type="button"
                onClick={() => handleSourceChange(value)}
                className={cn(
                  "inline-flex h-8 items-center justify-center gap-1.5 px-1.5 text-sm transition-colors",
                  active
                    ? "text-xprimary"
                    : "text-hblack500 hover:text-hblack900"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>

        <div className="">
          {selectedSource === "resume" ? (
            <div className="mt-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.doc,.docx"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setResumeFile(file);
                  setError("");
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-hblack100 bg-hblack50 px-4 text-sm text-hblack700 transition-colors hover:bg-hblack100"
              >
                <Upload className="h-4 w-4" />
                이력서 업로드
              </button>
              <p className="mt-2 text-xs text-hblack500">
                {resumeFile
                  ? `${resumeFile.name}`
                  : "PDF, DOC, DOCX 파일을 업로드할 수 있습니다."}
              </p>
            </div>
          ) : (
            <div className="mt-3">
              <input
                type="url"
                name={`${selectedSource}Url`}
                autoComplete="url"
                value={linkValue}
                onChange={(event) => {
                  setLinkValue(event.target.value);
                  setError("");
                }}
                placeholder={selectedOption?.placeholder}
                className="h-11 w-full rounded-md border border-hblack200 bg-hblack000 px-3 text-sm text-hblack900 outline-none transition-all placeholder:text-hblack400 focus:outline-1 focus:outline-xprimary"
              />
            </div>
          )}
        </div>
      </div>
    </TalentCareerModal>
  );
};

export default TalentIdentifierModal;
