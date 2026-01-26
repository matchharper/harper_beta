// // hooks/useUserProfile.ts
// import { useQuery } from "@tanstack/react-query";
// import { supabase } from "@/lib/supabase";

// export function useUserProfile(userId: string | null) {
//   return useQuery({
//     queryKey: ["userProfile", userId],
//     enabled: !!userId, // userId 없으면 자동으로 요청 안 함
//     queryFn: async () => {
//       const { data, error } = await supabase
//         .from("users")
//         .select(
//           `
//           *,
//           resumes:resumes!resumes_user_id_fkey (
//             *,
//             created_at
//           )
//         `
//         )
//         .eq("user_id", userId)
//         .order("created_at", { foreignTable: "resumes", ascending: false })
//         .limit(1, { foreignTable: "resumes" });

//       if (error) throw error;
//       return data?.[0] ?? null; // 한 명만 쓰니까
//     },
//   });
// }
