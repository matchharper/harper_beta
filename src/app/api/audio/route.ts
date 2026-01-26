import { NextResponse } from "next/server";

type VoiceRequestBody = {
  audio: string;
};

type VoiceResponseBody = {
  transcript: string;
  reply: string;
  audioBase64: string;
};

export async function POST(req: Request) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 500 });
  }

  const body = await req.json();
  const audio = body.audio;

  if (!audio) {
    return NextResponse.json({ error: "Missing audio" }, { status: 500 });
  }

  try {
    // 1) Decode audio base64 to Buffer
    const audioBuffer = Buffer.from(audio, "base64");

    // 2) Deepgram STT
    const dgRes = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2",
      {
        method: "POST",
        headers: {
          Authorization: `Token `,
          // Adjust content-type to match your actual format/sample rate
          "Content-Type": "audio/l16; rate=16000; channels=1",
        },
        body: audioBuffer,
      }
    );

    if (!dgRes.ok) {
      const text = await dgRes.text();
      console.error("Deepgram error:", text);
      return NextResponse.json(
        { error: "Deepgram STT failed" },
        { status: 500 }
      );
    }

    const dgJson: any = await dgRes.json();
    const transcript: string =
      dgJson?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";

    if (!transcript) {
      return NextResponse.json(
        {
          transcript: "",
          reply: "",
          audioBase64: "",
        },
        { status: 200 }
      );
    }

    // 3) GPT: generate reply
    const openaiRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [
            {
              role: "system",
              content:
                "You are Harper, a friendly recruiting assistant. Answer concisely.",
            },
            {
              role: "user",
              content: transcript,
            },
          ],
        }),
      }
    );

    if (!openaiRes.ok) {
      const text = await openaiRes.text();
      console.error("OpenAI error:", text);
      return NextResponse.json(
        { error: "OpenAI request failed" },
        { status: 500 }
      );
    }

    const openaiJson: any = await openaiRes.json();
    const reply: string =
      openaiJson?.choices?.[0]?.message?.content?.trim() ?? "";

    // 4) ElevenLabs TTS
    const voiceId = process.env.ELEVENLABS_VOICE_ID;
    if (!voiceId) {
      throw new Error("ELEVENLABS_VOICE_ID is not set");
    }

    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY || "",
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: reply,
          model_id: "eleven_turbo_v2", // or your preferred model
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.9,
          },
        }),
      }
    );

    if (!ttsRes.ok) {
      const text = await ttsRes.text();
      console.error("ElevenLabs error:", text);
      return NextResponse.json(
        { error: "ElevenLabs TTS failed" },
        { status: 500 }
      );
    }

    const ttsArrayBuffer = await ttsRes.arrayBuffer();
    const audioBase64 = Buffer.from(ttsArrayBuffer).toString("base64");

    return NextResponse.json(
      {
        transcript,
        reply,
        audioBase64,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Voice API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
