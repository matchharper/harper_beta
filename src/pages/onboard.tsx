"use client";

import ProgressBar from "@/components/apply/ProgressBar";
import { ArrowRight, CornerDownLeft, LoaderCircle } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import router from "next/router";
import TextInput from "@/components/apply/TextInput";
import LinkInput from "@/components/apply/LinkInput";
import { useOnboarding } from "@/hooks/useOnboarding";
import MultiSelects from "@/components/apply/MultiSelects";
import { logger } from "@/utils/logger";

const OPTIONS = [
  "풀타임 정규직",
  "인턴",
  "파트타임/외주",
  "Expert call",
  "해외 취업",
  "해당 없음",
];

const STEPS = [
  {
    id: 1,
    title: "Welcome to Harper!",
    description:
      "Let's start with your profile. Fill out a few quick details to get discovered by top employers.",
  },
  {
    id: 2,
    title: "",
    description: "",
  },
  {
    id: 3,
    title: "Contact preference",
    description:
      "How can companies or Harper contact you? You can update this anytime later.",
  },
  {
    id: 4,
    title: "이력서/경력 정보",
    description:
      "현재는 DB 저장 없이 입력 UI만 유지됩니다. 기존 데이터에는 영향이 없습니다.",
  },
  {
    id: 5,
    title: "Confirm & finish",
    description:
      "Check your information. When you're ready, submit to start getting matched.",
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

const Onboard: React.FC = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [links, setLinks] = useState<string[]>(["", "", ""]);
  const [roles, setRoles] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const [workExperiences, setWorkExperiences] = useState<WorkExperience[]>([
    makeWorkExperience(),
  ]);
  const [educations, setEducations] = useState<Education[]>([makeEducation()]);

  const onSave = useCallback(() => {
    if (!isDirty) return;
    logger.log("onboard draft updated", {
      name,
      email,
      phone,
      country,
      city,
      roleCount: roles.length,
      linkCount: links.filter(Boolean).length,
      workCount: workExperiences.length,
      educationCount: educations.length,
    });
    setIsDirty(false);
  }, [
    city,
    country,
    educations.length,
    email,
    isDirty,
    links,
    name,
    phone,
    roles.length,
    workExperiences.length,
  ]);

  const { step, submitLoading, handleNext, handlePrev, isNextRef } =
    useOnboarding({
      save: onSave,
      totalSteps: STEPS.length,
    });

  const handleChangeLink = (index: number, value: string) => {
    setIsDirty(true);
    setLinks((prev) => prev.map((link, i) => (i === index ? value : link)));
  };

  const updateWorkExperience = (
    index: number,
    field: keyof WorkExperience,
    value: string
  ) => {
    setIsDirty(true);
    setWorkExperiences((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const updateEducation = (
    index: number,
    field: keyof Education,
    value: string
  ) => {
    setIsDirty(true);
    setEducations((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  useEffect(() => {
    document.documentElement.classList.add("noneoverscroll");
    return () => {
      document.documentElement.classList.remove("noneoverscroll");
    };
  }, []);

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
    <main className="flex flex-col justify-start md:justify-center items-center min-h-screen bg-white text-black font-inter pt-4 md:pt-0">
      <div className="w-full fixed top-0 left-0 z-20">
        <ProgressBar currentStep={step + 1} totalSteps={STEPS.length} />
      </div>

      {step === STEPS.length ? (
        <div className="flex flex-col gap-4 items-center justify-center h-full w-full text-center px-4">
          <div className="text-2xl font-normal">Thank you for your submission!</div>
          <div className="text-lg font-normal text-xgray700">
            We will get in touch with you on the next step within the next 24
            hours. Please seat back and relax
          </div>
          <button
            onClick={() => {
              router.push("/call");
            }}
            className="bg-brightnavy text-white px-4 h-11 rounded-[4px] text-lg font-medium hover:opacity-90"
          >
            Recruiter call 시작하기
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
                  <div className="flex text-xl md:text-2xl font-normal">
                    {STEPS[step].title}
                  </div>
                ) : null}
                {step < STEPS.length && STEPS[step].description ? (
                  <div className="text-xgray600 text-xl font-normal mb-4">
                    {STEPS[step].description}
                  </div>
                ) : null}

                {step === 0 && (
                  <>
                    <TextInput
                      autoFocus
                      label="Country"
                      placeholder="대한민국"
                      value={country}
                      onChange={(e) => {
                        setCountry(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                    <TextInput
                      label="City"
                      placeholder="서울"
                      value={city}
                      onChange={(e) => {
                        setCity(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                  </>
                )}

                {step === 1 && (
                  <>
                    <TextInput
                      autoFocus
                      label="이름"
                      placeholder="Enter your name..."
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                    <TextInput
                      label="이메일"
                      placeholder="Enter your email..."
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                    <TextInput
                      label="전화번호"
                      placeholder="Enter your phone number..."
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setIsDirty(true);
                      }}
                    />
                  </>
                )}

                {step === 2 && (
                  <MultiSelects
                    selects={roles}
                    setSelects={setRoles}
                    setIsDirty={setIsDirty}
                    options={OPTIONS}
                  />
                )}

                {step === 3 && (
                  <div className="flex flex-col gap-6">
                    <div className="rounded-md border border-xgray300 px-4 py-3 text-sm text-xgray700 bg-xlightgray">
                      이 단계는 현재 DB 저장 없이 로컬 상태만 편집됩니다.
                    </div>

                    <div className="flex flex-col gap-4">
                      {workExperiences.map((exp, index) => (
                        <div key={`work-${index}`} className="flex flex-col gap-3">
                          <TextInput
                            label={`경력 ${index + 1} 회사`}
                            placeholder="회사명"
                            value={exp.company}
                            onChange={(e) =>
                              updateWorkExperience(index, "company", e.target.value)
                            }
                          />
                          <TextInput
                            label={`경력 ${index + 1} 직무`}
                            placeholder="직무"
                            value={exp.position}
                            onChange={(e) =>
                              updateWorkExperience(index, "position", e.target.value)
                            }
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-sm px-3 py-1.5 text-brightnavy rounded-[5px] hover:bg-xlightgray w-fit"
                        onClick={() => {
                          setIsDirty(true);
                          setWorkExperiences((prev) => [...prev, makeWorkExperience()]);
                        }}
                      >
                        + 경력 추가
                      </button>
                    </div>

                    <div className="flex flex-col gap-4">
                      {educations.map((edu, index) => (
                        <div key={`edu-${index}`} className="flex flex-col gap-3">
                          <TextInput
                            label={`학력 ${index + 1} 학교`}
                            placeholder="학교명"
                            value={edu.school}
                            onChange={(e) =>
                              updateEducation(index, "school", e.target.value)
                            }
                          />
                          <TextInput
                            label={`학력 ${index + 1} 전공`}
                            placeholder="전공"
                            value={edu.major}
                            onChange={(e) =>
                              updateEducation(index, "major", e.target.value)
                            }
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-sm px-3 py-1.5 text-brightnavy rounded-[5px] hover:bg-xlightgray w-fit"
                        onClick={() => {
                          setIsDirty(true);
                          setEducations((prev) => [...prev, makeEducation()]);
                        }}
                      >
                        + 학력 추가
                      </button>
                    </div>
                  </div>
                )}

                {step === 4 && (
                  <div className="flex flex-col gap-4">
                    <LinkInput
                      label="Github"
                      value={links[0]}
                      onChange={(e) => handleChangeLink(0, e.target.value)}
                      placeholder="https://github.com/username"
                      imgSrc="/svgs/github.svg"
                    />
                    <LinkInput
                      label="LinkedIn"
                      value={links[1]}
                      onChange={(e) => handleChangeLink(1, e.target.value)}
                      placeholder="https://linkedin.com/in/username"
                      imgSrc="/svgs/linkedin.svg"
                    />
                    <LinkInput
                      label="Google Scholar"
                      value={links[2]}
                      onChange={(e) => handleChangeLink(2, e.target.value)}
                      placeholder="https://scholar.google.com/citations?user="
                      imgSrc="/svgs/scholar.svg"
                    />
                    {links.length > 3 &&
                      links.slice(3).map((link, index) => (
                        <div className="relative" key={`link-${index}`}>
                          <div
                            onClick={() => {
                              setIsDirty(true);
                              setLinks((prev) => prev.slice(0, -1));
                            }}
                            className="flex rounded-full w-4 h-4 absolute top-[11px] right-[-28px] bg-red-100 text-red-400 items-center justify-center cursor-pointer hover:bg-red-200"
                          >
                            -
                          </div>
                          <LinkInput
                            label="추가 링크"
                            value={link}
                            onChange={(e) =>
                              handleChangeLink(3 + index, e.target.value)
                            }
                            placeholder="https://"
                            imgSrc="/svgs/house.svg"
                          />
                        </div>
                      ))}
                    <div className="flex flex-row items-center justify-start">
                      <button
                        type="button"
                        onClick={() => {
                          setIsDirty(true);
                          setLinks((prev) => [...prev, ""]);
                        }}
                        className="text-sm px-3 py-1.5 text-brightnavy rounded-[5px] hover:bg-xlightgray"
                      >
                        + 추가
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-row items-center gap-3 mt-4">
                  <button
                    onClick={handleNext}
                    className="bg-brightnavy shadow-lg transition-all duration-200 cursor-pointer text-white px-4 h-11 rounded-[4px] text-lg font-medium hover:opacity-90"
                  >
                    {submitLoading ? (
                      <span className="animate-spin">
                        <LoaderCircle className="w-6 h-6 animate-spin text-white" />
                      </span>
                    ) : step === STEPS.length - 1 ? (
                      "Submit"
                    ) : (
                      "Next"
                    )}
                  </button>

                  <span className="text-[14px] font-light flex flex-row items-center gap-1">
                    <span className="text-xgray700">press</span>
                    <span className="text-black font-medium">Enter</span>
                    <CornerDownLeft size={14} strokeWidth={2} />
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

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
