// app/api/tts/route.ts
import { ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID } from "@/utils/constantkeys";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const apiKey = ELEVENLABS_API_KEY;
    const voiceId = ELEVENLABS_VOICE_ID;

    if (!apiKey || !voiceId) {
      return NextResponse.json(
        { error: "ELEVENLABS_API_KEY or VOICE_ID is missing" },
        { status: 500 }
      );
    }

    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          // You can tweak these settings as you like
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            speed: 1.15,
          },
        }),
      }
    );

    if (!elevenRes.ok) {
      const errText = await elevenRes.text();
      console.error("ElevenLabs error:", errText);
      return NextResponse.json(
        { error: "Failed to call ElevenLabs TTS" },
        { status: 500 }
      );
    }

    const audioArrayBuffer = await elevenRes.arrayBuffer();

    return new NextResponse(audioArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg", // ElevenLabs default is mp3
        "Content-Length": String(audioArrayBuffer.byteLength),
      },
    });
  } catch (err) {
    console.error("TTS route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
