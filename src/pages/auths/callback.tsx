// pages/auth/callback.tsx
import { useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "@/lib/supabase";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { notifyToSlack } from "@/lib/slack";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;

    (async () => {
      const lid = typeof router.query.lid === "string" ? router.query.lid : "";
      const countryLang =
        typeof router.query.cl === "string" ? router.query.cl : null;
      const abtestType =
        typeof router.query.ab === "string" ? router.query.ab : null;
      const code = typeof router.query.code === "string" ? router.query.code : "";

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          code
        );
        if (exchangeError) {
          console.error("exchangeCodeForSession error:", exchangeError);
        }
      }

      // 1) 여기서 getSession() 호출하면, supabase-js가 URL에 붙은 code를 처리해서 세션을 잡는 경우가 많음
      await supabase.auth.getSession();

      // 2) 유저 정보 읽기
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      const user = userData?.user;

      if (userErr || !user) {
        router.replace("?error=no_user");
        return;
      }

      if (lid && user.email) {
        const { error: loginLogError } = await supabase
          .from("landing_logs")
          .insert({
            local_id: lid,
            type: `login_email:${user.email}`,
            abtest_type: abtestType,
            is_mobile: null,
            country_lang: countryLang,
          });
        if (loginLogError) {
          console.error("login log insert error:", loginLogError);
        }
      }

      const { data: existingCompanyUser, error: existingCompanyUserError } =
        await supabase
          .from("company_users")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();

      if (existingCompanyUserError) {
        console.error("existing company user check error:", existingCompanyUserError);
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
        router.replace("?error=profile_upsert_failed");
        return;
      }

      if (!existingCompanyUserError && !existingCompanyUser) {
        try {
          await notifyToSlack(`🎉 *New Signup*

• *Name*: ${payload.name ?? "Anonymous"}
• *Email*: ${payload.email ?? "N/A"}
• *User ID*: ${user.id}
• *Time(Standard Korea Time)*: ${new Date().toLocaleString("ko-KR")}`);
        } catch (notifyError) {
          console.error("new signup slack notify error:", notifyError);
        }
      }

      // 4) 완료 후 이동
      router.replace("/invitation");
    })();
  }, [router]);

  return null;
}
