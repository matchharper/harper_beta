import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getRequestUser } from "@/lib/supabaseServer";

const MAX_TTS_TEXT_LENGTH = 5000;

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    if (text.length > MAX_TTS_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Text exceeds maximum length of ${MAX_TTS_TEXT_LENGTH}` },
        { status: 400 }
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;

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
          model_id: "eleven_flash_v2_5",
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

      // Fallback to OpenAI TTS
      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const mp3 = await openai.audio.speech.create({
          model: "tts-1",
          voice: "nova",
          input: text,
        });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Length": String(buffer.byteLength),
          },
        });
      } catch (openaiErr) {
        console.error("OpenAI TTS fallback error:", openaiErr);
        return NextResponse.json(
          { error: "All TTS providers failed" },
          { status: 500 }
        );
      }
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
