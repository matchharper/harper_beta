import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-realtime-preview",
          voice: "alloy",
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("[STT Token] OpenAI ephemeral token error:", errText);
      return NextResponse.json(
        { error: "Failed to create ephemeral token" },
        { status: 500 }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      token: data.client_secret?.value ?? data.client_secret,
      expiresAt: data.expires_at ?? Date.now() + 60_000,
    });
  } catch (err) {
    console.error("[STT Token] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
