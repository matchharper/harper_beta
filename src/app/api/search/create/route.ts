import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  if (req.method !== "POST")
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });

  const body = await req.json();
  const { userId, queryText } = body as {
    userId?: string;
    queryText?: string;
  };
  if (!userId || !queryText?.trim())
    return NextResponse.json(
      { error: "Missing userId or queryText" },
      { status: 400 }
    );
  const { data, error } = await supabase
    .from("queries")
    .insert({
      user_id: userId,
      raw_input_text: queryText.trim(),
      query_keyword: "",
    })
    .select("query_id")
    .single();

  if (error || !data)
    return NextResponse.json(
      { error: error?.message ?? "Failed" },
      { status: 500 }
    );

  const { error: messageError } = await supabase.from("messages").insert({
    query_id: data.query_id,
    user_id: userId,
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
