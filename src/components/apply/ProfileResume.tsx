// import { Education, WorkExperience } from "@/pages/onboard";
// import { useUploadProfile } from "@/states/useUploadProfile";
// import { useUserProfile } from "@/states/useUserProfile";
// import useProfileStore from "@/store/useProfileStore";
// import { FileText, Loader2, Upload } from "lucide-react";
// import React, { useEffect, useState } from "react";
// import ConfirmModal from "../Modal/ConfirmModal";
// import { extractResumeInfo } from "@/lib/llm/llm";

// const MAX_FILE_SIZE = 15 * 1024 * 1024; // 10MB

// const ProfileResume = ({
//   workExperiences,
//   setWorkExperiences,
//   educations,
//   setEducations,
// }: {
//   workExperiences: WorkExperience[];
//   setWorkExperiences: (workExperiences: WorkExperience[]) => void;
//   educations: Education[];
//   setEducations: (educations: Education[]) => void;
// }) => {
//   // ----- Resume / File -----
//   const [loadingPdf, setLoadingPdf] = useState(false);
//   const [showConfirmModal, setShowConfirmModal] = useState(false);
//   const [readingLoading, setReadingLoading] = useState(false);

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

//   const handleChangeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
//     e.preventDefault();
//     setLoadingPdf(true);
//     const selected = e.target.files?.[0];
//     if (!selected) return;

//     if (selected.size > MAX_FILE_SIZE) {
//       alert("File size is too large");
//       setLoadingPdf(false);
//       return;
//     }

//     readPdf(selected)
//       .catch((err) => {
//         console.error(err);
//         alert("Failed to read file");
//       })
//       .finally(() => {
//         setLoadingPdf(false);
//       });

//     setFileName(selected.name);
//     setFileSize(selected.size);

//     setFiles(selected);
//     setIsFileChanged(true);
//   };

//   const readPdf = async (file: File) => {
//     const formData = new FormData();
//     formData.append("file", file);

//     const response = await fetch("/api/pdf", {
//       method: "POST",
//       body: formData,
//     });

//     if (!response.ok) {
//       throw new Error("Failed to extract text");
//     }

//     const data = await response.json();
//     logger.log("--- Extracted Text (Client Side) ---");
//     logger.log(data.text.slice(0, 100), data.text.length);
//     setResumeText(data.text);

//     if (
//       educations.every(
//         (edu) =>
//           edu.school === "" &&
//           edu.major === "" &&
//           edu.startDate === "" &&
//           edu.endDate === "" &&
//           edu.degree === "" &&
//           edu.gpa === ""
//       ) &&
//       workExperiences.every(
//         (exp) =>
//           exp.company === "" &&
//           exp.position === "" &&
//           exp.startDate === "" &&
//           exp.endDate === "" &&
//           exp.description === ""
//       )
//     ) {
//     } else setShowConfirmModal(true);
//   };

//   // ----- Work Experience -----
//   const addWorkExperience = () => {
//     const newWorkExperiences = [
//       ...workExperiences,
//       {
//         company: "",
//         position: "",
//         startDate: "",
//         endDate: "",
//         description: "",
//       },
//     ];
//     setWorkExperiences(newWorkExperiences);
//   };

//   const updateWorkExperience = (
//     index: number,
//     field: "company" | "position" | "startDate" | "endDate" | "description",
//     value: string
//   ) => {
//     const newWorkExperiences = workExperiences.map((exp, i) =>
//       i === index ? { ...exp, [field]: value } : exp
//     );
//     setWorkExperiences(newWorkExperiences);
//   };

//   const removeWorkExperience = (index: number) => {
//     const newWorkExperiences = workExperiences.filter((_, i) => i !== index);
//     setWorkExperiences(newWorkExperiences);
//   };

//   // ----- Education -----
//   const addEducation = () => {
//     const newEducations = [
//       ...educations,
//       {
//         school: "",
//         major: "",
//         startDate: "",
//         endDate: "",
//         degree: "",
//         gpa: "",
//       },
//     ];
//     setEducations(newEducations);
//   };

//   const updateEducation = (
//     index: number,
//     field: keyof Education,
//     value: string
//   ) => {
//     const newEducations = educations.map((edu, i) =>
//       i === index ? { ...edu, [field]: value } : edu
//     );
//     setEducations(newEducations);
//   };

//   const removeEducation = (index: number) => {
//     const newEducations = educations.filter((_, i) => i !== index);
//     setEducations(newEducations);
//   };

//   const addContentFromResume = async () => {
//     setShowConfirmModal(false);
//     setReadingLoading(true);
//     const result = await extractResumeInfo(resumeText);
//     try {
//       logger.log("addContentFromResume", result);
//       setEducations(result.education);
//       setWorkExperiences(result.workExperiences);
//     } catch (error) {
//       console.error("addContentFromResume", error);
//     } finally {
//       setReadingLoading(false);
//     }
//     setReadingLoading(false);
//   };

//   return (
//     <div className="w-full">
//       {showConfirmModal && (
//         <ConfirmModal
//           open={showConfirmModal}
//           onClose={() => setShowConfirmModal(false)}
//           onConfirm={() => addContentFromResume()}
//           confirmLabel="예, 자동 채우기"
//           cancelLabel="아니오"
//           title="이력서에 기반해 자동으로 아래 내용을 채우시겠습니까?"
//           description="작성하신 내역이 있다면 지워질 수 있습니다."
//         />
//       )}
//       {/* Resume Upload */}
//       <SectionLayout>
//         {/* <button onClick={() => addContentFromResume()}>자동 채우기</button> */}
//         <div>
//           <input
//             onChange={handleChangeFile}
//             id="resume-upload"
//             type="file"
//             className="hidden"
//             accept="
//         application/pdf,
//         application/msword,
//         application/vnd.openxmlformats-officedocument.wordprocessingml.document,
//         .pdf,
//       "
//           />
//           <label
//             htmlFor="resume-upload"
//             className={`
//   cursor-pointer flex flex-col items-center justify-center gap-2
//   w-full py-12 px-4
//   border rounded-[6px]
//   ${
//     fileName
//       ? "border-[1.6px] border-brightnavy bg-white hover:bg-xlightgray"
//       : "border-dashed border-xgray300 bg-xlightgray hover:bg-[rgb(242,242,244)] "
//   }
// `}
//           >
//             <div className="flex-wrap w-fit p-3 bg-white rounded-full border border-xgray300">
//               {loadingPdf || readingLoading ? (
//                 <Loader2 size={20} strokeWidth={1.6} className="animate-spin" />
//               ) : (
//                 <>
//                   {!loadingPdf && fileName ? (
//                     <FileText size={20} strokeWidth={1.6} />
//                   ) : (
//                     <Upload size={20} strokeWidth={1.6} />
//                   )}
//                 </>
//               )}
//             </div>

//             <div className="text-[14px] mt-1">
//               {fileName
//                 ? fileName
//                 : "Click or Drag & drop to upload Resume (Only pdf)"}
//             </div>

//             <div className="text-[12px] font-light text-xgray500 text-center">
//               주민등록번호, 주소 등 민감한 정보는 제거해주세요. 업로드된 파일은
//               채용 검토 목적 외에는 사용되지 않습니다.
//               <br />
//               권장 파일 형식은 PDF이며, 최대 용량은 10MB입니다.
//             </div>
//           </label>
//         </div>
//         <div className="text-[12px] font-light text-xgray500">
//           Uploading a new resume will also update the resume on your profile.
//           <br />
//           By uploading your resume, you agree to our Terms and Conditions and
//           Privacy Policy.
//           <br />
//           We will not share your resume with any third parties.
//         </div>
//       </SectionLayout>

//       {/* Education */}
//       <SectionLayout>
//         <div className="flex flex-row items-center justify-between mb-2">
//           <div className="text-[14px] font-medium">Education</div>
//         </div>

//         <div className="flex flex-col gap-4">
//           {educations.map((edu, index) => (
//             <div key={index} className="w-full flex flex-col gap-3 bg-white">
//               {/* header */}
//               <div className="flex flex-row items-center justify-between">
//                 <div className="text-[13px] font-medium text-xgray700">
//                   학력 {index + 1}
//                 </div>
//                 {educations.length > 1 && (
//                   <button
//                     type="button"
//                     onClick={() => removeEducation(index)}
//                     className="text-sm text-xgray500 hover:text-red-500"
//                   >
//                     삭제
//                   </button>
//                 )}
//               </div>

//               {/* 학교 / 전공 */}
//               <div className="flex flex-row gap-4 w-full">
//                 <Input
//                   label="학교"
//                   value={edu.school}
//                   onChange={(e) =>
//                     updateEducation(index, "school", e.target.value)
//                   }
//                   placeholder=""
//                 />
//                 <Input
//                   label="전공"
//                   value={edu.major}
//                   onChange={(e) =>
//                     updateEducation(index, "major", e.target.value)
//                   }
//                   placeholder="컴퓨터과학"
//                 />
//               </div>

//               {/* 입학 / 졸업 */}
//               <div className="flex flex-row gap-4 w-full">
//                 <Input
//                   label="입학"
//                   value={edu.startDate}
//                   onChange={(e) =>
//                     updateEducation(index, "startDate", e.target.value)
//                   }
//                   placeholder="2020.03"
//                 />
//                 <Input
//                   label="졸업"
//                   noneText="재학중"
//                   value={edu.endDate}
//                   onChange={(e) =>
//                     updateEducation(index, "endDate", e.target.value)
//                   }
//                   placeholder="2024.02"
//                 />
//               </div>

//               {/* 학위 / 학점 */}
//               <div className="flex flex-row gap-4 w-full">
//                 <Input
//                   label="학위"
//                   value={edu.degree}
//                   onChange={(e) =>
//                     updateEducation(index, "degree", e.target.value)
//                   }
//                   placeholder="학사"
//                 />
//                 <Input
//                   label="학점"
//                   value={edu.gpa}
//                   onChange={(e) =>
//                     updateEducation(index, "gpa", e.target.value)
//                   }
//                   placeholder="N/4.3"
//                 />
//               </div>
//             </div>
//           ))}

//           <div className="flex flex-row items-center justify-start">
//             <button
//               type="button"
//               onClick={addEducation}
//               className="text-sm px-3 py-1.5 text-brightnavy rounded-[5px] hover:bg-xlightgray"
//             >
//               + 학력 추가
//             </button>
//           </div>
//         </div>
//       </SectionLayout>

//       {/* Work Experience */}
//       <SectionLayout>
//         <div className="flex flex-row items-center justify-between mb-2">
//           <div className="text-[14px] font-medium">Work Experience</div>
//         </div>

//         <div className="flex flex-col gap-4">
//           {workExperiences.map((exp, index) => (
//             <div key={index} className="w-full flex flex-col gap-3 bg-white">
//               <div className="flex flex-row items-center justify-between">
//                 <div className="text-[13px] font-medium text-xgray700">
//                   경력 {index + 1}
//                 </div>
//                 <button
//                   type="button"
//                   onClick={() => removeWorkExperience(index)}
//                   className="text-sm text-xgray500 hover:text-red-500"
//                 >
//                   삭제
//                 </button>
//               </div>

//               <div className="flex flex-row gap-4 w-full">
//                 <Input
//                   label="회사"
//                   value={exp.company}
//                   onChange={(e) =>
//                     updateWorkExperience(index, "company", e.target.value)
//                   }
//                   placeholder="회사명"
//                 />
//                 <Input
//                   label="직무"
//                   value={exp.position}
//                   onChange={(e) =>
//                     updateWorkExperience(index, "position", e.target.value)
//                   }
//                   placeholder="예: ML Engineer"
//                 />
//               </div>

//               <div className="flex flex-row gap-4 w-full">
//                 <Input
//                   label="입사"
//                   value={exp.startDate}
//                   onChange={(e) =>
//                     updateWorkExperience(index, "startDate", e.target.value)
//                   }
//                   placeholder="2022.03"
//                 />
//                 <Input
//                   label="퇴사"
//                   noneText="재직중"
//                   value={exp.endDate}
//                   onChange={(e) =>
//                     updateWorkExperience(index, "endDate", e.target.value)
//                   }
//                   placeholder="2024.02"
//                 />
//               </div>

//               <div className="flex flex-col gap-1 w-full">
//                 <div className="flex flex-row justify-between items-center">
//                   <div className="text-[14px] font-medium">
//                     담당 업무 / 성과
//                   </div>
//                 </div>
//                 <textarea
//                   placeholder="담당했던 일, 성과, 사용 기술 등을 간단히 적어주세요."
//                   className="w-full min-h-[80px] px-3 py-2 border border-xgray400 rounded-[5px] text-[13px] font-normal leading-5 focus:ring-1 focus:ring-brightnavy outline-none resize-y"
//                   value={exp.description}
//                   onChange={(e) =>
//                     updateWorkExperience(index, "description", e.target.value)
//                   }
//                 />
//               </div>
//             </div>
//           ))}
//           <div className="flex flex-row items-center justify-start">
//             <button
//               type="button"
//               onClick={addWorkExperience}
//               className="text-sm px-3 py-1.5 text-brightnavy rounded-[5px] hover:bg-xlightgray"
//             >
//               + 업무경험 추가
//             </button>
//           </div>
//         </div>
//       </SectionLayout>
//     </div>
//   );
// };

// export default React.memo(ProfileResume);

// const SectionLayout = ({ children }: { children: React.ReactNode }) => {
//   return (
//     <div className="flex flex-col gap-2 border-t border-xgray400 pt-8 mt-8">
//       {children}
//     </div>
//   );
// };

// const Input = ({
//   label,
//   value,
//   onChange,
//   placeholder,
//   noneText,
// }: {
//   label: string;
//   value: string;
//   onChange: (e: any) => void;
//   placeholder: string;
//   noneText?: string;
// }) => {
//   return (
//     <div className="flex flex-col gap-1 w-full">
//       <div className="flex flex-row justify-between items-center">
//         <div className="text-[14px] font-medium">{label}</div>
//         {noneText && (
//           <div
//             onClick={() => {
//               if (value === "default") {
//                 onChange({ target: { value: "" } });
//               } else {
//                 onChange({ target: { value: "default" } });
//               }
//             }}
//             className="flex flex-row items-center gap-1.5 text-[12px] font-normal text-xgray700 cursor-pointer"
//           >
//             <div
//               className={`w-[14px] h-[14px] border border-xgray400 rounded-[3px] mt-[1px] ${
//                 value === "default" ? "bg-brightnavy" : "bg-white"
//               }`}
//             />
//             {noneText}
//           </div>
//         )}
//       </div>
//       {value !== "default" ? (
//         <input
//           disabled={value === "default"}
//           placeholder={placeholder}
//           className="w-full h-[36px] px-3 py-2 border border-xgray400 rounded-[5px] text-[13px] font-normal leading-5 focus:ring-1 focus:ring-brightnavy outline-none"
//           value={value}
//           onChange={onChange}
//         />
//       ) : (
//         <div className="w-full h-[36px] px-3 py-2 border text-xgray700 border-xgray400 bg-xlightgray rounded-[5px] text-[13px] font-normal leading-5">
//           {noneText}
//         </div>
//       )}
//     </div>
//   );
// };
