// "use client";

// import ProgressBar from "@/components/apply/ProgressBar";
// import { ArrowRight, CornerDownLeft, LoaderCircle } from "lucide-react";
// import React, {
//   useCallback,
//   useEffect,
//   useMemo,
//   useRef,
//   useState,
// } from "react";
// import { AnimatePresence, motion } from "framer-motion";
// import ProfileResume from "@/components/apply/ProfileResume";
// import router from "next/router";
// // import { useUserProfile } from "@/states/useUserProfile";
// import { useUploadProfile } from "@/states/useUploadProfile";
// import useProfileStore from "@/store/useProfileStore";
// import TextInput from "@/components/apply/TextInput";
// import LinkInput from "@/components/apply/LinkInput";
// import { useOnboarding } from "@/hooks/useOnboarding";
// import MultiSelects from "@/components/apply/MultiSelects";

// const Options = [
//   "풀타임 정규직",
//   "인턴",
//   "파트타임/외주",
//   "Expert call",
//   "해외 취업",
//   "해당 없음",
// ];
// // step metadata (title, description 등)
// const steps = [
//   {
//     id: 1,
//     title: "Welcome to Harper!",
//     description:
//       "Let's start with your profile. Fill out a few quick details to get discovered by top employers.",
//   },
//   {
//     id: 2,
//     title: "",
//     description: "",
//   },
//   {
//     id: 3,
//     title: "Contact preference",
//     description:
//       "How can companies or Harper contact you? You can update this anytime later.",
//   },
//   {
//     id: 4,
//     title: "이력서 제출",
//     description:
//       "지원 절차를 시작하기 위해 이력서를 업로드해주세요. 이력서를 제출하면 자동으로 아래의 항목들이 채워집니다.",
//   },
//   {
//     id: 5,
//     title: "Confirm & finish",
//     description:
//       "Check your information. When you're ready, submit to start getting matched.",
//   },
// ];

// export type WorkExperience = {
//   company: string;
//   position: string;
//   startDate: string;
//   endDate: string;
//   description: string;
// };

// export type Education = {
//   school: string;
//   major: string;
//   startDate: string; // 입학
//   endDate: string; // 졸업 (재학중이면 "default")
//   degree: string;
//   gpa: string;
// };

// const Onboard: React.FC = () => {
//   const [name, setName] = useState("");
//   const [email, setEmail] = useState("");
//   const [phone, setPhone] = useState("");
//   const [country, setCountry] = useState("");
//   const [city, setCity] = useState("");
//   const [links, setLinks] = useState<string[]>(["", "", ""]);
//   const [roles, setRoles] = useState<string[]>([]);
//   const [isDirty, setIsDirty] = useState(false);

//   const [workExperiences, setWorkExperiences] = useState<WorkExperience[]>([
//     {
//       company: "",
//       position: "",
//       startDate: "",
//       endDate: "",
//       description: "",
//     },
//   ]);
//   const [educations, setEducations] = useState<Education[]>([
//     {
//       school: "",
//       major: "",
//       startDate: "",
//       endDate: "",
//       degree: "",
//       gpa: "",
//     },
//   ]);

//   const userId =
//     typeof window !== "undefined" ? localStorage.getItem("userId") : null;
//   // const { data: userProfile, isLoading: isUserProfileLoading } =
//   //   useUserProfile(userId);

//   const uploadProfileMutation = useUploadProfile();

//   const {
//     resumeIdState,
//     setResumeIdState,
//     resumeText,
//     setResumeText,
//     files,
//     setFiles,
//     isFileChanged,
//     setIsFileChanged,
//     fileName,
//     setFileName,
//     fileSize,
//     setFileSize,
//   } = useProfileStore();

//   const onSave = useCallback(() => {
//     logger.log("Save!", isDirty, isFileChanged);
//     if (isDirty || isFileChanged) {
//       logger.log("Upload profile!");
//       uploadProfileMutation.mutate({
//         name,
//         email,
//         phone,
//         country,
//         city,
//         open_opportunities: roles,
//         links,
//         workExperiences,
//         educations: educations,
//         files,
//         isFileChanged,
//         resumeText,
//         resumeIdState,
//       });
//       setIsDirty(false);
//     }
//   }, [
//     isDirty,
//     uploadProfileMutation,
//     name,
//     email,
//     phone,
//     country,
//     city,
//     roles,
//     links,
//     userId,
//     educations,
//     workExperiences,
//     files,
//     isFileChanged,
//     resumeText,
//     resumeIdState,
//   ]);

//   const { step, submitLoading, setStep, handleNext, handlePrev, isNextRef } =
//     useOnboarding({
//       save: onSave,
//       totalSteps: steps.length,
//     });

//   useEffect(() => {
//     if (!userProfile) return;
//     setResumeIdState(userProfile.resume_id ?? "");

//     if (userProfile.resumes && userProfile.resumes.length > 0) {
//       const latestResume = userProfile.resumes[0];
//       setResumeText(latestResume.resume_text ?? "");
//       setFileName(latestResume.file_name ?? "");
//       setFileSize(latestResume.file_size ?? 0);
//     }
//   }, [userProfile]);

//   const classifyLinks = (links: string[] | null | undefined) => {
//     const result = ["", "", ""];

//     if (!links || links.length === 0) return result;

//     links.forEach((linkRaw) => {
//       const link = linkRaw.trim();
//       if (!link) return;

//       if (link.includes("github.com")) {
//         result[0] = link;
//       } else if (link.includes("linkedin.com")) {
//         result[1] = link;
//       } else if (link.includes("scholar.google.com")) {
//         result[2] = link;
//       } else {
//         result.push(link);
//       }
//     });

//     return result;
//   };

//   useEffect(() => {
//     if (!userProfile) return;

//     setName(userProfile.name ?? "");
//     setEmail(userProfile.email ?? "");
//     setPhone(userProfile.phone ?? "");
//     setCountry(userProfile.country ?? "");
//     setCity(userProfile.city ?? "");
//     setRoles(userProfile.open_opportunities ?? []);
//     setWorkExperiences(userProfile.work_experiences ?? []);
//     setEducations(userProfile.educations ?? []);

//     const parsed = classifyLinks(userProfile.links);
//     setLinks(parsed);
//   }, [userProfile]);

//   const handleChangeLink = (index: number, value: string) => {
//     setIsDirty(true);
//     setLinks((prev) => prev.map((link, i) => (i === index ? value : link)));
//   };

//   useEffect(() => {
//     document.documentElement.classList.add("noneoverscroll");
//     return () => {
//       document.documentElement.classList.remove("noneoverscroll");
//     };
//   }, []);

//   const slideVariants = {
//     enter: (isNext: boolean) => ({
//       opacity: 0,
//       y: isNext ? 40 : -40,
//     }),
//     center: {
//       opacity: 1,
//       y: 0,
//     },
//     exit: (isNext: boolean) => ({
//       opacity: 0,
//       y: isNext ? -40 : 40,
//     }),
//   };

//   return (
//     <main className="flex flex-col justify-start md:justify-center items-center min-h-screen bg-white text-black font-inter pt-4 md:pt-0">
//       <div className="w-full fixed top-0 left-0 z-20">
//         <ProgressBar currentStep={step + 1} totalSteps={steps.length} />
//       </div>

//       {step === steps.length ? (
//         <>
//           <div className="flex flex-col gap-4 items-center justify-center h-full w-full text-center">
//             <div className="text-2xl font-normal">
//               Thank you for your submission!
//             </div>
//             <div className="text-lg font-normal text-xgray700">
//               We will get in touch with you on the next step within the next 24
//               hours. Please seat back and relax
//             </div>
//             <button
//               onClick={() => {
//                 router.push("/call");
//               }}
//               className="bg-brightnavy text-white px-4 h-11 rounded-[4px] text-lg font-medium hover:opacity-90"
//             >
//               Recruiter call 시작하기
//             </button>
//           </div>
//         </>
//       ) : (
//         <div className="flex flex-col md:flex-row items-start justify-center h-full w-full px-4 pb-20 pt-4 md:pt-8 md:pb-28">
//           <div className="h-full items-start justify-center min-w-16 pt-1 hidden md:flex">
//             <div className="flex flex-row items-center gap-1 font-light text-brightnavy">
//               {step + 1} <ArrowRight size={16} strokeWidth={2} />
//             </div>
//           </div>
//           <div className="flex md:hidden rounded-md w-6 h-6 text-sm bg-brightnavy/80 text-white mb-4 items-center justify-center">
//             {step + 1}
//           </div>

//           <div
//             onSubmit={(e) => e.preventDefault()}
//             className="flex flex-col gap-4 max-w-[800px] w-full"
//           >
//             <AnimatePresence mode="wait" custom={isNextRef.current}>
//               <motion.div
//                 key={step}
//                 initial="enter"
//                 animate="center"
//                 exit="exit"
//                 variants={slideVariants}
//                 custom={isNextRef.current}
//                 transition={{ duration: 0.35, ease: "easeInOut" }}
//                 className="flex flex-col gap-4"
//               >
//                 {/* Title / description */}
//                 {step < steps.length && steps[step].title ? (
//                   <div className="flex text-xl md:text-2xl font-normal">
//                     {steps[step].title ?? ""}
//                   </div>
//                 ) : (
//                   <></>
//                 )}
//                 {step < steps.length && steps[step].description ? (
//                   <div className="text-xgray600 text-xl font-normal mb-4">
//                     {steps[step].description ?? ""}
//                   </div>
//                 ) : (
//                   <></>
//                 )}

//                 {/* Step-specific inputs */}
//                 {step === 0 && (
//                   <>
//                     <TextInput
//                       autoFocus
//                       label="Country"
//                       placeholder="대한민국"
//                       value={country}
//                       onChange={(e) => {
//                         setCountry(e.target.value);
//                         setIsDirty(true);
//                       }}
//                     />
//                     <TextInput
//                       label="City"
//                       placeholder="서울"
//                       value={city}
//                       onChange={(e) => {
//                         setCity(e.target.value);
//                         setIsDirty(true);
//                       }}
//                     />
//                   </>
//                 )}

//                 {step === 1 && (
//                   <>
//                     <TextInput
//                       autoFocus
//                       label="이름"
//                       placeholder="Enter your name..."
//                       value={name}
//                       onChange={(e) => {
//                         setName(e.target.value);
//                         setIsDirty(true);
//                       }}
//                     />
//                     <TextInput
//                       label="이메일"
//                       placeholder="Enter your email..."
//                       value={email}
//                       onChange={(e) => {
//                         setEmail(e.target.value);
//                         setIsDirty(true);
//                       }}
//                     />
//                     <TextInput
//                       label="전화번호"
//                       placeholder="Enter your phone number..."
//                       value={phone}
//                       onChange={(e) => {
//                         setPhone(e.target.value);
//                         setIsDirty(true);
//                       }}
//                     />
//                   </>
//                 )}

//                 {step === 2 && (
//                   <>
//                     <MultiSelects
//                       selects={roles}
//                       setSelects={setRoles}
//                       setIsDirty={setIsDirty}
//                       options={Options}
//                     />
//                   </>
//                 )}

//                 {step === 3 && (
//                   <>
//                     <ProfileResume
//                       workExperiences={workExperiences}
//                       setWorkExperiences={(e) => {
//                         setWorkExperiences(e);
//                         setIsDirty(true);
//                       }}
//                       educations={educations}
//                       setEducations={(e) => {
//                         setEducations(e);
//                         setIsDirty(true);
//                       }}
//                     />
//                   </>
//                 )}

//                 {step === 4 && (
//                   <>
//                     <div className="flex flex-col gap-4">
//                       <LinkInput
//                         label="Github"
//                         value={links[0]}
//                         onChange={(e) => handleChangeLink(0, e.target.value)}
//                         placeholder="https://github.com/username"
//                         imgSrc="/svgs/github.svg"
//                       />
//                       <LinkInput
//                         label="LinkedIn"
//                         value={links[1]}
//                         onChange={(e) => handleChangeLink(1, e.target.value)}
//                         placeholder="https://linkedin.com/in/username"
//                         imgSrc="/svgs/linkedin.svg"
//                       />
//                       <LinkInput
//                         label="Google Scholar"
//                         value={links[2]}
//                         onChange={(e) => handleChangeLink(2, e.target.value)}
//                         placeholder="https://scholar.google.com/citations?user="
//                         imgSrc="/svgs/scholar.svg"
//                       />
//                       {links.length > 3 && (
//                         <>
//                           {links.slice(3).map((link, index) => (
//                             <div className="relative" key={index}>
//                               <div
//                                 onClick={() => {
//                                   setIsDirty(true);
//                                   setLinks((prev) => prev.slice(0, -1));
//                                 }}
//                                 className="flex rounded-full w-4 h-4 absolute top-[11px] right-[-28px] bg-red-100 text-red-400 items-center justify-center cursor-pointer hover:bg-red-200"
//                               >
//                                 -
//                               </div>
//                               <LinkInput
//                                 label="추가 링크"
//                                 value={link}
//                                 onChange={(e) =>
//                                   handleChangeLink(3 + index, e.target.value)
//                                 }
//                                 placeholder="https://"
//                                 imgSrc="/svgs/house.svg"
//                               />
//                             </div>
//                           ))}
//                         </>
//                       )}
//                       <div className="flex flex-row items-center justify-start">
//                         <button
//                           type="button"
//                           onClick={() => setLinks((prev) => [...prev, ""])}
//                           className="text-sm px-3 py-1.5 text-brightnavy rounded-[5px] hover:bg-xlightgray"
//                         >
//                           + 추가
//                         </button>
//                       </div>
//                     </div>
//                   </>
//                 )}

//                 {/* Buttons */}
//                 <div className="flex flex-row items-center gap-3 mt-4">
//                   <button
//                     onClick={handleNext}
//                     className="bg-brightnavy shadow-lg transition-all duration-200 cursor-pointer text-white px-4 h-11 rounded-[4px] text-lg font-medium hover:opacity-90"
//                   >
//                     {submitLoading ? (
//                       <span className="animate-spin">
//                         <LoaderCircle className="w-6 h-6 animate-spin text-white" />
//                       </span>
//                     ) : step === steps.length - 1 ? (
//                       "Submit"
//                     ) : (
//                       "Next"
//                     )}
//                   </button>

//                   <span className="text-[14px] font-light flex flex-row items-center gap-1">
//                     <span className="text-xgray700">press</span>
//                     <span className="text-black font-medium">Enter</span>
//                     <CornerDownLeft size={14} strokeWidth={2} />
//                   </span>
//                 </div>
//               </motion.div>
//             </AnimatePresence>
//           </div>

//           {/* Bottom-left dev nav (optional) */}
//           <div className="flex flex-row items-center gap-2 fixed bottom-4 left-4 text-sm text-xgray600">
//             <button
//               type="button"
//               className="underline hover:text-black"
//               onClick={handlePrev}
//             >
//               Back
//             </button>
//             <button
//               type="button"
//               className="underline hover:text-black"
//               onClick={handleNext}
//             >
//               Next
//             </button>
//           </div>
//         </div>
//       )}
//     </main>
//   );
// };

// export default Onboard;

import React from "react";

const Onboard = () => {
  return <div>Onboard</div>;
};

export default Onboard;
