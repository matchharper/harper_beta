import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const lid = url.searchParams.get("lid");

  console.log("\n\n 호출 👻 lid : ", lid);

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }
  if (lid) {
    const { data } = await supabase.auth.getUser();
    console.log("\n\n 🐙 data : ", data);
    const email = data.user?.email;
    if (email) {
      await supabase.from("landing_logs").insert({
        local_id: lid,
        type: `login_email:${email}`,
        is_mobile: null,
      });
    }
  }

  return NextResponse.redirect(new URL("/auths/callback", url.origin));
}
