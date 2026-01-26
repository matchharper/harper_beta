// pages/auth/callback.tsx
import { useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "@/lib/supabase";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;

    (async () => {
      // 1) 여기서 getSession() 호출하면, supabase-js가 URL에 붙은 code를 처리해서 세션을 잡는 경우가 많음
      const { data: sessionData } = await supabase.auth.getSession();

      // 2) 유저 정보 읽기
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      const user = userData?.user;

      if (userErr || !user) {
        router.replace("/login?error=no_user");
        return;
      }

      // 3) company_users upsert (RLS 정책 + user_id unique 전제)
      const payload = {
        user_id: user.id,
        email: user.email ?? null,
        name:
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          "Anonymous",
        profile_picture: user.user_metadata?.avatar_url ?? null,
      };

      const { data, error } = await supabase
        .from("company_users")
        .upsert(payload, { onConflict: "user_id" });

      await useCompanyUserStore.getState().load(user.id);

      if (error) {
        console.error("upsert error:", error);
        router.replace("/login?error=profile_upsert_failed");
        return;
      }

      // 4) 완료 후 이동
      router.replace("/invitation");
    })();
  }, [router.isReady]);

  return null;
}
