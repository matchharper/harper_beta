// // hooks/useUploadProfile.ts
// import { useMutation } from "@tanstack/react-query";
// import { supabase } from "@/lib/supabase";
// import { v4 } from "uuid";
// import router from "next/router";
// import { Education, WorkExperience } from "@/pages/onboard";

// type UploadProfileArgs = {
//   name: string;
//   email: string;
//   phone: string;
//   country: string;
//   city: string;
//   open_opportunities: string[];
//   links: string[];
//   workExperiences: WorkExperience[];
//   files?: File | null;
//   isFileChanged?: boolean;
//   resumeText?: string;
//   resumeIdState?: string;
//   educations: Education[];
// };

// export function useUploadProfile() {
//   return useMutation({
//     mutationFn: async (args: UploadProfileArgs) => {
//       const {
//         name,
//         email,
//         phone,
//         country,
//         city,
//         open_opportunities,
//         links,
//         workExperiences,
//         educations,
//         files,
//         isFileChanged,
//         resumeText,
//         resumeIdState,
//       } = args;

//       let userId = localStorage.getItem("userId");
//       if (!userId) {
//         userId = v4();
//         localStorage.setItem("userId", userId);
//       }

//       let resumeId = resumeIdState;

//       // 1) resume 파일 업로드 + resumes upsert
//       if (files && isFileChanged) {
//         const bucket = "resumes";
//         const fileExt = files.name.split(".").pop();
//         const filePath = `uploads/${Date.now()}.${fileExt}`;

//         const { data, error: uploadError } = await supabase.storage
//           .from(bucket)
//           .upload(filePath, files, {
//             cacheControl: "3600",
//             upsert: false,
//           });

//         if (uploadError) {
//           console.error(uploadError);
//           throw uploadError;
//         }

//         resumeId = data.id;

//         const resumebody = {
//           user_id: userId,
//           resume_id: resumeId,
//           resume_file_link: data.fullPath,
//           file_name: files.name,
//           file_size: files.size,
//           resume_text: resumeText,
//         };

//         const resResume = await supabase.from("resumes").upsert(resumebody);
//         if (resResume.status !== 200 && resResume.status !== 201) {
//           throw new Error("Failed to upload resume");
//         }
//       }

//       // 2) users upsert
//       const body = {
//         user_id: userId,
//         name,
//         email,
//         phone,
//         country,
//         city,
//         open_opportunities,
//         links,
//         resume_id: resumeId,
//         work_experiences: workExperiences,
//         educations: educations,
//       };
//       logger.log("body", body);

//       const resUser = await supabase.from("users").upsert(body);
//       if (resUser.status !== 200 && resUser.status !== 201) {
//         throw new Error("Failed to upload profile");
//       }

//       return { userId, resumeId };
//     },
//     onSuccess: () => {
//       logger.log("upload profile success");
//       // router.push("/call");
//     },
//   });
// }
