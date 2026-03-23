"use client";
import {
  ArrowRight,
  CornerDownLeft,
  FileText,
  LoaderCircle,
  Upload,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { showToast } from "@/components/toast/toast";
import { useIsMobile } from "@/hooks/useIsMobile";
import { supabase } from "@/lib/supabase";
import { useOnboarding } from "@/hooks/useOnboarding";
import { logger } from "@/utils/logger";
import Image from "next/image";

type ProfileInputType = "cv" | "linkedin" | "scholar" | "website";
const ONBOARDING_LOCAL_ID_KEY = "harper_talent_network_local_id";
const TALENT_NETWORK_CV_BUCKET = "talent-network-cv";
const HARPER_WAITLIST_TYPE_ONBOARDING2 = 2;

const sanitizeFileName = (fileName: string) =>
  fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);

const STEPS = [
  {
    id: 1,
    title: "3개의 질문만 대답해주세요.",
    description: "이름과 연락처를 알려주세요.",
  },
  {
    id: 2,
    title: "이력서 혹은 본인 정보",
    description:
      "아래 정보들 중 편하신 것들을 알려주세요. 혹은 짧게 대화로 알려주셔도 괜찮습니다.",
  },
  {
    id: 3,
    title: "현재 상황",
    description:
      "선호하시는게 있으시다면 무엇이 되었든 자세히 알려주세요. 특정 회사던 혹은 파트타임이던 저희가 최대한 연결되실 수 있게 노력해보겠습니다.",
  },
] as const;

export type WorkExperience = {
  company: string;
  position: string;
  startDate: string;
  endDate: string;
  description: string;
};

export type Education = {
  school: string;
  major: string;
  startDate: string;
  endDate: string;
  degree: string;
  gpa: string;
};

const makeWorkExperience = (): WorkExperience => ({
  company: "",
  position: "",
  startDate: "",
  endDate: "",
  description: "",
});

const makeEducation = (): Education => ({
  school: "",
  major: "",
  startDate: "",
  endDate: "",
  degree: "",
  gpa: "",
});

const BeigeProgressBar = ({
  currentStep,
  totalSteps,
}: {
  currentStep: number;
  totalSteps: number;
}) => {
  const normalizedStep = currentStep < 1 ? currentStep + 1 : currentStep;
  const progress = Math.min(normalizedStep / totalSteps, 1);

  return (
    <div className="flex h-1 w-full flex-row items-center justify-start overflow-hidden bg-beige500/70">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${progress * 100}%` }}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        className="h-full bg-beige900"
      />
      <div className="block h-full w-[3px] bg-white/80" />
    </div>
  );
};

const BeigeTextInput = ({
  label,
  placeholder,
  value,
  rows,
  onChange,
  autoFocus = false,
}: {
  label?: string;
  placeholder: string;
  value: string;
  rows?: number;
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  autoFocus?: boolean;
}) => {
  return (
    <div className="mt-2 flex w-full flex-col group">
      {label && (
        <label className="mb-1 text-sm font-medium tracking-[-0.02em] text-beige900/60">
          {label}
        </label>
      )}
      {rows ? (
        <textarea
          placeholder={placeholder}
          className="w-full border-b border-beige900/20 bg-transparent px-0.5 py-2 text-lg md:text-xl font-normal leading-8 text-beige900 transition-colors duration-200 outline-none placeholder:text-beige900/30 focus:border-beige900"
          value={value}
          onChange={onChange}
          rows={rows}
          autoFocus={autoFocus}
        />
      ) : (
        <input
          placeholder={placeholder}
          className="w-full border-b border-beige900/20 bg-transparent px-0.5 py-2 text-xl font-normal leading-5 text-beige900 transition-colors duration-200 outline-none placeholder:text-beige900/30 focus:border-beige900"
          value={value}
          onChange={onChange}
          autoFocus={autoFocus}
        />
      )}
      <div className="h-[1px] w-full rounded-full bg-white/0 transition-colors duration-200 group-focus-within:bg-beige900" />
    </div>
  );
};

const BeigeLinkInput = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string | React.ReactNode;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
}) => {
  return (
    <div className="flex w-full flex-row items-center justify-between">
      <div className="w-1/4 text-[15px] font-medium text-beige900/60">
        {label}
      </div>
      <input
        placeholder={placeholder}
        className="h-[36px] w-full rounded-[8px] border border-beige900/15 bg-white/60 px-3 py-2 text-[14px] font-light leading-5 text-beige900 outline-none transition focus:ring-1 focus:ring-beige900/30 placeholder:text-beige900/30"
        value={value}
        onChange={onChange}
      />
    </div>
  );
};

const ProfileOptionButton = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-lg border px-4 py-2 text-sm font-medium tracking-[-0.02em] transition ${
      active
        ? "border-beige900 bg-beige900 text-beige100"
        : "bg-beige500 border-beige500 text-beige900/70 hover:bg-beige500/90"
    }`}
  >
    {label}
  </button>
);

const BeigeFileUploadInput = ({
  fileName,
  onChange,
}: {
  fileName: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) => {
  return (
    <label
      className={`
cursor-pointer flex flex-col items-center justify-center gap-2
w-full py-12 px-4
border rounded-[6px]
${
  fileName
    ? "border-[1.6px] border-beige900 bg-white hover:bg-beige500/90"
    : "border-dashed border-beige900/50 bg-beige500/50 hover:bg-beige500/60 "
}
`}
    >
      <div className="flex-wrap w-fit p-3 bg-white rounded-full border border-xgray300">
        {fileName ? (
          <FileText size={20} strokeWidth={1.6} />
        ) : (
          <Upload size={20} strokeWidth={1.6} />
        )}
      </div>

      <div className="text-base font-medium mt-1">
        {fileName ? fileName : "Click to upload Resume (PDF, DOC, DOCS)"}
      </div>

      <div className="text-sm font-normal text-black/80 text-center">
        권장 파일 형식은 PDF이며, 최대 용량은 10MB입니다.
      </div>
      <input
        type="file"
        accept=".pdf,.doc,.docx,.rtf"
        className="hidden"
        onChange={onChange}
      />
    </label>
  );
};

export const Onboarding2Content = () => {
  const isMobile = useIsMobile();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedProfileInputs, setSelectedProfileInputs] = useState<
    ProfileInputType[]
  >([]);
  const [linkedin, setLinkedin] = useState("");
  const [scholar, setScholar] = useState("");
  const [website, setWebsite] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvFileName, setCvFileName] = useState("");
  const [currentSituation, setCurrentSituation] = useState("");
  const [submissionPending, setSubmissionPending] = useState(false);
  const [landingId, setLandingId] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  const onSave = useCallback(() => {
    if (!isDirty) return;
    logger.log("onboard draft updated", {
      name,
      email,
      phone,
      selectedProfileInputs,
      profileValues: {
        cv: cvFileName || null,
        linkedin: linkedin || null,
        scholar: scholar || null,
        website: website || null,
      },
      currentSituation,
    });
    setIsDirty(false);
  }, [
    cvFileName,
    currentSituation,
    email,
    isDirty,
    linkedin,
    name,
    phone,
    scholar,
    selectedProfileInputs,
    website,
  ]);

  const { step, submitLoading, handleNext, handlePrev, isNextRef, setStep } =
    useOnboarding({
      save: onSave,
      totalSteps: STEPS.length,
    });

  useEffect(() => {
    const savedId = localStorage.getItem(ONBOARDING_LOCAL_ID_KEY);
    if (savedId) {
      setLandingId(savedId);
      return;
    }

    const nextId =
      window.crypto?.randomUUID?.() ??
      `network_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(ONBOARDING_LOCAL_ID_KEY, nextId);
    setLandingId(nextId);
  }, []);

  const handleProfileOptionChange = (option: ProfileInputType) => {
    setIsDirty(true);
    setSelectedProfileInputs((prev) =>
      prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option]
    );
  };

  const handleSubmitOnboarding = useCallback(async () => {
    if (submissionPending) return;

    const trimmedName = name.trim();
    const trimmedContact = email.trim();
    const trimmedSituation = currentSituation.trim();
    const trimmedLinkedin = linkedin.trim();
    const trimmedScholar = scholar.trim();
    const trimmedWebsite = website.trim();

    if (!trimmedName) {
      showToast({ message: "이름을 입력해주세요.", variant: "white" });
      return;
    }

    if (!trimmedContact) {
      showToast({
        message: "이메일 혹은 전화번호를 입력해주세요.",
        variant: "white",
      });
      return;
    }

    if (selectedProfileInputs.length === 0) {
      showToast({
        message: "하나 이상의 정보를 선택해주세요.",
        variant: "white",
      });
      return;
    }

    if (selectedProfileInputs.includes("cv") && !cvFile) {
      showToast({ message: "CV 파일을 업로드해주세요.", variant: "white" });
      return;
    }

    if (selectedProfileInputs.includes("linkedin") && !trimmedLinkedin) {
      showToast({
        message: "LinkedIn 링크를 입력해주세요.",
        variant: "white",
      });
      return;
    }

    if (selectedProfileInputs.includes("scholar") && !trimmedScholar) {
      showToast({
        message: "Scholar 링크를 입력해주세요.",
        variant: "white",
      });
      return;
    }

    if (selectedProfileInputs.includes("website") && !trimmedWebsite) {
      showToast({
        message: "개인 웹사이트 링크를 입력해주세요.",
        variant: "white",
      });
      return;
    }

    setSubmissionPending(true);

    try {
      let uploadedStoragePath: string | null = null;

      if (selectedProfileInputs.includes("cv") && cvFile) {
        const safeName = sanitizeFileName(cvFile.name || "resume");
        const nextLandingId =
          landingId ||
          window.crypto?.randomUUID?.() ||
          `network_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const storagePath = `${nextLandingId}/${Date.now()}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from(TALENT_NETWORK_CV_BUCKET)
          .upload(storagePath, cvFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: cvFile.type || "application/octet-stream",
          });

        if (uploadError) {
          throw new Error(
            uploadError.message || "CV 파일 업로드에 실패했습니다."
          );
        }

        uploadedStoragePath = storagePath;
      }

      const detailPayload = {
        source: "onboarding2",
        profile_input_types: selectedProfileInputs,
        linkedin: trimmedLinkedin || null,
        scholar: trimmedScholar || null,
        website: trimmedWebsite || null,
        cv_file_name: cvFileName || cvFile?.name || null,
        cv_storage_bucket: uploadedStoragePath
          ? TALENT_NETWORK_CV_BUCKET
          : null,
        cv_storage_path: uploadedStoragePath,
        current_situation: trimmedSituation || null,
        submitted_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabase
        .from("harper_waitlist")
        .insert({
          name: trimmedName,
          email: trimmedContact,
          local_id: landingId || null,
          type: HARPER_WAITLIST_TYPE_ONBOARDING2,
          is_mobile: isMobile,
          url:
            uploadedStoragePath ||
            trimmedLinkedin ||
            trimmedScholar ||
            trimmedWebsite ||
            null,
          text: JSON.stringify(detailPayload),
        });

      if (insertError) {
        throw new Error(insertError.message || "제출에 실패했습니다.");
      }

      setIsDirty(false);
      showToast({ message: "제출이 완료되었습니다.", variant: "white" });
      setStep(STEPS.length);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "제출 중 오류가 발생했습니다.";
      console.error("onboarding2 submit error:", error);
      showToast({ message, variant: "error" });
    } finally {
      setSubmissionPending(false);
    }
  }, [
    cvFile,
    cvFileName,
    currentSituation,
    email,
    isMobile,
    landingId,
    linkedin,
    name,
    scholar,
    selectedProfileInputs,
    setStep,
    submissionPending,
    website,
  ]);

  const handlePrimaryAction = useCallback(() => {
    if (step === STEPS.length - 1) {
      void handleSubmitOnboarding();
      return;
    }

    handleNext();
  }, [handleNext, handleSubmitOnboarding, step]);

  const slideVariants = {
    enter: (isNext: boolean) => ({
      opacity: 0,
      y: isNext ? 40 : -40,
    }),
    center: {
      opacity: 1,
      y: 0,
    },
    exit: (isNext: boolean) => ({
      opacity: 0,
      y: isNext ? -40 : 40,
    }),
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-start bg-beige200 px-0 pt-4 font-geist text-beige900 md:justify-center md:pt-0">
      <div className="fixed left-0 top-0 z-20 w-full">
        <BeigeProgressBar currentStep={step + 1} totalSteps={STEPS.length} />
      </div>

      {step === STEPS.length ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-4 text-center">
          <div className="text-2xl font-normal">
            Harper에 오신걸 환영합니다.
          </div>
          <div className="text-lg font-normal text-beige900/55">
            저희는 모든 분들을 최대한 직접 관리하고,
            <br />
            선호하시는 기회에 연결되실 수 있게 노력하고 있습니다.
          </div>
          <button className="mt-8 h-11 rounded-[10px] bg-beige900 px-4 text-lg font-medium text-beige100 hover:opacity-90">
            돌아가기
          </button>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-start justify-center px-4 pb-20 pt-4 md:flex-row md:pt-8 md:pb-28">
          <div className="hidden h-full min-w-16 items-start justify-center pt-1 md:flex">
            <div className="flex flex-row items-center gap-1 font-light text-beige900/55">
              {step + 1}/3 <ArrowRight size={16} strokeWidth={2} />
            </div>
          </div>
          <div className="mb-4 flex h-6 w-6 items-center justify-center rounded-md text-sm text-beige900 md:hidden">
            {step + 1}/3
          </div>

          <div className="flex w-full max-w-[800px] flex-col gap-4">
            <AnimatePresence mode="wait" custom={isNextRef.current}>
              <motion.div
                key={step}
                initial="enter"
                animate="center"
                exit="exit"
                variants={slideVariants}
                custom={isNextRef.current}
                transition={{ duration: 0.35, ease: "easeInOut" }}
                className="flex flex-col gap-4"
              >
                {step < STEPS.length && STEPS[step].title ? (
                  <div className="flex text-xl font-normal md:text-2xl">
                    {step === 1 && name && `${name}님, 반갑습니다.`}
                    {STEPS[step].title}
                  </div>
                ) : null}
                {step < STEPS.length && STEPS[step].description ? (
                  <div className="mb-4 text-base md:text-xl font-normal text-beige900/55">
                    {STEPS[step].description}
                  </div>
                ) : null}

                {step === 0 && (
                  <>
                    <BeigeTextInput
                      autoFocus
                      label="이름"
                      placeholder="이름"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                    <BeigeTextInput
                      label="이메일 혹은 전화번호"
                      placeholder="example@gmail.com / 010-0000-0000"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                  </>
                )}

                {step === 1 && (
                  <div className="flex flex-col gap-4 mb-8">
                    <div className="flex flex-wrap gap-2 mb-2">
                      <ProfileOptionButton
                        label="CV/Resume"
                        active={selectedProfileInputs.includes("cv")}
                        onClick={() => handleProfileOptionChange("cv")}
                      />
                      <ProfileOptionButton
                        label="Linkedin"
                        active={selectedProfileInputs.includes("linkedin")}
                        onClick={() => handleProfileOptionChange("linkedin")}
                      />
                      <ProfileOptionButton
                        label="Scholar"
                        active={selectedProfileInputs.includes("scholar")}
                        onClick={() => handleProfileOptionChange("scholar")}
                      />
                      <ProfileOptionButton
                        label="개인 웹사이트"
                        active={selectedProfileInputs.includes("website")}
                        onClick={() => handleProfileOptionChange("website")}
                      />
                    </div>

                    {selectedProfileInputs.includes("cv") && (
                      <BeigeFileUploadInput
                        fileName={cvFileName}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          setCvFile(file ?? null);
                          setCvFileName(file?.name || "");
                          setIsDirty(true);
                        }}
                      />
                    )}

                    {selectedProfileInputs.includes("linkedin") && (
                      <BeigeLinkInput
                        label={
                          <div className="flex flex-row items-center gap-1">
                            <Image
                              src="/images/logos/linkedin.svg"
                              alt="LinkedIn"
                              width={20}
                              height={20}
                            />
                            <div>Linkedin</div>
                          </div>
                        }
                        value={linkedin}
                        onChange={(e) => {
                          setLinkedin(e.target.value);
                          setIsDirty(true);
                        }}
                        placeholder="https://linkedin.com/in/username"
                      />
                    )}

                    {selectedProfileInputs.includes("scholar") && (
                      <BeigeLinkInput
                        label={
                          <div className="flex flex-row items-center gap-1">
                            <Image
                              src="/images/logos/scholar.png"
                              alt="Google Scholar"
                              width={16}
                              height={16}
                            />
                            <div>Google Scholar</div>
                          </div>
                        }
                        value={scholar}
                        onChange={(e) => {
                          setScholar(e.target.value);
                          setIsDirty(true);
                        }}
                        placeholder="https://scholar.google.com/citations?user="
                      />
                    )}

                    {selectedProfileInputs.includes("website") && (
                      <BeigeLinkInput
                        label="개인 웹사이트"
                        value={website}
                        onChange={(e) => {
                          setWebsite(e.target.value);
                          setIsDirty(true);
                        }}
                        placeholder="https://"
                      />
                    )}
                  </div>
                )}

                {step === 2 && (
                  <BeigeTextInput
                    autoFocus
                    label="자세히 알려주세요"
                    placeholder="예: 특정 회사, 리모트, 파트타임, 연봉, 산업, 비자, 근무 형태 등 어떤 것이든 괜찮습니다."
                    value={currentSituation}
                    onChange={(e) => {
                      setCurrentSituation(e.target.value);
                      setIsDirty(true);
                    }}
                    rows={6}
                  />
                )}

                <div className="mt-4 flex flex-row items-center gap-3">
                  <button
                    onClick={handlePrimaryAction}
                    className="h-11 cursor-pointer rounded-lg bg-beige900 px-4 text-lg font-medium text-beige100 shadow-lg transition-all duration-200 hover:opacity-90"
                  >
                    {submitLoading || submissionPending ? (
                      <span className="animate-spin">
                        <LoaderCircle className="h-6 w-6 animate-spin text-beige100" />
                      </span>
                    ) : step === STEPS.length - 1 ? (
                      "Submit"
                    ) : (
                      "Next"
                    )}
                  </button>

                  <span className="flex flex-row items-center gap-1 text-[14px] font-light">
                    <span className="text-beige900/45">press</span>
                    <span className="font-medium text-beige900">Enter</span>
                    <CornerDownLeft size={14} strokeWidth={2} />
                  </span>
                </div>

                {step === 1 && (
                  <div className="mt-2 text-beige900/60">
                    현재 Harper에서는{" "}
                    <span className="text-beige900">
                      미국 유니콘 AI 스타트업
                    </span>
                    ,{" "}
                    <span className="text-beige900">
                      국내 유니콘 테크 스타트업
                    </span>
                    ,{" "}
                    <span className="text-beige900">
                      실리콘 밸리 탑 VC-backed 스타트업
                    </span>{" "}
                    <br />외 여러 회사가 인재를 찾고 있습니다.
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="fixed bottom-4 left-4 flex flex-row items-center gap-2 text-sm text-beige900/45">
            <button
              type="button"
              className="underline hover:text-beige900"
              onClick={handlePrev}
            >
              Back
            </button>
            <button
              type="button"
              className="underline hover:text-beige900"
              onClick={handlePrimaryAction}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

const Onboarding2Page = () => {
  useEffect(() => {
    document.documentElement.classList.add("noneoverscroll");
    return () => {
      document.documentElement.classList.remove("noneoverscroll");
    };
  }, []);

  return <Onboarding2Content />;
};

export default Onboarding2Page;
