"use client";

import ProgressBar from "@/components/apply/ProgressBar";
import { ArrowRight, CornerDownLeft, LoaderCircle } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import router from "next/router";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/toast/toast";
import MultiSelects from "@/components/apply/MultiSelects";
import TextInput from "@/components/apply/TextInput";
import { Selections } from "@/components/landing/Join";
import { isValidEmail } from ".";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useMessages } from "@/i18n/useMessage";

type StepKey =
  | "contact"
  | "role"
  | "company"
  | "size"
  | "needs"
  | "additional"
  | "done";

type StepDef = {
  key: StepKey;
  title?: string;
  description?: string;
};

const Onboard: React.FC = () => {
  // ✅ step은 “visibleSteps 기준 index”
  const [step, setStep] = useState(0);
  const { m } = useMessages();

  const [submitLoading, setSubmitLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [company, setCompany] = useState("");
  const [companyLink, setCompanyLink] = useState("");

  const [roles, setRoles] = useState<string[]>([]);
  const [size, setSize] = useState("");
  const [needs, setNeeds] = useState("");
  const [additional, setAdditional] = useState("");

  // ✅ recruiter path 판정
  const recruiterRole = m.join.roles.recruiter;
  const rolesOptions = Array.from(m.join.roles.options);
  const sizeOptions = Array.from(m.join.sizes);
  const isRecruiter = useMemo(
    () => roles.includes(recruiterRole),
    [recruiterRole, roles]
  );

  const isMobile = useIsMobile();

  // ✅ 역할을 2번째 질문으로: [contact] -> [role] -> ...
  const visibleSteps: StepDef[] = useMemo(() => {
    const base: StepDef[] = [
      {
        key: "contact",
        title: m.join.steps.contact.title,
        description: m.join.steps.contact.description,
      },
      {
        key: "role",
        title: m.join.steps.role.title,
        description: m.join.steps.role.description,
      },
    ];

    if (!isRecruiter) {
      base.push(
        {
          key: "company",
          title: m.join.steps.company.title,
          description: m.join.steps.company.description,
        },
        {
          key: "size",
          title: m.join.steps.size.title,
          description: m.join.steps.size.description,
        },
        {
          key: "needs",
          title: m.join.steps.needs.title,
          description: m.join.steps.needs.description,
        },
        {
          key: "additional",
          title: m.join.steps.additional.title,
          description: m.join.steps.additional.description,
        }
      );
    }

    if (isRecruiter) {
      base.push(
        {
          key: "company",
          title: m.join.steps.companyRecruiter.title,
          description: m.join.steps.companyRecruiter.description,
        },
        {
          key: "additional",
          title: m.join.steps.additionalRecruiter.title,
          description: m.join.steps.additionalRecruiter.description,
        }
      );
    }

    return base;
  }, [isRecruiter, m]);

  const isDone = step === visibleSteps.length;

  const lock = useRef(false);
  const isNext = useRef(true);

  const slideVariants = {
    enter: (next: boolean) => ({ opacity: 0, y: next ? 40 : -40 }),
    center: { opacity: 1, y: 0 },
    exit: (next: boolean) => ({ opacity: 0, y: next ? -40 : 40 }),
  };

  const currentStep = visibleSteps[step];

  const toast = useCallback((message: string) => {
    showToast({ message, variant: "white" });
  }, []);

  const validateStep = useCallback(
    (value?: string): boolean => {
      const key = currentStep?.key;

      if (key === "contact") {
        if (!name.trim()) return (toast(m.join.validation.nameRequired), false);
        if (!email.trim())
          return (toast(m.join.validation.emailRequired), false);
        if (!isValidEmail(email))
          return (toast(m.join.validation.emailInvalid), false);
      }

      if (key === "company") {
        if (!company.trim())
          return (toast(m.join.validation.companyRequired), false);
        // if (!companyLink.trim()) return toast("홈페이지 URL을 입력해주세요."), false;
      }

      if (key === "size") {
        if (!size && !value)
          return (toast(m.join.validation.sizeRequired), false);
      }

      return true;
    },
    [currentStep?.key, name, email, company, companyLink, size, toast, m]
  );

  const saveIfDirty = useCallback(async () => {
    if (!isDirty) return;

    setLoading(true);
    try {
      await supabase.from("harper_waitlist_company").upsert({
        name,
        email,
        role: roles.length > 0 ? roles.join(", ") : null,
        company: isRecruiter ? null : company || null,
        company_link: isRecruiter ? null : companyLink || null,
        size: isRecruiter ? null : size || null,
        needs: needs ? [needs] : null,
        additional: additional || null,
        is_mobile: isMobile,
      });

      setIsDirty(false);
    } finally {
      setLoading(false);
    }
  }, [
    isDirty,
    name,
    email,
    roles,
    isRecruiter,
    company,
    companyLink,
    size,
    needs,
    additional,
  ]);

  const goNext = useCallback(
    async (value?: string) => {
      isNext.current = true;

      if (!validateStep(value)) return;

      await saveIfDirty();

      // 마지막 step이면 완료 화면으로
      if (step === visibleSteps.length - 1) {
        setSubmitLoading(true);
        await supabase.from("harper_waitlist_company").upsert({
          name,
          email,
          role: roles.length > 0 ? roles.join(", ") : null,
          company: isRecruiter ? null : company || null,
          company_link: isRecruiter ? null : companyLink || null,
          size: isRecruiter ? null : size || null,
          needs: needs ? [needs] : null,
          additional: additional || null,
          is_mobile: isMobile,
          is_submit: true,
        });
        setTimeout(() => {
          setSubmitLoading(false);
          setStep(visibleSteps.length); // ✅ done
        }, 700);
        return;
      }

      setStep((prev) => Math.min(prev + 1, visibleSteps.length));
    },
    [saveIfDirty, step, validateStep, visibleSteps.length]
  );

  const goPrev = useCallback(() => {
    isNext.current = false;
    setStep((prev) => Math.max(prev - 1, 0));
  }, []);

  // Enter 핸들링
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (lock.current) return;

      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA") return;

      e.preventDefault();
      void goNext();

      lock.current = true;
      setTimeout(() => (lock.current = false), 450);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext]);

  // Wheel step nav (원하면 제거 가능)
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (lock.current) return;
      if (window.scrollY !== 0) {
        lock.current = true;
        setTimeout(() => (lock.current = false), 800);
        return;
      }

      if (e.deltaY < -75) {
        lock.current = true;
        isNext.current = false;
        setStep((prev) => Math.max(prev - 1, 0));
        setTimeout(() => (lock.current = false), 450);
      } else if (e.deltaY > 75) {
        lock.current = true;
        isNext.current = true;
        setStep((prev) => Math.min(prev + 1, visibleSteps.length));
        setTimeout(() => (lock.current = false), 450);
      }
    };

    window.addEventListener("wheel", onWheel);
    return () => window.removeEventListener("wheel", onWheel);
  }, [visibleSteps.length]);

  return (
    <main className="flex flex-col justify-start md:justify-center items-center min-h-screen bg-white text-black font-inter pt-4 md:pt-0">
      <div className="w-full fixed top-0 left-0 z-20">
        {/* ✅ done screen에서는 꽉 찬 걸로 보여도 되고, 유지해도 됨 */}
        <ProgressBar
          currentStep={Math.min(step + 1, visibleSteps.length)}
          totalSteps={visibleSteps.length}
        />
      </div>

      {isDone ? (
        <div className="flex flex-1 flex-col gap-4 items-center justify-center pb-0 md:pb-28 h-full w-full text-center px-6">
          <Image
            src="/images/logo.png"
            alt="Harper Logo"
            width={32}
            height={32}
          />
          <div className="text-2xl font-normal mt-2">{m.join.done.title}</div>
          <div className="text-lg font-normal text-xgray700">
            {m.join.done.description.split("\n").map((line) => (
              <React.Fragment key={line}>
                {line}
                <br />
              </React.Fragment>
            ))}
          </div>
          <button
            onClick={() => router.push("/companies")}
            className="bg-brightnavy text-white mt-4 px-4 h-11 rounded-[4px] text-lg font-medium hover:opacity-90"
          >
            {m.join.done.backToCompanies}
          </button>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row items-start justify-center h-full w-full px-4 pb-20 pt-4 md:pt-8 md:pb-28">
          <div className="h-full items-start justify-center min-w-16 pt-1 hidden md:flex">
            <div className="flex flex-row items-center gap-1 font-light text-brightnavy">
              {step + 1} <ArrowRight size={16} strokeWidth={2} />
            </div>
          </div>

          <div className="flex md:hidden rounded-md w-6 h-6 text-sm bg-brightnavy/80 text-white mb-4 items-center justify-center">
            {step + 1}
          </div>

          <div className="flex flex-col gap-4 max-w-[800px] w-full">
            <AnimatePresence mode="wait" custom={isNext.current}>
              <motion.div
                key={currentStep.key}
                initial="enter"
                animate="center"
                exit="exit"
                variants={slideVariants}
                custom={isNext.current}
                transition={{ duration: 0.35, ease: "easeInOut" }}
                className="flex flex-col gap-2"
              >
                {/* Title / description */}
                {currentStep.title ? (
                  <div className="flex text-xl md:text-2xl font-normal">
                    {currentStep.title}
                  </div>
                ) : null}

                {currentStep.description ? (
                  <div className="text-xgray600 text-md md:text-lg font-normal mb-4">
                    {currentStep.description}
                  </div>
                ) : (
                  <div className="mb-4" />
                )}

                {/* Step-specific inputs */}
                {currentStep.key === "contact" && (
                  <>
                    <TextInput
                      autoFocus
                      label={m.join.fields.nameLabel}
                      placeholder={m.join.fields.namePlaceholder}
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                    <TextInput
                      label={m.join.fields.emailLabel}
                      placeholder={m.join.fields.emailPlaceholder}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                  </>
                )}

                {currentStep.key === "role" && (
                  <MultiSelects
                    selects={roles}
                    setSelects={(next) => {
                      setRoles(next);
                      setIsDirty(true);

                      // setTimeout(() => {
                      //   void goNext();
                      // }, 350);
                    }}
                    setIsDirty={setIsDirty}
                    options={rolesOptions}
                  />
                )}

                {currentStep.key === "company" && (
                  <>
                    <TextInput
                      autoFocus
                      label={m.join.fields.companyLabel}
                      placeholder={m.join.fields.companyPlaceholder}
                      value={company}
                      onChange={(e) => {
                        setCompany(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                    <TextInput
                      label={m.join.fields.companyLinkLabel}
                      placeholder={m.join.fields.companyLinkPlaceholder}
                      value={companyLink}
                      onChange={(e) => {
                        setCompanyLink(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                  </>
                )}

                {currentStep.key === "size" && (
                  <Selections
                    selected={size}
                    setSelected={(v) => {
                      setSize(v);
                      setIsDirty(true);
                      setTimeout(() => void goNext(v), 350);
                    }}
                    setIsDirty={setIsDirty}
                    options={sizeOptions}
                  />
                )}

                {currentStep.key === "needs" && (
                  <TextInput
                    autoFocus
                    placeholder={m.join.fields.needsPlaceholder}
                    value={needs}
                    onChange={(e) => {
                      setNeeds(e.target.value);
                      setIsDirty(true);
                    }}
                  />
                )}

                {currentStep.key === "additional" && (
                  <TextInput
                    autoFocus
                    placeholder={m.join.fields.additionalPlaceholder}
                    value={additional}
                    onChange={(e) => {
                      setAdditional(e.target.value);
                      setIsDirty(true);
                    }}
                    rows={3}
                  />
                )}

                {/* Buttons */}
                <div className="flex flex-col md:flex-row items-center gap-3 mt-12 md:mt-4">
                  <button
                    onClick={() => void goNext()}
                    disabled={loading || submitLoading}
                    className="bg-brightnavy shadow-lg transition-all duration-200 cursor-pointer text-white w-full md:w-auto px-4 h-11 rounded-[4px] text-lg font-medium hover:opacity-90 disabled:opacity-60"
                  >
                    {submitLoading ? (
                      <span className="animate-spin">
                        <LoaderCircle className="w-6 h-6 animate-spin text-white" />
                      </span>
                    ) : step === visibleSteps.length - 1 ? (
                      m.join.actions.submit
                    ) : (
                      m.join.actions.next
                    )}
                  </button>

                  <span className="text-[14px] font-light flex-row items-center gap-1 hidden md:flex">
                    <span className="text-xgray700">
                      {m.join.actions.press}
                    </span>
                    <span className="text-black font-medium">
                      {m.join.actions.enter}
                    </span>
                    <CornerDownLeft size={14} strokeWidth={2} />
                  </span>

                  {/* 저장중 표시(원하면) */}
                  {loading ? (
                    <span className="text-sm text-xgray600">
                      {m.join.actions.saving}
                    </span>
                  ) : null}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Bottom-left dev nav */}
          <div className="flex flex-row items-center gap-2 fixed bottom-4 left-4 text-sm text-xgray600">
            <button
              type="button"
              className="underline hover:text-black"
              onClick={goPrev}
            >
              {m.join.actions.back}
            </button>
            <button
              type="button"
              className="underline hover:text-black"
              onClick={() => void goNext()}
            >
              {m.join.actions.next}
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

export default Onboard;
