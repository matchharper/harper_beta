import { NextResponse } from "next/server";
// import { createClient } from "@deepgram/sdk";

// const deepgram = createClient("");

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

    // 2) Deepgram에 raw linear16 + sample_rate 명시
    // const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
    //   audioBuffer,
    //   {
    //     model: "nova-3",
    //     smart_format: true,
    //     language: "ko",
    //     encoding: "linear16",
    //     sample_rate: 16000,
    //     channels: 1,
    //   }
    // );
    // const transcript =
    //   result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;

    // logger.log(
    //   "result",
    //   result?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs
    // );
    // logger.log("transcript", transcript);
    // logger.log("error", error);

    return NextResponse.json(
      {
        transcript: "",
        error: "",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
