import { NextRequest, NextResponse } from "next/server";
// @ts-ignore: pdf2json은 타입 정의가 엄격하지 않아 ignore 처리하는 것이 속 편합니다.
import pdf from "pdf-parse-fork";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // 1. 파일을 Buffer로 변환
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const data = await pdf(buffer);

    // 4. 결과 출력
    // logger.log("--- PDF 메타데이터 ---");
    // logger.log(`페이지 수: ${data.numpages}`);
    // logger.log(`정보: ${JSON.stringify(data.info, null, 2)}`);

    // logger.log("\n--- 텍스트 내용 ---");
    // 공백 정리 (선택사항)
    const parsedText = data.text.trim();

    return NextResponse.json({ text: parsedText });
  } catch (error) {
    console.error("PDF 처리 중 에러:", error);
    return NextResponse.json({ error: "PDF 파싱 실패" }, { status: 500 });
  }
}
