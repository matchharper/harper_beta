"use client";
import {
  ArrowRight,
  ArrowUpRight,
  CornerDownLeft,
  FileText,
  LoaderCircle,
  Shield,
  Upload,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { showToast } from "@/components/toast/toast";
import { useCountryLang } from "@/hooks/useCountryLang";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  TALENT_NETWORK_ABTEST_TYPE_KEY,
  TALENT_NETWORK_LOCAL_ID_KEY,
  TALENT_NETWORK_SUBMIT_COMPLETED_EVENT,
  createTalentNetworkLocalId,
  getTalentNetworkOnboardingStepEventType,
  resolveTalentNetworkAssignmentType,
  type TalentNetworkAssignmentType,
} from "@/lib/talentNetwork";
import { notifyToSlack } from "@/lib/slack";
import { supabase } from "@/lib/supabase";
import { useOnboarding } from "@/hooks/useOnboarding";
import { logger } from "@/utils/logger";
import Image from "next/image";
import { useRouter } from "next/router";

const TALENT_NETWORK_CV_BUCKET = "talent-network-cv";
const HARPER_WAITLIST_TYPE_ONBOARDING2 = 2;
type ProfileInputType = "linkedin" | "github" | "scholar" | "website" | "cv";

const sanitizeFileName = (fileName: string) =>
  fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);

const QUESTION_STEP_COUNT = 5;
const TOTAL_STEPS = QUESTION_STEP_COUNT + 2;

const ENGAGEMENT_OPTIONS = [
  {
    id: "full_time",
    label: "Full-time Role",
    description: "현재 지원한 포지션 포함",
  },
  {
    id: "fractional",
    label: "Fractional / Part-time",
    description: "현업 유지하며 핵심 프로젝트만 참여",
  },
  {
    id: "advisor",
    label: "Technical Advisor",
    description: "전략적/기술적 자문 중심",
  },
] as const;

const LOCATION_OPTIONS = [
  {
    id: "korea_based",
    label: "Korea-based Teams",
    description: "한국 진출 글로벌 팀 또는 국내 유니콘",
  },
  {
    id: "global_remote",
    label: "US/Global Remote",
    description: "한국에 머물며 해외 팀과 원격 근무",
  },
  {
    id: "relocation",
    label: "Relocation to US/Global",
    description: "비자 스폰서십 및 relocation 지원 시",
  },
] as const;

const CAREER_MOVE_INTENT_OPTIONS = [
  {
    id: "ready_to_move",
    label: "좋은 기회라면 바로 이직 의향 있음",
  },
  {
    id: "open_to_explore",
    label: "아직 이직 생각은 없지만, 기회를 받아보고 결정하고 싶음",
  },
  {
    id: "advisor_or_part_time_only",
    label: "이직 생각 없고, 파트타임이나 advisor만 할 의향 있음",
  },
] as const;

type EngagementOptionId = (typeof ENGAGEMENT_OPTIONS)[number]["id"];
type LocationOptionId = (typeof LOCATION_OPTIONS)[number]["id"];
type CareerMoveIntentOptionId =
  (typeof CAREER_MOVE_INTENT_OPTIONS)[number]["id"];

const getDreamTeamsLeadCopy = (selectedLocations: LocationOptionId[]) => {
  const hasKoreaBased = selectedLocations.includes("korea_based");
  const hasGlobalRemote = selectedLocations.includes("global_remote");
  const hasRelocation = selectedLocations.includes("relocation");

  if (!selectedLocations.length) {
    return "방금 지원하신 포지션 외에, 평소 눈여겨보던 타겟 기업이 있다면 자유롭게 적어주세요.";
  }

  if (hasKoreaBased && !hasGlobalRemote && !hasRelocation) {
    return "한국에서 환경을 선호하시는군요, 평소 눈여겨보던 타겟 기업이 있다면 자유롭게 적어주세요.";
  }

  if (!hasKoreaBased && hasGlobalRemote && !hasRelocation) {
    return "한국에 머물며 원격으로 함께해보고 싶은 미국/글로벌 팀이 있다면 자유롭게 적어주세요.";
  }

  if (!hasKoreaBased && !hasGlobalRemote && hasRelocation) {
    return "미국/글로벌 relocation까지 고려해서, 눈여겨보던 타겟 기업이 있다면 자유롭게 적어주세요.";
  }

  if (hasKoreaBased && (hasGlobalRemote || hasRelocation)) {
    return "한국 기반 팀부터 미국/글로벌 팀까지, 평소 눈여겨보던 타겟 기업이 있다면 자유롭게 적어주세요.";
  }

  return "미국/글로벌 팀 중 원격 또는 relocation으로 고려 중인 타겟 기업이 있다면 자유롭게 적어주세요.";
};

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

const BeigeProgressBar = ({
  currentStep,
  totalSteps,
}: {
  currentStep: number;
  totalSteps: number;
}) => {
  const progress = totalSteps === 0 ? 0 : Math.min(currentStep / totalSteps, 1);

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
  isLineClamp = false,
}: {
  label: string | React.ReactNode;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  isLineClamp?: boolean;
}) => {
  return (
    <div
      className={`flex w-full flex-col gap-2 md:justify-between ${isLineClamp ? "md:flex-col md:items-start" : "md:flex-row md:items-center"}`}
    >
      <div
        className={`w-full text-[15px] font-medium text-beige900/60 ${isLineClamp ? "md:w-1/2" : "md:w-1/4"}`}
      >
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

const ProfileInputToggleButton = ({
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

const SelectionCardButton = ({
  optionNumber,
  label,
  description,
  active,
  onClick,
}: {
  optionNumber?: number;
  label: string;
  description?: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex min-h-[74px] hover:bg-beige900/20 hover:border-beige900/60 active:border-beige900/80 w-full flex-col items-start justify-start rounded-md px-3 py-2.5 text-left tracking-[-0.02em] border-2 transition duration-300 ${
      active
        ? "border-beige900/80 bg-beige500 text-black"
        : "border-beige900/10 bg-beige100 text-black hover:bg-beige500/50"
    }`}
  >
    <div className="flex w-full items-start gap-3">
      {typeof optionNumber === "number" && (
        <span
          className={`mt-1 hidden md:inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border text-xs font-medium ${
            active
              ? "border-beige900 bg-beige900 text-beige100"
              : "border-black/10 bg-white text-beige900"
          }`}
        >
          {optionNumber}
        </span>
      )}
      <div className="flex min-w-0 flex-col">
        <span
          className={`${description ? "text-base" : "text-sm"} font-normal`}
        >
          {label}
        </span>
        {description && (
          <span
            className={`mt-1 text-sm leading-5 text-beige900/60 ${active ? "font-medium" : "font-normal"}`}
          >
            {description}
          </span>
        )}
      </div>
    </div>
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
        {fileName ? fileName : "Upload Resume/CV in PDF (Optional)"}
      </div>

      <div className="text-sm font-normal text-black/80 text-center">
        PDF only. 최대 용량은 10MB입니다.
      </div>
      <input type="file" accept=".pdf" className="hidden" onChange={onChange} />
    </label>
  );
};

export const Onboarding2Content = ({
  selectedRole,
  onDone,
}: {
  selectedRole?: string;
  onDone?: () => void;
}) => {
  const router = useRouter();
  const isMobile = useIsMobile();
  const countryLang = useCountryLang();
  const queryRole =
    typeof router.query.role === "string" ? router.query.role : "";
  const selectedRoleLabel = selectedRole || queryRole || "Talent Network";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [website, setWebsite] = useState("");
  const [selectedProfileInputs, setSelectedProfileInputs] = useState<
    ProfileInputType[]
  >(["linkedin"]);
  const [github, setGithub] = useState("");
  const [scholar, setScholar] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvFileName, setCvFileName] = useState("");
  const [impactSummary, setImpactSummary] = useState("");
  const [selectedEngagements, setSelectedEngagements] = useState<
    EngagementOptionId[]
  >([]);
  const [selectedLocations, setSelectedLocations] = useState<
    LocationOptionId[]
  >([]);
  const [selectedCareerMoveIntent, setSelectedCareerMoveIntent] = useState<
    CareerMoveIntentOptionId | ""
  >("");
  const [dreamTeams, setDreamTeams] = useState("");
  const [submissionPending, setSubmissionPending] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [landingId, setLandingId] = useState("");
  const [abtestType, setAbtestType] =
    useState<TalentNetworkAssignmentType | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const onSave = useCallback(() => {
    if (!isDirty) return;
    logger.log("onboard draft updated", {
      selectedRole: selectedRoleLabel,
      name,
      email,
      profileValues: {
        cv: cvFileName || null,
        linkedin: linkedin || null,
        website: website || null,
        github: github || null,
        scholar: scholar || null,
      },
      selectedProfileInputs,
      impactSummary,
      selectedEngagements,
      selectedLocations,
      selectedCareerMoveIntent,
      dreamTeams,
    });
    setIsDirty(false);
  }, [
    cvFileName,
    dreamTeams,
    email,
    github,
    impactSummary,
    isDirty,
    linkedin,
    name,
    scholar,
    website,
    selectedProfileInputs,
    selectedEngagements,
    selectedLocations,
    selectedCareerMoveIntent,
    selectedRoleLabel,
  ]);

  const validateStep = useCallback(
    (currentStep: number) => {
      if (currentStep === 1) {
        if (!name.trim()) {
          showToast({ message: "이름을 입력해주세요.", variant: "white" });
          return false;
        }

        if (!email.trim()) {
          showToast({ message: "이메일을 입력해주세요.", variant: "white" });
          return false;
        }
      }

      if (currentStep === 3 && !selectedCareerMoveIntent) {
        showToast({
          message: "현재 이직 의사를 선택해주세요.",
          variant: "white",
        });
        return false;
      }

      return true;
    },
    [email, name, selectedCareerMoveIntent]
  );

  const addLandingLog = useCallback(
    async (
      type: string,
      overrides?: {
        localId?: string;
        abtestType?: string | null;
      }
    ) => {
      const resolvedLocalId = overrides?.localId || landingId;
      const resolvedAbtestType = overrides?.abtestType || abtestType;
      if (!resolvedLocalId || !resolvedAbtestType) return;

      try {
        await supabase.from("landing_logs").insert({
          local_id: resolvedLocalId,
          type,
          abtest_type: resolvedAbtestType,
          is_mobile: isMobile,
          country_lang: countryLang,
        });
      } catch (error) {
        console.error("talent network landing log error:", error);
      }
    },
    [abtestType, countryLang, isMobile, landingId]
  );

  useEffect(() => {
    const savedId = localStorage.getItem(TALENT_NETWORK_LOCAL_ID_KEY);
    if (savedId) {
      setLandingId(savedId);
    } else {
      const nextId = createTalentNetworkLocalId();
      localStorage.setItem(TALENT_NETWORK_LOCAL_ID_KEY, nextId);
      setLandingId(nextId);
    }

    const savedAbtestType = localStorage.getItem(
      TALENT_NETWORK_ABTEST_TYPE_KEY
    );
    const resolvedAbtestType =
      resolveTalentNetworkAssignmentType(savedAbtestType);

    if (savedAbtestType !== resolvedAbtestType) {
      localStorage.setItem(TALENT_NETWORK_ABTEST_TYPE_KEY, resolvedAbtestType);
    }

    setAbtestType(resolvedAbtestType);

    if (savedId && savedAbtestType !== resolvedAbtestType) {
      void addLandingLog("new_session", {
        localId: savedId,
        abtestType: resolvedAbtestType,
      });
    }
  }, [addLandingLog]);

  const handleProfileInputChange = (option: ProfileInputType) => {
    setIsDirty(true);
    setSelectedProfileInputs((prev) =>
      prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option]
    );
  };

  const handleEngagementToggle = useCallback((option: EngagementOptionId) => {
    setIsDirty(true);
    setSelectedEngagements((prev) =>
      prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option]
    );
  }, []);

  const handleLocationToggle = useCallback((option: LocationOptionId) => {
    setIsDirty(true);
    setSelectedLocations((prev) =>
      prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option]
    );
  }, []);

  const handleCareerMoveIntentSelect = useCallback(
    (option: CareerMoveIntentOptionId) => {
      setIsDirty(true);
      setSelectedCareerMoveIntent(option);
    },
    []
  );

  async function handleSubmitOnboarding() {
    if (submissionPending) return;

    const hasLinkedin = selectedProfileInputs.includes("linkedin");
    const hasGithub = selectedProfileInputs.includes("github");
    const hasScholar = selectedProfileInputs.includes("scholar");
    const hasWebsite = selectedProfileInputs.includes("website");
    const hasCv = selectedProfileInputs.includes("cv");
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedLinkedin = linkedin.trim();
    const trimmedWebsite = website.trim();
    const trimmedGithub = github.trim();
    const trimmedScholar = scholar.trim();
    const trimmedImpactSummary = impactSummary.trim();
    const trimmedDreamTeams = dreamTeams.trim();
    const resolvedLandingId =
      landingId ||
      localStorage.getItem(TALENT_NETWORK_LOCAL_ID_KEY) ||
      createTalentNetworkLocalId();
    const savedAbtestType = localStorage.getItem(
      TALENT_NETWORK_ABTEST_TYPE_KEY
    );
    const resolvedAbtestType =
      abtestType || resolveTalentNetworkAssignmentType(savedAbtestType);
    const selectedEngagementLabels = ENGAGEMENT_OPTIONS.filter((option) =>
      selectedEngagements.includes(option.id)
    ).map((option) => option.label);
    const selectedLocationLabels = LOCATION_OPTIONS.filter((option) =>
      selectedLocations.includes(option.id)
    ).map((option) => option.label);
    const selectedCareerMoveIntentLabel =
      CAREER_MOVE_INTENT_OPTIONS.find(
        (option) => option.id === selectedCareerMoveIntent
      )?.label || null;

    localStorage.setItem(TALENT_NETWORK_LOCAL_ID_KEY, resolvedLandingId);
    localStorage.setItem(TALENT_NETWORK_ABTEST_TYPE_KEY, resolvedAbtestType);
    if (!landingId) {
      setLandingId(resolvedLandingId);
    }
    if (!abtestType) {
      setAbtestType(resolvedAbtestType);
    }

    setSubmissionPending(true);

    try {
      let uploadedStoragePath: string | null = null;

      if (hasCv && cvFile) {
        const safeName = sanitizeFileName(cvFile.name || "resume");
        const storagePath = `${resolvedLandingId}/${Date.now()}_${safeName}`;

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
        selected_role: selectedRoleLabel,
        profile_input_types: selectedProfileInputs,
        linkedin_profile_url: hasLinkedin ? trimmedLinkedin || null : null,
        personal_website_url: hasWebsite ? trimmedWebsite || null : null,
        github_profile_url: hasGithub ? trimmedGithub || null : null,
        scholar_profile_url: hasScholar ? trimmedScholar || null : null,
        cv_file_name: hasCv ? cvFileName || cvFile?.name || null : null,
        cv_storage_bucket: uploadedStoragePath
          ? TALENT_NETWORK_CV_BUCKET
          : null,
        cv_storage_path: uploadedStoragePath,
        impact_summary: trimmedImpactSummary || null,
        engagement_types: selectedEngagements,
        preferred_locations: selectedLocations,
        career_move_intent: selectedCareerMoveIntent || null,
        career_move_intent_label: selectedCareerMoveIntentLabel,
        dream_teams: trimmedDreamTeams || null,
        submitted_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabase
        .from("harper_waitlist")
        .insert({
          name: trimmedName,
          email: trimmedEmail,
          local_id: resolvedLandingId,
          type: HARPER_WAITLIST_TYPE_ONBOARDING2,
          is_mobile: isMobile,
          url:
            (hasLinkedin ? trimmedLinkedin : "") ||
            (hasWebsite ? trimmedWebsite : "") ||
            (hasGithub ? trimmedGithub : "") ||
            (hasScholar ? trimmedScholar : "") ||
            uploadedStoragePath ||
            null,
          text: JSON.stringify(detailPayload),
        });

      if (insertError) {
        throw new Error(insertError.message || "제출에 실패했습니다.");
      }

      await addLandingLog(TALENT_NETWORK_SUBMIT_COMPLETED_EVENT, {
        localId: resolvedLandingId,
        abtestType: resolvedAbtestType,
      });

      try {
        await notifyToSlack(`📝 *Talent Network Match Initiated*

• *Role*: ${selectedRoleLabel || "N/A"}
• *Name*: ${trimmedName || "N/A"}
• *Email*: ${trimmedEmail || "N/A"}
• *LinkedIn*: ${hasLinkedin ? trimmedLinkedin || "N/A" : "Not provided"}
• *Personal Website*: ${hasWebsite ? trimmedWebsite || "N/A" : "Not provided"}
• *GitHub / Hugging Face*: ${
          hasGithub ? trimmedGithub || "N/A" : "Not provided"
        }
• *Google Scholar*: ${hasScholar ? trimmedScholar || "N/A" : "Not provided"}
• *CV*: ${
          hasCv
            ? cvFileName || cvFile?.name || uploadedStoragePath || "N/A"
            : "Not provided"
        }
• *Impact*: ${trimmedImpactSummary || "N/A"}
• *Engagement Types*: ${
          selectedEngagementLabels.length > 0
            ? selectedEngagementLabels.join(", ")
            : "N/A"
        }
• *Preferred Locations*: ${
          selectedLocationLabels.length > 0
            ? selectedLocationLabels.join(", ")
            : "N/A"
        }
• *Career Move Intent*: ${selectedCareerMoveIntentLabel || "N/A"}
• *Dream Teams*: ${trimmedDreamTeams || "N/A"}
• *Landing ID*: ${resolvedLandingId}
• *Time(Standard Korea Time)*: ${new Date().toLocaleString("ko-KR")}`);
      } catch (notifyError) {
        console.error("talent network slack notify error:", notifyError);
      }

      setIsDirty(false);
      setIsSubmitted(true);
      showToast({ message: "제출이 완료되었습니다.", variant: "white" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "제출 중 오류가 발생했습니다.";
      console.error("onboarding2 submit error:", error);
      showToast({ message, variant: "error" });
    } finally {
      setSubmissionPending(false);
    }
  }

  const { step, submitLoading, handleNext, handlePrev, isNextRef } =
    useOnboarding({
      save: onSave,
      totalSteps: TOTAL_STEPS,
      beforeNext: validateStep,
      onComplete: () => void handleSubmitOnboarding(),
      enableWheelNavigation: false,
      allowTextareaEnterSubmit: true,
    });

  const handlePrimaryAction = useCallback(() => {
    handleNext();
  }, [handleNext]);

  const questionProgressStep =
    step === 0 ? 0 : Math.min(step, QUESTION_STEP_COUNT);
  const stepIndicatorLabel =
    step === 0 ? "Start" : `${questionProgressStep}/${QUESTION_STEP_COUNT}`;
  const dreamTeamsLeadCopy = getDreamTeamsLeadCopy(selectedLocations);
  const isTextareaStep = step === 2 || step === 5;

  useEffect(() => {
    if (!landingId || !abtestType) return;

    const eventType = getTalentNetworkOnboardingStepEventType(step);
    if (!eventType) return;

    void addLandingLog(eventType);
  }, [abtestType, addLandingLog, landingId, step]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      if (!/^[1-9]$/.test(e.key)) return;

      const optionIndex = Number(e.key) - 1;

      if (step === 3) {
        const option = ENGAGEMENT_OPTIONS[optionIndex];
        if (option) {
          e.preventDefault();
          handleEngagementToggle(option.id);
          return;
        }

        const careerMoveOption =
          CAREER_MOVE_INTENT_OPTIONS[optionIndex - ENGAGEMENT_OPTIONS.length];
        if (!careerMoveOption) return;

        e.preventDefault();
        handleCareerMoveIntentSelect(careerMoveOption.id);
        return;
      }

      if (step === 4) {
        const option = LOCATION_OPTIONS[optionIndex];
        if (!option) return;

        e.preventDefault();
        handleLocationToggle(option.id);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    handleCareerMoveIntentSelect,
    handleEngagementToggle,
    handleLocationToggle,
    step,
  ]);

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
    <main className="flex min-h-[100dvh] pt-4 w-full flex-col items-center justify-start overflow-y-auto scrollbar-none bg-beige100 px-0 font-geist text-beige900">
      <div className="fixed left-0 top-0 z-20 w-full">
        <BeigeProgressBar
          currentStep={questionProgressStep}
          totalSteps={QUESTION_STEP_COUNT}
        />
      </div>

      {isSubmitted ? (
        <div className="flex h-full w-full max-w-[800px] flex-col items-center justify-center gap-4 px-4 text-center md:pt-[24vh]">
          <div className="text-2xl font-semibold">Match Initiated.</div>
          <div className="text-lg font-normal text-beige900/55">
            Your technical footprint is now securely in the Harper Matching
            Engine. We are actively scanning our private network of AI unicorns
            and stealth startups for your best fit.
            <br />
            <br />
            매칭 프로세스가 시작되었습니다. 최적의 포지션과 연결이 확정되면,
            영업일 기준 48시간 이내에 기재해주신 이메일로 프라이빗하게
            연락드리겠습니다. 모든 정보는 철저히 기밀로 유지됩니다.
          </div>
          <button
            type="button"
            onClick={() => {
              if (onDone) {
                onDone();
                return;
              }

              void router.push("/network");
            }}
            className="mt-8 h-11 rounded-[10px] bg-beige900 px-4 text-lg font-medium text-beige100 hover:opacity-90"
          >
            Done
          </button>
        </div>
      ) : (
        <div
          className={`flex h-full w-full max-w-[920px] flex-col items-start justify-start px-4 pb-20 pt-4 md:flex-row ${step === 1 ? "md:pt-[8vh]" : "md:pt-[16vh]"} md:pb-28`}
        >
          <div className="hidden h-full min-w-16 items-start justify-center pt-1 mr-1 md:flex">
            <div className="flex flex-row items-center gap-1 font-light text-beige900/55">
              {stepIndicatorLabel} <ArrowRight size={16} strokeWidth={2} />
            </div>
          </div>
          <div className="mb-4 flex h-6 w-6 items-center justify-center rounded-md text-sm text-beige900 md:hidden">
            {stepIndicatorLabel}
          </div>

          <div className="flex w-full flex-col gap-4">
            <AnimatePresence mode="wait" custom={isNextRef.current}>
              <motion.div
                key={step}
                initial="enter"
                animate="center"
                exit="exit"
                variants={slideVariants}
                custom={isNextRef.current}
                transition={{ duration: 0.35, ease: "easeInOut" }}
                className="flex flex-col gap-4 w-full"
              >
                {step === 0 && (
                  <div className="flex text-xl font-medium md:text-2xl">
                    Global Top-Tier Matching
                  </div>
                )}
                {step === 0 && (
                  <div className="mb-4 text-base md:text-xl font-normal text-beige900/55">
                    Your profile will be securely parsed and matched with
                    confidential roles at Series B+ Unicorns and Stealth
                    Startups.
                    <br />
                    <div className="mt-4 md:mt-1 flex flex-col items-start md:items-center md:flex-row gap-1.5">
                      <Shield className="w-5 h-5" />
                      입력하신 정보는 추천을 위해 내부적으로만 사용되며, 허락
                      없이 절대로 회사 측에 공개되지 않습니다.
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <div className="flex text-xl font-normal md:text-2xl">
                    Initiating Match for: {selectedRoleLabel}
                  </div>
                )}

                {step === 2 && (
                  <div className="flex text-xl font-normal md:text-2xl">
                    Highlight your biggest technical or business impact.
                  </div>
                )}

                {step === 2 && (
                  <div className="mb-4 text-base md:text-xl font-normal text-beige900/55">
                    (Optional) 선택하신 포지션과 관련하여, 가장 자신 있는 성과나
                    다룰 수 있는 핵심 기술을 1~2줄로 짧게 적어주세요.
                  </div>
                )}

                {step === 3 && (
                  <div className="flex text-xl font-normal md:text-2xl">
                    Harper Profile Setup: Engagement Types
                  </div>
                )}

                {step === 3 && (
                  <div className="mb-4 text-base md:text-xl font-normal text-beige900/55">
                    Harper 네트워크에는 정규직 외에도 특정 병목 해결을 위한 주
                    4~12시간의 유연한 프로젝트 의뢰가 자주 들어옵니다. 향후
                    오픈되어 있는 업무 형태를 모두 체크해 주세요.
                  </div>
                )}

                {step === 4 && (
                  <div className="flex text-xl font-normal md:text-2xl">
                    Where do you want to make an impact?
                  </div>
                )}

                {step === 4 && (
                  <div className="mb-4 text-base md:text-xl font-normal text-beige900/55">
                    선호하는 근무 환경을 모두 선택해 주세요.
                  </div>
                )}

                {step === 5 && (
                  <div className="flex text-xl font-normal md:text-2xl">
                    What kind of opportunities are you looking for?
                  </div>
                )}

                {step === 5 && (
                  <div className="mb-4 text-base md:text-xl font-normal text-beige900/55">
                    {dreamTeamsLeadCopy} Harper의 파트너 네트워크를 통해
                    프라이빗한 연결을 적극적으로 탐색해 드립니다.
                    <br />
                    <div className="mt-2">
                      혹은 특정 회사와 무관하게 어떤 기회를 찾거나 선호하시는지
                      편하게 전부 알려주세요.
                    </div>
                  </div>
                )}

                {step === 6 && (
                  <div className="flex text-xl font-normal md:text-2xl">
                    Ready to match?
                  </div>
                )}

                {step === 6 && (
                  <div className="mb-4 text-base md:text-xl font-normal text-beige900/55">
                    Harper will now initiate a private scan across its network
                    of AI unicorns and stealth startups.
                  </div>
                )}

                {step === 0 && (
                  <div className="text-base leading-7 text-beige900/60"></div>
                )}

                {step === 1 && (
                  <div className="flex flex-col gap-4 mb-8">
                    <BeigeTextInput
                      autoFocus
                      label="Name *"
                      placeholder="Your full name"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setIsDirty(true);
                      }}
                    />

                    <BeigeTextInput
                      label="Email *"
                      placeholder="example@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                    <div className="h-1" />
                    <div className="mb-1">
                      <div className="text-lg font-medium tracking-[-0.03em] text-beige900">
                        Drop your links. Let your work speak for itself.
                      </div>
                      <div className="mt-1 text-sm leading-6 text-beige900/65">
                        (링크드인이 없다면 다른 정보만 주셔도 괜찮습니다.)
                      </div>
                    </div>
                    {selectedProfileInputs.includes("linkedin") && (
                      <BeigeLinkInput
                        label={
                          <div className="flex flex-row items-center gap-1.5 w-full mb-0">
                            <Image
                              src="/images/logos/linkedin.svg"
                              alt="LinkedIn"
                              width={20}
                              height={20}
                            />
                            <div>LinkedIn Profile</div>
                            <div
                              className="ml-1 hover:font-medium flex flex-row items-center gap-1 text-sm font-normal text-beige900/70 cursor-pointer transition-all duration-200 hover:text-beige900"
                              onClick={() =>
                                window.open(
                                  "https://www.linkedin.com/in/",
                                  "_blank"
                                )
                              }
                            >
                              (내 링크드인 열기){" "}
                              <ArrowUpRight className="w-3 h-3" />
                            </div>
                          </div>
                        }
                        value={linkedin}
                        isLineClamp={true}
                        onChange={(e) => {
                          setLinkedin(e.target.value);
                          setIsDirty(true);
                        }}
                        placeholder="https://linkedin.com/in/username"
                      />
                    )}

                    <div>
                      <div className="mt-2 text-sm font-normal text-beige900">
                        Select the profile links you want to share.
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2">
                        <ProfileInputToggleButton
                          label="LinkedIn"
                          active={selectedProfileInputs.includes("linkedin")}
                          onClick={() => handleProfileInputChange("linkedin")}
                        />
                        <ProfileInputToggleButton
                          label="GitHub"
                          active={selectedProfileInputs.includes("github")}
                          onClick={() => handleProfileInputChange("github")}
                        />
                        <ProfileInputToggleButton
                          label="Google Scholar"
                          active={selectedProfileInputs.includes("scholar")}
                          onClick={() => handleProfileInputChange("scholar")}
                        />
                        <ProfileInputToggleButton
                          label="Personal Homepage"
                          active={selectedProfileInputs.includes("website")}
                          onClick={() => handleProfileInputChange("website")}
                        />
                        <ProfileInputToggleButton
                          label="Resume / CV"
                          active={selectedProfileInputs.includes("cv")}
                          onClick={() => handleProfileInputChange("cv")}
                        />
                      </div>
                    </div>

                    {selectedProfileInputs.includes("github") && (
                      <BeigeLinkInput
                        label={
                          <div className="flex flex-row items-center gap-1.5">
                            <Image
                              src="/images/logos/github.svg"
                              alt="Github"
                              width={20}
                              height={20}
                            />
                            <div>Github </div>
                          </div>
                        }
                        value={github}
                        onChange={(e) => {
                          setGithub(e.target.value);
                          setIsDirty(true);
                        }}
                        placeholder="https://github.com/"
                      />
                    )}

                    {selectedProfileInputs.includes("scholar") && (
                      <BeigeLinkInput
                        label={
                          <div className="flex flex-row items-center gap-1.5">
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
                        label={<div>Personal Homepage</div>}
                        value={website}
                        onChange={(e) => {
                          setWebsite(e.target.value);
                          setIsDirty(true);
                        }}
                        placeholder="https://yourname.com"
                      />
                    )}

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
                  </div>
                )}

                {step === 2 && (
                  <div className="flex flex-col gap-4 mb-8">
                    <BeigeTextInput
                      autoFocus
                      placeholder="Example: Built and scaled an LLM infra stack serving millions of requests/day, led 0→1 hiring, or shipped production-grade agent systems."
                      value={impactSummary}
                      onChange={(e) => {
                        setImpactSummary(e.target.value);
                        setIsDirty(true);
                      }}
                      rows={4}
                    />
                  </div>
                )}

                {step === 3 && (
                  <div className="flex flex-col gap-6">
                    <div className="flex md:flex-row flex-col gap-2">
                      {ENGAGEMENT_OPTIONS.map((option, index) => (
                        <SelectionCardButton
                          key={option.id}
                          label={option.label}
                          description={option.description}
                          optionNumber={index + 1}
                          active={selectedEngagements.includes(option.id)}
                          onClick={() => handleEngagementToggle(option.id)}
                        />
                      ))}
                    </div>

                    <div className="pt-4">
                      <div className="text-lg font-normal tracking-[-0.03em] text-beige900 md:text-xl">
                        How open are you to a move right now?
                      </div>
                      <div className="mt-1 text-sm leading-6 text-beige900/55 md:text-base">
                        현재 상태에 가장 가까운 선택지를 골라 주세요.
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-2">
                      {CAREER_MOVE_INTENT_OPTIONS.map((option, index) => (
                        <SelectionCardButton
                          key={option.id}
                          label={option.label}
                          optionNumber={ENGAGEMENT_OPTIONS.length + index + 1}
                          active={selectedCareerMoveIntent === option.id}
                          onClick={() =>
                            handleCareerMoveIntentSelect(option.id)
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}

                {step === 4 && (
                  <div className="flex flex-col gap-6 w-full">
                    <div className="w-full grid grid-cols-1 gap-2 md:grid-cols-3">
                      {LOCATION_OPTIONS.map((option, index) => (
                        <SelectionCardButton
                          key={option.id}
                          label={option.label}
                          description={option.description}
                          optionNumber={index + 1}
                          active={selectedLocations.includes(option.id)}
                          onClick={() => handleLocationToggle(option.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {step === 5 && (
                  <div className="flex flex-col gap-6">
                    <BeigeTextInput
                      autoFocus
                      placeholder="e.g., OpenAI, Anthropic, specific stealth startups, or top Korean unicorns. Early stage startups, or top Korean unicorns."
                      value={dreamTeams}
                      onChange={(e) => {
                        setDreamTeams(e.target.value);
                        setIsDirty(true);
                      }}
                      rows={3}
                    />
                  </div>
                )}

                <div className="mt-4 flex flex-row items-center gap-3">
                  <button
                    onClick={handlePrimaryAction}
                    className="h-12 md:h-11 mb-8 md:mb-0 cursor-pointer rounded-lg bg-beige900 w-full px-6 md:w-fit text-lg font-medium text-beige100 shadow-lg transition-all duration-200 hover:opacity-90"
                  >
                    {submitLoading || submissionPending ? (
                      <span className="animate-spin">
                        <LoaderCircle className="h-6 w-6 animate-spin text-beige100" />
                      </span>
                    ) : step === TOTAL_STEPS - 1 ? (
                      "Initiate Match"
                    ) : (
                      "Next"
                    )}
                  </button>

                  <span className="hidden md:flex flex-row items-center gap-1 text-[14px] font-light">
                    <span className="text-beige900/45">press</span>
                    <span className="font-medium text-beige900">Enter</span>
                    <CornerDownLeft size={14} strokeWidth={2} />
                    {isTextareaStep ? (
                      <span className="text-beige900/45">
                        Shift+Enter for newline
                      </span>
                    ) : null}
                  </span>
                </div>
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
              {step === TOTAL_STEPS - 1 ? "Initiate Match" : "Next"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

const Onboarding2Page = () => {
  return <Onboarding2Content />;
};

export default Onboarding2Page;
