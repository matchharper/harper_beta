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
import { isValidEmail } from ".";
import MultiSelects from "@/components/apply/MultiSelects";

const RolesOptions = [
  "CEO",
  "채용 담당자",
  "CTO",
  "인사팀 매니저",
  "Team Lead",
  "Engineer",
  "기타",
];

const SizeOptions = [
  "1-10명",
  "11-50명",
  "51-100명",
  "101-200명",
  "201-500명",
  "501 이상",
];

const ValueOptions = [
  "채용시간 단축",
  "우수 인재 풀 확보",
  "리크루터 소통 비용 절감",
  "시장 내 희소 포지션 인재 확보",
  "기타",
];

const steps = [
  {
    id: 1,
    title: "성함과 연락받으실 회사 이메일 주소를 알려주세요.",
    description: "(회사 이메일)",
  },
  {
    id: 2,
    title: "회사명과 홈페이지를 알려주세요.",
    description: "",
  },
  {
    id: 3,
    title: "회사에서 어떤 역할을 담당하고 계시나요?",
    description: "",
  },
  {
    id: 4,
    title: "회사의 규모 (총 직원 수)는 어떻게 되나요?",
    description: "",
  },
  {
    id: 5,
    title:
      "가장 중요하게 채용이 필요한 포지션(직무)과 대략적인 인원수를 알려주세요",
    description: "optional",
  },
  {
    id: 6,
    title: "현재 채용하는 포지션의 평균 예상 연봉 범위를 알려주세요.",
    description: "optional",
  },
  // {
  //   id: 7,
  //   title: "하퍼를 통해 기대하는 가장 중요한 가치는 무엇입니까?",
  //   description: "",
  // },
  {
    id: 7,
    title:
      "하퍼에게 추가로 전달하고 싶은 내용이나, 현재 채용에 대한 고민이 있다면 자유롭게 적어주세요",
    description: "optional",
  },
];

const Onboard: React.FC = () => {
  const [step, setStep] = useState(7);
  const [submitLoading, setSubmitLoading] = useState(false);

  // form states (you can add more later)
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [company, setCompany] = useState("");
  const [needs, setNeeds] = useState("");
  const [companyLink, setCompanyLink] = useState("");

  const [roles, setRoles] = useState<string[]>([]);
  const [size, setSize] = useState("");
  const [value, setValue] = useState<string[]>([]);
  const [additional, setAdditional] = useState("");
  const [salary, setSalary] = useState("");

  const [isDirty, setIsDirty] = useState(false);

  const [loading, setLoading] = useState(false);

  const isLastStep = useMemo(() => step === steps.length - 1, [step]);

  const handleNext = useCallback(async () => {
    isNext.current = true;
    if (!email) {
      showToast({
        message: "이메일을 입력해주세요.",
        variant: "white",
      });
      return;
    }
    if (!isValidEmail(email)) {
      showToast({
        message: "유효한 회사 이메일을 입력해주세요.",
        variant: "white",
      });
      return;
    }

    if (isDirty) {
      setLoading(true);
      const res = await supabase.from("harper_waitlist_company").upsert({
        name: name,
        email,
        role: roles.length > 0 ? roles.join(", ") : null,
        company: company,
        company_link: companyLink,
        size: size,
        needs: needs ? [needs] : null,
        salary: salary,
        additional: additional,
        expect: value.length > 0 ? value.join(", ") : null,
      });
      setIsDirty(false);
      setLoading(false);
    }

    if (isLastStep) {
      setSubmitLoading(true);
      setTimeout(() => {
        setSubmitLoading(false);
        setStep(8);
      }, 1000);
      return;
    }

    setStep((prev) => Math.min(prev + 1, steps.length - 1));
  }, [
    isLastStep,
    step,
    isDirty,
    name,
    email,
    roles,
    company,
    companyLink,
    needs,
    salary,
    size,
    value,
    additional,
  ]);

  const handlePrev = () => {
    isNext.current = false;

    setStep((prev) => Math.max(prev - 1, 0));
  };

  const lock = useRef(false);
  const isNext = useRef(true);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (lock.current) return;

      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA") return;

      e.preventDefault();

      handleNext();

      lock.current = true;
      setTimeout(() => {
        lock.current = false;
      }, 500);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (lock.current) return;
      if (window.scrollY !== 0) {
        lock.current = true;
        setTimeout(() => {
          lock.current = false;
        }, 800);
        return;
      }

      if (e.deltaY < -75) {
        lock.current = true;
        isNext.current = false;
        setStep((prev) => Math.max(prev - 1, 0));

        setTimeout(() => {
          lock.current = false;
        }, 500);
      } else if (e.deltaY > 75) {
        lock.current = true;
        isNext.current = true;
        setStep((prev) => Math.min(prev + 1, steps.length - 1));

        setTimeout(() => {
          lock.current = false;
        }, 500);
      }
    };

    window.addEventListener("wheel", handleWheel);
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  const slideVariants = {
    enter: (isNext: boolean) => ({
      opacity: 0,
      y: isNext ? 40 : -40, // ⭐️ forward면 아래→위, backward면 위→아래
    }),
    center: {
      opacity: 1,
      y: 0,
    },
    exit: (isNext: boolean) => ({
      opacity: 0,
      y: isNext ? -40 : 40, // ⭐️ forward면 위로 사라지고, backward면 아래로 사라짐
    }),
  };

  return (
    <main className="flex flex-col justify-start md:justify-center items-center min-h-screen bg-white text-black font-inter pt-4 md:pt-0">
      <div className="w-full fixed top-0 left-0 z-20">
        <ProgressBar currentStep={step + 1} totalSteps={steps.length} />
      </div>

      {step === steps.length ? (
        <>
          <div className="flex flex-1 flex-col gap-4 items-center justify-center pb-0 md:pb-28 h-full w-full text-center px-6">
            <Image
              src="/images/logo.png"
              alt="Harper Logo"
              width={32}
              height={32}
            />
            <div className="text-2xl font-normal mt-2">
              등록이 완료되었습니다.
            </div>
            <div className="text-lg font-normal text-xgray700">
              Harper는 여러분의 팀에 가장 적합한 지원자를 소개하기 위해 준비
              중입니다.
              <br />
              빠른 시일 내 연락드리겠습니다.
            </div>
            <button
              onClick={() => {
                router.push("/companies");
              }}
              className="bg-brightnavy text-white mt-4 px-4 h-11 rounded-[4px] text-lg font-medium hover:opacity-90"
            >
              돌아가기
            </button>
          </div>
        </>
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

          <div
            onSubmit={(e) => e.preventDefault()}
            className="flex flex-col gap-4 max-w-[800px] w-full"
          >
            <AnimatePresence mode="wait" custom={isNext.current}>
              <motion.div
                key={step}
                initial="enter"
                animate="center"
                exit="exit"
                variants={slideVariants}
                custom={isNext.current}
                transition={{ duration: 0.35, ease: "easeInOut" }}
                className="flex flex-col gap-2"
              >
                {/* Title / description */}
                {step < steps.length && steps[step].title ? (
                  <div className="flex text-xl md:text-2xl font-normal">
                    {steps[step].title ?? ""}
                  </div>
                ) : (
                  <></>
                )}
                {step < steps.length && steps[step].description ? (
                  <div className="text-xgray600 text-md md:text-lg font-normal mb-4">
                    {steps[step].description ?? ""}
                  </div>
                ) : (
                  <div className="mb-4"></div>
                )}

                {/* Step-specific inputs */}
                {step === 0 && (
                  <>
                    <TextInput
                      autoFocus
                      label="이름"
                      placeholder="이름"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                    <TextInput
                      label="이메일"
                      placeholder="example@gmail.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                  </>
                )}

                {step === 1 && (
                  <>
                    <TextInput
                      autoFocus
                      label="회사명"
                      placeholder="예) Harper"
                      value={company}
                      onChange={(e) => {
                        setCompany(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                    <TextInput
                      label="홈페이지 URL"
                      placeholder="예) https://matchharper.com"
                      value={companyLink}
                      onChange={(e) => {
                        setCompanyLink(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                  </>
                )}

                {step === 2 && (
                  <>
                    <MultiSelects
                      selects={roles}
                      setSelects={setRoles}
                      setIsDirty={setIsDirty}
                      options={RolesOptions}
                    />
                  </>
                )}

                {step === 3 && (
                  <>
                    <Selections
                      selected={size}
                      setSelected={(v) => {
                        setSize(v);
                        setTimeout(() => {
                          handleNext();
                        }, 500);
                      }}
                      setIsDirty={setIsDirty}
                      options={SizeOptions}
                    />
                  </>
                )}

                {step === 4 && (
                  <>
                    <TextInput
                      autoFocus
                      placeholder="예) Machine Learning 엔지니어 2명, Deep Learning 연구원 1명)"
                      value={needs}
                      onChange={(e) => {
                        setNeeds(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                  </>
                )}

                {step === 5 && (
                  <>
                    <TextInput
                      autoFocus
                      placeholder="예) 1억 - 1억 5천만원"
                      value={salary}
                      onChange={(e) => {
                        setSalary(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                  </>
                )}

                {/* {step === 6 && (
                  <>
                    <MultiSelects
                      selects={value}
                      setSelects={setValue}
                      setIsDirty={setIsDirty}
                      options={ValueOptions}
                    />
                  </>
                )} */}

                {step === 6 && (
                  <>
                    <TextInput
                      autoFocus
                      placeholder="예) 현재 채용이 빠를 수록 좋은데 언제부터 사용 가능할까요?"
                      value={additional}
                      onChange={(e) => {
                        setAdditional(e.target.value);
                        setIsDirty(true);
                      }}
                      rows={3}
                    />
                  </>
                )}

                {/* Buttons */}
                <div className="flex flex-col md:flex-row items-center gap-3 mt-12 md:mt-4">
                  <button
                    onClick={handleNext}
                    className="bg-brightnavy shadow-lg transition-all duration-200 cursor-pointer text-white w-full md:w-auto px-4 h-11 rounded-[4px] text-lg font-medium hover:opacity-90"
                  >
                    {submitLoading ? (
                      <span className="animate-spin">
                        <LoaderCircle className="w-6 h-6 animate-spin text-white" />
                      </span>
                    ) : isLastStep ? (
                      "Submit"
                    ) : (
                      "Next"
                    )}
                  </button>

                  <span className="text-[14px] font-light flex-row items-center gap-1 hidden md:flex">
                    <span className="text-xgray700">press</span>
                    <span className="text-black font-medium">Enter</span>
                    <CornerDownLeft size={14} strokeWidth={2} />
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Bottom-left dev nav (optional) */}
          <div className="flex flex-row items-center gap-2 fixed bottom-4 left-4 text-sm text-xgray600">
            <button
              type="button"
              className="underline hover:text-black"
              onClick={handlePrev}
            >
              Back
            </button>
            <button
              type="button"
              className="underline hover:text-black"
              onClick={handleNext}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

export default Onboard;

const Selections = ({
  selected,
  setSelected,
  setIsDirty,
  options,
}: {
  selected: string;
  setSelected: (selected: string) => void;
  setIsDirty: (isDirty: boolean) => void;
  options: string[];
}) => {
  const [flash, setFlash] = useState(false);

  const handleClick = (opt: string) => {
    setFlash(true);

    setTimeout(() => setFlash(false), 200); // 0.2초만 깜빡
    setIsDirty(true);
    setSelected(opt);
  };

  return (
    <div className="flex flex-row gap-2 flex-wrap">
      {options.map((option) => (
        <div
          key={option}
          onClick={() => handleClick(option)}
          className={`flex flex-row text-base md:text-base transition-all duration-200 items-center gap-2 cursor-pointer border-2 py-2 px-3 min-w-[200px] rounded-[4px]
            ${flash ? "animate-pulse" : ""}
            ${
              selected === option
                ? "bg-brightnavy/20  hover:bg-brightnavy/20 border-brightnavy"
                : "bg-brightnavy/5  hover:bg-brightnavy/30 active:border-brightnavy border-brightnavy/10"
            }
            `}
        >
          {option}
        </div>
      ))}
    </div>
  );
};

type TextInputProps = {
  label?: string;
  placeholder: string;
  value: string;
  rows?: number;
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  autoFocus?: boolean;
};

const TextInput = ({
  label,
  placeholder,
  value,
  rows,
  onChange,
  autoFocus = false,
}: TextInputProps) => {
  return (
    <div className="w-full group flex flex-col mt-2">
      {label && <label className="mb-1 font-medium text-sm">{label}</label>}
      {rows ? (
        <textarea
          placeholder={placeholder}
          className="transition-colors duration-200 leading-8 focus:border-b focus:border-brightnavy w-full px-0.5 py-2 border-b border-xgray400 text-lg md:text-xl font-normal focus:outline-none outline-none"
          value={value}
          onChange={onChange}
          rows={rows}
          autoFocus={autoFocus}
        />
      ) : (
        <input
          placeholder={placeholder}
          className="transition-colors duration-200 focus:border-b focus:border-brightnavy w-full px-0.5 py-2 border-b border-xgray400 text-lg md:text-xl font-normal leading-5 focus:outline-none outline-none"
          value={value}
          onChange={onChange}
          autoFocus={autoFocus}
        />
      )}
      <div className="transition-colors duration-200 rounded-full w-full h-[1px] bg-white/0 group-focus-within:bg-brightnavy"></div>
    </div>
  );
};
