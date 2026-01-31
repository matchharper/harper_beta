import { OpenAI } from "openai";
import { logger } from "@/utils/logger";

if (typeof window !== "undefined") {
  throw new Error("llm.ts was bundled into the client!");
}

export enum OpenAIResponse {
  DELTA = "response.output_text.delta",
  DONE = "response.content_part.done",
}

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

export const xaiClient = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  dangerouslyAllowBrowser: true,
  baseURL: "https://api.x.ai/v1",
});

export type OnToken = (token: string) => void;

const pricingTable = {
  "grok-4-fast-reasoning": {
    input: 0.2 / 1_000_000,
    output: 0.5 / 1_000_000,
  },
  "grok-4-fast-non-reasoning": {
    input: 0.2 / 1_000_000,
    output: 0.5 / 1_000_000,
  },
  "gpt-5-mini": {
    input: 0.25 / 1_000_000,
    output: 2 / 1_000_000,
  },
  "gemini-3-flash-preview": {
    input: 0.5 / 1_000_000,
    output: 3 / 1_000_000,
  },
};

export const xaiInference = async (
  model: "grok-4-fast-reasoning" | "grok-4-fast-non-reasoning" | "gpt-5-mini",
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7,
  max_retries: number = 1,
  is_json: boolean = false,
  prompt_cache_key: string = ""
): Promise<string> => {
  const response = await xaiClient.chat.completions.create({
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: temperature,
    prompt_cache_key: prompt_cache_key,
  });
  const content = response.choices[0]?.message?.content;

  const usage = response.usage ?? {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  // grok-4-fast pricing (USD)
  const inputTokenPrice = pricingTable[model].input;
  const outputTokenPrice = pricingTable[model].output;

  const cost =
    usage.prompt_tokens * inputTokenPrice +
    usage.completion_tokens * outputTokenPrice +
    (usage.completion_tokens_details?.reasoning_tokens ?? 0) * outputTokenPrice;

  // logger.log("cost ", cost * 1450, "원");

  return content ?? "";
};

import { GoogleGenAI, ThinkingLevel } from "@google/genai";
const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function openaiInference({
  model,
  systemPrompt,
  userPrompt,
  temperature
}: {
  model: "gpt-4.1-mini" | "gpt-4.1-nano" | "gpt-5-mini" | "gpt-5.2";
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
}): Promise<string> {
  console.log("openaiInference", model, temperature);

  const response = await client.chat.completions.create({
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: temperature,
  });

  return response?.choices?.[0]?.message?.content ?? "";
}

export async function geminiInference(
  model: "gemini-3-flash-preview",
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7,
  thinkingLevel: ThinkingLevel = ThinkingLevel.LOW
): Promise<string | object> {
  const response = await xaiInference("grok-4-fast-reasoning", systemPrompt, userPrompt, temperature, 1, false, "geminiInferenceError");
  return response;

  try {
    const response = await gemini.models.generateContent({
      model: model,
      contents: systemPrompt + "\n\n" + userPrompt,
      config: {
        thinkingConfig: {
          thinkingLevel: thinkingLevel,
        },
        temperature: temperature,
      },
    });
    // logger.log("response ", response);
    // logger.log("response ", response.usageMetadata?.promptTokensDetails);

    const cost =
      (response.usageMetadata?.promptTokenCount ?? 0) *
      pricingTable[model].input +
      (response.usageMetadata?.candidatesTokenCount ?? 0) *
      pricingTable[model].output;

    logger.log("[GEMINI] cost ", cost * 1450, "원");

    const text = response?.text?.trim()?.replace(/^```\w*\s*/, "")?.replace(/\s*```$/, "")?.trim() ?? "";
    if (text.length === 0) {
      throw new Error("Gemini inference returned empty text");
    }
    return text;
  } catch (e) {
    logger.log("🚨 geminiInference error:", e, "\nSo, use openai instead.");
    // await supabase.from("landing_logs").insert({
    //   type: JSON.stringify(e),
    // });
    const response = await xaiInference("grok-4-fast-reasoning", systemPrompt, userPrompt, temperature, 1, false, "geminiInferenceError");
    return response;

    // const response = await openaiInference({
    //   model: "gpt-5.2",
    //   systemPrompt: systemPrompt,
    //   userPrompt: userPrompt,
    //   temperature: temperature,
    // });
    // return response;
  }
}

const inference = async (
  model: "gpt-4.1-nano" | "gpt-4.1-mini",
  systemPrompt: string,
  userPrompt: string
): Promise<string> => {
  const response = await client.chat.completions.create({
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  logger.log("response ", response.usage);

  const content = response.choices[0]?.message?.content;
  return content ?? "";
};

export const makeQuestion = async (
  conversationHistory: string,
  userInfo: string,
  resumeText: string
): Promise<string> => {
  logger.log("conversationHistory", conversationHistory);
  logger.log("userInfo", userInfo);
  logger.log("resumeText", resumeText);

  const userPrompt = `
헤드헌터라고 생각하고, 이 사람이 원하는 것, 어떤 회사랑 매칭시켜주면 좋을지를 알아내기 위해 대화를 하고있어. 질문과 답변을 고려해서 필요한 추가질문이 있으면 해도 돼. 없으면 일단 이 순서를 따라해도 돼.

그리고 만약 다음에 해야하는 질문에 대한 답이 이전에 답변으로 나온 적이 있으면 질문을 생략하고 건너 뛰어도 돼.

너무 질문만 던지지 말고, 이전에 유저의 답변이 길었다면 한번 재요약하고 질문을 던지던가, 네 알겠습니다. 같은 말로 시작해줘.

---
이건 진행되어야하는 리크루팅/헤드헌팅 Call 예시 프로세스야.

1. [지원자의 현재 상황 파악]
    1. 현재 next step에 대해서 어떻게 생각하고 계시나요?
        
        [이직이라면]
        
        1. 왜 이직을 생각하고 계신가요? 현 직장에서 아쉬운 점 혹은 앞으로 원하는 점
        2. 당장 최대한 빨리 인가요 옵션 열어두기 수준인가요?
    2. 지금은 어떤걸 하고 계시나요?
2. [커리어 방향성 / 희망 역할]
    1. 다음 회사를 찾을 때 어떤 팀에서 일하고 싶으신가요?
        1. [대답이 불완전 하다면] 스타트업 vs 대기업
    2. 본인의 일하는 스타일이 있나요?
    3. 원하는 팀 문화가 있으세요? (보상 / 팀 수준 / 성장성 / 비전 / 워라밸 / 기술 스택 / 리모트 등)
    4. 앞으로 3~5년내 커리어 목표가 어떻게 되시나요?
    5. 다음 커리어 스텝에서는 어떤 역할을 맡고 싶으세요?
3. [전문 분야 / 강점 / ]
    1. 제안이 들어온다면 받아볼 의사가 있는 역할들을 아래에서 골라주세요.
    2. 이력서를 보니 ~~가 있는데, 어떤 역할을 했고, 어떤걸 배웠는지 말해주세요.
        1. 본인이 말하고 싶은 중요했던 프로젝트나 경험 있으세요?
    3. 팀에서 어떤 역할로 가장 강점을 발휘한다고 생각하나요?
4. [마지막 보상 등]
    1. 해외 근무나 재배치 가능하신가요?
    2. 희망 연봉은 어느 정도인가요?
    3. 근무 가능한 시점이 언제인가요?
    4. 추가적으로 중요한 점, 말하고 싶은게 있으신가요?
    5. 피드백
---

---

Example Outputs

‘김호진님, 안녕하세요. OptimizerAI에서 공동 창업자 겸 연구 엔지니어로 계셨고, 이전에는 띵스플로우에서 ML Scientist로 계시면서 인상적인 성과를 내셨습니다. 먼저 현재 **다음 커리어 스텝에 대해서 어떻게 생각하고 계신지** 말씀해주시겠어요?’

‘OptimizerAI를 나오신 이유도 잘 이해했습니다. 본인이 원하는 방향과 회사의 전략이 조금 달라진 느낌이셨던 것 같네요. 그렇다면 다음 회사에서 절대 빠지면 안 된 요소, 예를 들어 팀 수준, 비전, 기술 스택, 보상, 리모트 여부 등이 있을까요?’

‘지금까지 말씀해주신 걸 보면, 특히 대규모 오디오 모델 연구와 실제 프로덕트 런칭까지의 경험이 김호진님 커리어의 큰 축이 된 것 같아요. 기술적 깊이도 있지만, 유저 인터뷰부터 기능 기획까지 직접 하셨던 점도 인상적이네요. 그렇다면 다음 회사에서는 연구 중심의 역할과 제품 중심의 역할 중 어느 쪽을 더 선호하시나요? 상관없다면 둘다 상관없다고 말해주세요.’

‘Co-founder로서 스타트업의 성장을 직접 이끌어 보셨고, 딥테크 인력들과 교류하며 산업단의 중요한 점을 배우셨다고 들었습니다. 김호진님께서 **가장 중요하게 생각하는 팀 문화나 환경적인 요소 (예: 보상, 성장성, 기술 스택, 워라밸 등)** 가 있다면 무엇일까요?’

---

아래는 지금까지의 통화 기록, 지원자 정보, 그리고 지원자의 이력서 전문입니다.

이 세 가지를 종합해서, 다음 턴에 Harper(당신)가 지원자에게 물어볼 “가장 자연스럽고 적절한 질문”을  포함한 다음 발화를 만들어 주세요.

- 반드시 한국어로 말하세요.
- 너무 길거나 복잡하지 않게 자연스러운 면접 질문으로 만들어주세요.
- 한 번에 질문 하나만 출력합니다.
- 지원자의 관심 분야, 경력, 목표 등에 가장 맞는 질문을 선택하세요.
- 이전 질문과 중복되거나 너무 비슷한 내용은 피하세요.

사용자가 질문을 한다면 답변한 뒤 꼭 마지막엔 다음 질문을 해야하고, 만약 리크루팅/헤드헌팅과 무관한 질문이나 요구를 하면 저는 지원자님의 커리어를 위한 agent이기 때문에 다른건 할 수 없다고 대답해.

----
[이전 대화 기록]
${conversationHistory}

[지원자 정보]
${userInfo}

[지원자 이력서]
${resumeText}
----
`;

  return await inference(
    "gpt-4.1-mini",
    "You are a helpful assistant. Your name is Harper, voice-based AI recruiter for user. Use korean language. But it's okay to use english words if it is specific terms.",
    userPrompt
  );
};

export const callGreeting = async (
  userInfo: string,
  resumeText: string
): Promise<string> => {
  // return await inference(
  //   "gpt-4.1-nano",
  //   "You are a helpful assistant. Your name is Harper, voice-based AI recruiter for user. Use only korean language.",
  //   "지금 유저가 새롭게 통화세 참여했어."
  // );
  // return "하퍼입니다. 저희는 모든 지원자 분들을 한분한분 정성스럽게 관리합니다. 이제 짧게 통화가 시작될 예정인데, 가능하면 조용한 곳에서 진행해 주세요. 오디오나 마이크는 괜찮으신가요?";
  return "하퍼입니다. 오디오나 마이크는 괜찮으신가요?";
};

export function parseResumeJson(jsonString: string) {
  try {
    const data = JSON.parse(jsonString);

    return {
      education: Array.isArray(data.education) ? data.education : [],
      workExperiences: Array.isArray(data.workExperiences)
        ? data.workExperiences
        : [],
    };
  } catch (e) {
    console.error("Failed to parse JSON:", e);
    return { education: [], workExperiences: [] };
  }
}

// 한 번 호출해서 문자열로 답만 받아오는 헬퍼
export async function extractResumeInfo(resumeText: string): Promise<any> {
  const response = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      {
        role: "user",
        content: `
You are an information extraction system.  
Your task is to read the resume text provided by the user and extract two things:

1. education: Education[]
2. workExperiences: WorkExperience[]

⚠️ OUTPUT RULES (IMPORTANT)
- Output must be valid JSON ONLY. No explanations.
- The root structure must be exactly:
  {
    "education": [...],
    "workExperiences": [...]
  }
- Even if information is missing or unclear, you MUST output arrays.
- Missing or ambiguous fields should be an empty string "".
- If you are not sure about dates, return "".
- If a person is currently studying or working, set endDate: "default".

우선 education, workExperiences를 각각 가장 최근 값 기준으로 하나씩만 출력해줘.
education은 전부 한글로, workExperiences는 전부 영어로 출력해줘.

------------------------------------
DATA FORMAT

Education = {
  "school": string, // 학교명
  "major": string,  // 전공
  "startDate": string,    // 입학일 (unknown → "")
  "endDate": string,      // 졸업일 (재학중 → "default")
  "degree": string, // 학사/석사/박사
  "gpa": string // 학점 (N/4.3)
}

WorkExperience = {
  "company": string, // 회사명
  "position": string, // 직무
  "startDate": string,
  "endDate": string,      // 재직중이면 "default"
  "description": string // 설명, 3줄 요약
}

------------------------------------
RESUME TEXT:
${resumeText}
------------------------------------

Now extract all information and output JSON only. Do not include \`\`\`json or \`\`\` at the beginning or end.
`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  logger.log("extractResumeInfo", content);
  return parseResumeJson(content ?? "");
}

// 한 번 호출해서 문자열로 답만 받아오는 헬퍼
export async function queryKeyword(input_query: string): Promise<any> {
  if (input_query.length < 10) return input_query;

  const response = await xaiClient.chat.completions.create({
    model: "grok-4-fast-reasoning",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      {
        role: "user",
        content: `
Below is the input query of a user. Who is trying to search candidates for a job.
나중에 검색 목록에서 무엇을 검색했었는지 다시 기억하고 찾기 쉽게, 의미를 유지한채로 3-5 단어의 키워드로 만들어줘.
You should return in korean.

Input Query: ${input_query}
Output:
`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  return content ?? "";
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

type Msg = { role: "system" | "user" | "assistant"; content: string };

function toGeminiContents(messages: Msg[]) {
  // system은 config.systemInstruction로 넘길 거라서 contents에서는 제외
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content ?? "" }],
    }));
}

// model, systemPrompt, messages(=대화 메시지들)만 받아서
// "ReadableStream으로 텍스트 delta를 흘려보내는" 함수
export async function geminiChatStream({
  model,
  systemPrompt,
  messages,
  temperature = 0.7,
}: {
  model: string; // e.g. "gemini-2.0-flash"
  systemPrompt: string;
  messages: Msg[];
  temperature?: number;
}) {
  const contents = toGeminiContents([
    { role: "system", content: systemPrompt },
    ...messages,
  ]);

  const stream = await ai.models.generateContentStream({
    model,
    contents,
    config: {
      temperature,
      systemInstruction: systemPrompt,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.LOW,
      },
    },
  });

  const encoder = new TextEncoder();
  let usage:
    | {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    }
    | null = null;
  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          // 공식 예제는 chunk.text 사용
          const delta =
            (chunk as any).text ??
            chunk.candidates?.[0]?.content?.parts
              ?.map((p: any) => p.text ?? "")
              .join("") ??
            "";

          if (delta) controller.enqueue(encoder.encode(delta));


          // ✅ usageMetadata는 보통 마지막 chunk에 있음
          if ((chunk as any).usageMetadata) {
            usage = (chunk as any).usageMetadata;
          }
        }
      } catch (error) {
        controller.error(error);
      } finally {
        controller.close();


        // ✅ 여기서 비용 로그
        if (usage) {
          console.log("[Gemini usage]", usage);
          // DB 저장 / credit 차감 / analytics 여기서
        }
      }
    },
  });

  return responseStream;
}
