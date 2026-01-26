// import Appbar from "@/components/Appbar";
// import { ChevronsLeft, FileText, Loader2, Upload } from "lucide-react";
// import React, { useEffect, useState } from "react";
// import Image from "next/image";
// import { useUserProfile } from "@/states/useUserProfile";
// import { useUploadProfile } from "@/states/useUploadProfile";

// const MAX_FILE_SIZE = 15 * 1024 * 1024; // 10MB

// const Apply = () => {
//   const [page, setPage] = useState(1);
//   const [name, setName] = useState("");
//   const [email, setEmail] = useState("");
//   const [phone, setPhone] = useState("");
//   const [location, setLocation] = useState("");
//   const [loadingPdf, setLoadingPdf] = useState(false);
//   const [resumeIdState, setResumeIdState] = useState("");
//   const [resumeText, setResumeText] = useState("");

//   const [links, setLinks] = useState<string[]>(["", "", ""]);

//   const [files, setFiles] = useState<File | null>(null);
//   const [isFileChanged, setIsFileChanged] = useState(false);

//   const [fileName, setFileName] = useState("");
//   const [fileSize, setFileSize] = useState(0);

//   const userId =
//     typeof window !== "undefined" ? localStorage.getItem("userId") : null;
//   const { data: userProfile, isLoading: isUserProfileLoading } =
//     useUserProfile(userId);

//   const uploadProfileMutation = useUploadProfile();

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
//     setLocation(userProfile.location ?? "");
//     setResumeIdState(userProfile.resume_id ?? "");

//     const parsed = classifyLinks(userProfile.links);
//     setLinks(parsed);

//     if (userProfile.resumes && userProfile.resumes.length > 0) {
//       const latestResume = userProfile.resumes[0];
//       setResumeText(latestResume.resume_text ?? "");
//       setFileName(latestResume.file_name ?? "");
//       setFileSize(latestResume.file_size ?? 0);
//     }
//   }, [userProfile]);

//   const handleChangeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
//     e.preventDefault();
//     setLoadingPdf(true);
//     const selected = e.target.files?.[0];
//     if (!selected) return;

//     if (selected.size > MAX_FILE_SIZE) {
//       alert("File size is too large");
//       return;
//     }

//     logger.log(selected);
//     readPdf(selected);
//     setFileName(selected.name);
//     setFileSize(selected.size);

//     setFiles(selected);
//     setIsFileChanged(true);
//     setLoadingPdf(false);
//   };

//   const readPdf = async (file: File) => {
//     const formData = new FormData();
//     formData.append("file", file);

//     // 2. API Route로 전송
//     const response = await fetch("/api/pdf", {
//       method: "POST",
//       body: formData,
//     });

//     if (!response.ok) {
//       throw new Error("Failed to extract text");
//     }

//     const data = await response.json();
//     logger.log("--- Extracted Text (Client Side) ---");
//     logger.log(data.text.slice(0, 100), data.length);
//     setResumeText(data.text);

//     // 내용 뽑아달라고 하기

//     // const result = await askGpt(data.text);
//     // logger.log("result ", result);
//   };

//   const handleChangeLink = (index: number, value: string) => {
//     setLinks((prev) => prev.map((link, i) => (i === index ? value : link)));
//   };

//   const handleSubmitAndNExt = async () => {
//     uploadProfileMutation.mutate({
//       name,
//       email,
//       phone,
//       country: location,
//       city: location,
//       open_opportunities: [],
//       workExperiences: [],
//       educations: [],
//       links,
//       files,
//       isFileChanged,
//       resumeText,
//       resumeIdState,
//     });
//   };
//   return (
//     <main className="min-h-screen bg-white text-black px-4 pt-24 flex flex-col md:flex-row items-start justify-center gap-8 lg:gap-[48px]">
//       <Appbar />
//       <div className="w-[418px]">
//         <div className="flex flex-col px-5 pt-4 pb-12 border border-xgray300 rounded-[8px] gap-4">
//           <div className="flex flex-row items-center gap-1 font-light text-brightnavy text-[14px]">
//             <ChevronsLeft size={20} strokeWidth={1} />
//             <div>Back</div>
//           </div>
//           <div className="text-xl font-medium mt-2">ML Pipeline Engineer</div>
//           <div className="flex flex-col gap-2">
//             {PageRoutings.map((item, index) => (
//               <div
//                 key={index}
//                 className={`flex flex-row rounded-[6px] py-4 px-2 gap-1 hover:bg-xlightgray cursor-pointer ${
//                   page === index ? "bg-xlightgray" : ""
//                 }`}
//                 onClick={() => setPage(index)}
//               >
//                 <div className="flex items-center text-xl font-semibold pl-1 pr-3 text-brightnavy">
//                   {index + 1}
//                 </div>
//                 <div>
//                   <div className="font-medium text-[15px]">{item.title}</div>
//                   <div className="text-xgray500 text-[12px] font-light">
//                     {item.description}
//                   </div>
//                 </div>
//               </div>
//             ))}
//           </div>
//         </div>
//         <button
//           onClick={() => handleSubmitAndNExt()}
//           disabled={uploadProfileMutation.isPending}
//           className="hover:opacity-90 mt-6 cursor-pointer text-white bg-brightnavy w-full h-[38px] px-3 py-2 rounded-[6px] text-[14px] font-light leading-5"
//         >
//           {uploadProfileMutation.isPending ? "저장 중..." : "다음으로"}
//         </button>
//       </div>
//       <div className="flex flex-col w-full lg:w-[64%]">
//         <div className="text-2xl font-semibold">Profile Setup</div>
//         <SectionLayout>
//           <div className="text-xl font-bold">이력서 제출</div>
//           <div className="text-xgray600 text-[14px] font-light">
//             지원 절차를 시작하기 위해 이력서를 업로드해주세요. 이력서를 제출하면
//             자동으로 아래의 항목들이 채워집니다.
//           </div>
//           <div>
//             <input
//               onChange={handleChangeFile}
//               id="resume-upload"
//               type="file"
//               className="hidden"
//               accept="
//                 application/pdf,
//                 application/msword,
//                 application/vnd.openxmlformats-officedocument.wordprocessingml.document,
//                 .pdf,
//               "
//             />
//             <label
//               htmlFor="resume-upload"
//               className={`
//           cursor-pointer flex flex-col items-center justify-center gap-2
//           w-full py-12 px-4
//           border rounded-[6px]
//           ${
//             fileName
//               ? "border-[1.6px] border-brightnavy bg-white hover:bg-xlightgray"
//               : "border-dashed border-xgray300 bg-xlightgray hover:bg-[rgb(242,242,244)] "
//           }
//         `}
//             >
//               <div className="flex-wrap w-fit p-3 bg-white rounded-full border border-xgray300">
//                 {loadingPdf && <Loader2 size={20} strokeWidth={1.6} />}
//                 {!loadingPdf && fileName ? (
//                   <FileText size={20} strokeWidth={1.6} />
//                 ) : (
//                   <Upload size={20} strokeWidth={1.6} />
//                 )}
//               </div>

//               <div className="text-[14px] mt-1">
//                 {fileName
//                   ? fileName
//                   : "Click or Drag & drop to upload Resume (Only pdf)"}
//               </div>

//               <div className="text-[12px] font-light text-xgray500 text-center">
//                 주민등록번호, 주소 등 민감한 정보는 제거해주세요. 업로드된
//                 파일은 채용 검토 목적 외에는 사용되지 않습니다.
//                 <br />
//                 권장 파일 형식은 PDF이며, 최대 용량은 10MB입니다.
//               </div>
//             </label>
//           </div>
//           <div className="text-[12px] font-light text-xgray500">
//             Uploading a new resume will also update the resume on your profile.
//             <br />
//             By uploading your resume, you agree to our Terms and
//             Conditions and Privacy Policy.
//             <br />
//             We will not share your resume with any third parties.
//           </div>
//         </SectionLayout>
//         <SectionLayout>
//           <Input
//             label="이름"
//             value={name}
//             onChange={(e) => setName(e.target.value)}
//             placeholder="이름을 입력해주세요."
//           />
//           <div className="flex flex-row gap-4 w-full">
//             <Input
//               label="이메일"
//               value={email}
//               onChange={(e) => setEmail(e.target.value)}
//               placeholder="Example@gmail.com"
//             />
//             <Input
//               label="전화번호"
//               value={phone}
//               onChange={(e) => setPhone(e.target.value)}
//               placeholder="010-1234-5678"
//             />
//           </div>
//           <Input
//             label="거주지역"
//             value={location}
//             onChange={(e) => setLocation(e.target.value)}
//             placeholder="현재 거주하시는 국가 및 도시를 입력해주세요."
//           />
//           <div></div>
//         </SectionLayout>
//         <SectionLayout>
//           <div className="text-2xl font-semibold">Links</div>
//           <div className="flex flex-col gap-4">
//             <LinkInput
//               label="Github"
//               value={links[0]}
//               onChange={(e) => handleChangeLink(0, e.target.value)}
//               placeholder="https://github.com/username"
//               imgSrc="/svgs/github.svg"
//             />
//             <LinkInput
//               label="LinkedIn"
//               value={links[1]}
//               onChange={(e) => handleChangeLink(1, e.target.value)}
//               placeholder="https://linkedin.com/in/username"
//               imgSrc="/svgs/linkedin.svg"
//             />
//             <LinkInput
//               label="Google Scholar"
//               value={links[2]}
//               onChange={(e) => handleChangeLink(2, e.target.value)}
//               placeholder="https://scholar.google.com/citations?user=1234567890"
//               imgSrc="/svgs/scholar.svg"
//             />
//             {links.length > 3 && (
//               <LinkInput
//                 label="Personal site"
//                 value={links[3]}
//                 onChange={(e) => handleChangeLink(3, e.target.value)}
//                 placeholder="https://"
//                 imgSrc="/svgs/house.svg"
//               />
//             )}
//             <div>Other</div>
//           </div>
//         </SectionLayout>
//       </div>
//     </main>
//   );
// };

// export default Apply;

// const PageRoutings = [
//   {
//     title: "Set your profile",
//     description: "Upload Resume and set your information and preference",
//   },
//   {
//     title: "AI Interview",
//     description: "Upload Resume and set your information and preference",
//   },
//   {
//     title: "Additional Requirements",
//     description: "Upload Resume and set your information and preference",
//   },
// ];

// const SectionLayout = ({ children }: { children: React.ReactNode }) => {
//   return (
//     <div className="flex flex-col mt-8 pt-8 gap-4 border-t border-xgray400">
//       {children}
//     </div>
//   );
// };

// const Input = ({
//   label,
//   value,
//   onChange,
//   placeholder,
// }: {
//   label: string;
//   value: string;
//   onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
//   placeholder: string;
// }) => {
//   return (
//     <div className="flex flex-col gap-1 w-full">
//       <div className="text-[14px] font-medium">{label}</div>
//       <input
//         placeholder={placeholder}
//         className="w-full h-[36px] px-3 py-2 border border-xgray400 rounded-[5px] text-[13px] font-light leading-5 focus:ring-1 focus:ring-brightnavy outline-none"
//         value={value}
//         onChange={onChange}
//       />
//     </div>
//   );
// };

// const LinkInput = ({
//   label,
//   value,
//   onChange,
//   placeholder,
//   imgSrc,
// }: {
//   label: string;
//   value: string;
//   onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
//   placeholder: string;
//   imgSrc: string;
// }) => {
//   return (
//     <div className="flex flex-row w-full justify-between items-center">
//       <div className="text-[15px] font-medium w-1/3 flex flex-row items-center gap-2">
//         <Image src={imgSrc} alt={label} width={16} height={16} />
//         <div>{label}</div>
//       </div>
//       <input
//         placeholder={placeholder}
//         className="w-full h-[36px] px-3 py-2 border border-xgray400 rounded-[5px] text-[14px] font-light leading-5 focus:ring-1 focus:ring-brightnavy outline-none"
//         value={value}
//         onChange={onChange}
//       />
//     </div>
//   );
// };

import React from "react";

const Apply = () => {
  return <div>Apply</div>;
};

export default Apply;
