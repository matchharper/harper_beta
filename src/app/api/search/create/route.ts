import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";
import { searchSourceToQueryType } from "@/lib/searchSource";

export async function POST(req: NextRequest) {
  if (req.method !== "POST")
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });

  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { queryText, type } = body as {
    queryText?: string;
    type?: string | number;
  };
  if (!queryText?.trim())
    return NextResponse.json(
      { error: "Missing queryText" },
      { status: 400 }
    );

  // Ensure a company_user row exists for email/password accounts as well.
  const { error: upsertError } = await supabaseServer
    .from("company_users")
    .upsert(
      {
        user_id: user.id,
        email: user.email ?? null,
        name:
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          "Anonymous",
        profile_picture: user.user_metadata?.avatar_url ?? null,
      },
      { onConflict: "user_id" }
    );

  if (upsertError) {
    return NextResponse.json(
      { error: upsertError.message ?? "Failed to upsert profile" },
      { status: 500 }
    );
  }

  const { data, error } = await supabaseServer
    .from("queries")
    .insert({
      user_id: user.id,
      raw_input_text: queryText.trim(),
      query_keyword: "",
      type: searchSourceToQueryType(type),
    })
    .select("query_id")
    .single();

  if (error || !data)
    return NextResponse.json(
      { error: error?.message ?? "Failed" },
      { status: 500 }
    );

  const { error: messageError } = await supabaseServer.from("messages").insert({
    query_id: data.query_id,
    user_id: user.id,
    role: 0,
    content: queryText.trim(),
  });

  if (messageError)
    return NextResponse.json(
      { error: messageError.message ?? "Failed to insert message" },
      { status: 500 }
    );

  return NextResponse.json({ id: data.query_id }, { status: 200 });
}
