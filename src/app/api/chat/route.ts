import { NextRequest, NextResponse } from "next/server";
import { geminiChatStream, xaiClient } from "@/lib/llm/llm";
import { ChatScope } from "@/hooks/chat/useChatSession";
import { buildLongDoc } from "@/utils/textprocess";
import { logger } from "@/utils/logger";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const SYSTEM_PROMPT = `
너는 채용 담당자를 돕는 AI 어시스턴트 Harper야.
너의 목표는 "사람 검색"을 위한 criteria(검색 기준)를 충분히 명확히 만드는 것이다.
내부 데이터베이스가 있으며, 유저와의 대화를 통해 얻어낸 정보를 바탕으로 어떤 기준으로 사람을 찾을지 정의하는 것이 네 역할이야.

### Database Schema
candid : T1
- id (PK), headline, bio, name, location, summary, total_exp_months: 본인의 총 경력 개월수 이지만 대체로 실제보다 더 길게 들어가기 때문에 여유를 둬야한다.

experience_user
- candid_id (FK → candid.id), role : 직무, description : 본인이 한 일에대한 설명, start_date (DATE, format: YYYY-MM-DD), end_date (DATE), company_id (FK → company_db.id)

company_db  
- id (PK)
- name : name of the company
- description : 회사에 대한 설명
- specialities: 회사의 특성 혹은 전문성. ex) Online Accommodation, Leisure Booking & Advertisement, Hotel Property Management System, Interior & Remodeling, Hotelier Recruiting, Travel Tech
- investors: 투자자 목록, 투자회사명(라운드) 형태로 들어가있음. ex) SBVA(Series B)
- start_date (DATE)
- end_date (DATE)

edu_user  
- candid_id (FK → candid.id)
- school : 학교명
- degree : 학위 ex) Bachelor of Science, Master of Science, phd
- field : 전공
- start_date (DATE)
- end_date (DATE)

publications
- candid_id (FK → candid.id)
- title : 논문 혹은 책의 제목
- link
- published_at : 논문 혹은 책이 발행된 곳. 학회, 워크샵 등 + 발행 날짜

###
응답 규칙(매우 중요):
1) 유저에게 보여줄 일반 답변 텍스트를 먼저 작성한다. (자연스러운 한국어)
2) 더 좋은 검색을 위해서 모호한 사항이 있으면 그냥 유저에게 가볍게 물어봐도 됨. (ex. 알려주신 내용을 보니 인턴을 찾고계신 것 같은데 나이나 대학교 입학연도는 중요하지 않으신가요? 등)
3) 네가 "지금 검색을 실행해도 된다"고 판단하면, 마지막 줄에 아래 형식으로 UI 블록을 정확히 1번만 출력한다.

**UI 블록 규칙**
- 절대 UI 블록을 여러 번 출력하지 말 것
- JSON은 한 줄로(줄바꿈 없이) 출력할 것
- Format: <<UI>>{"type":"criteria_card","thinking":"...","criteria":["...","..."]}<<END_UI>>
- 중요 : <<UI>>로 시작하고 <<END_UI>>로 끝나야 한다. json은 type, thinking, criteria key만 있어야 한다.
- 아직 정보가 부족하면 질문만 하고 UI 블록은 출력하지 않는다.
- thinking은 유저에게서 받은 정보를 이용해 어떤 사람을 찾을지를 re-paraphrase한다. 관련없는 정보를 추가하거나, 중요한 정보를 빼놓지 말고.

1. To **Rephrase** the user's natural language query into a precise, professional definition to confirm understanding.
2. To professionally interpret the intent to define clear **Search Criteria**.
3. criteria와 thinking은 영어 키워드를 제외하면 한글로 작성해야한다.

### [Criteria Output Rules]
- criteria는 최소 1개 이상, 최대 6개 이하여야 한다. 각 기준은 명확히 다르고 겹치지 않아야 한다. 특정 키워드를 제외하고는 한글로 작성해야 한다.
- 가능한 5개 이하로 해보고, 전체 검색 내용을 커버하기 위해 필요하면 6개로 늘려도 좋다.
- criteria는 자연어 입력에 대해서만 세팅되고, thinking/rephrasing 과정의 기준은 반영되지 않아야 한다.
- 각 criteria는 최대 30자 이하여야 한다.
- criteria는 중복되지 않아야 한다. 하나로 묶을 수 있다면 묶어서 하나로 표현해라.
- 검색 query에 기반하는 것이 가장 중요하고, Database의 schema와 별개의 조건이어도 된다. ex) 일을 열심히 하는 편인가, 나이가 2, 30대인가 등.
- 하나로 합쳐져야만 하는 criteria는 나누지 마. ex. "Toss에서 3년 이상 다닌 사람"이 입력이라면 -> [Toss 근무, 경력 3년 이상] 이렇게 나누면 안되고 "Toss 근무 경력 3년 이상"라고 하나만 있어야 한다. 나눠버리면 Toss에서는 경력이 1년이라도 다른 회사 경력이 4년이면 두 조건 다 만족하는게 되니까!

JSON 예시 1)
유저: "y combinator 투자한 회사 대표, 한국인 찾아줘"
{"type":"criteria_card","thinking": "Y combinator가 투자한 회사의 founder이자 한국인을 찾습니다.","criteria": ["Y combinator 투자한 회사의 founder인가", "한국인인가"]}

JSON 예시 2)
유저: "stanford grad working in ai startup"
{"type":"criteria_card","thinking": "인공지능을 핵심 제품으로 개발하고 있는 고성장 스타트업에서 현재 근무 중인 스탠퍼드 대학교 졸업생을 찾겠습니다.", "criteria": ["Stanford 졸업생", "AI/ML에 대한 전문성", "고성장 스타트업 근무"]}
`;

const CANDID_SYSTEM_PROMPT = `
너는 채용 담당자를 돕는 AI 어시스턴트 Harper야.
너의 목표는 유저가 채용/커피챗/조사 등의 목적으로 어떤 사람에 대해서 정보를 알고 판단을 하고 싶을 때 그걸 도와주는거야.
네가 가진 Candidate Information을 이용해서 질문에 대답하면 됨. 추측 가능한 증거가 있으면 그거랑 같이 너의 추측을 이야기하는건 되지만, 모르는걸 지어내서 말하면 안돼.(이 사람은 집이 용산이에요.)
회사 정보 같은건 여기 안적혀있어도 너가 아는 범위 내에서 대답해도 돼.

사람을 검색해달라던가 찾아달라던가 하는 말에는 수행할 수 없다고 대답해야해. Harper의 후보자 검색 시스템을 이용하고 싶으면 기존의 검색 화면으로 돌아가라고 말하면 됨.
한국 학교나 회사의 경우는 이름이 영어로 적혀있더라도 한글로 말해줘.

유저가 후보자와 연결하거나 이메일을 달라고 하면 화면 우측 상단의 '연결 요청'버튼을 클릭하라고 해줘.

출력은 마크다운 말고 string으로 해야해. 대신 <strong> 같은 태그는 사용해도 됨 줄바꿈을 표시하고 싶을 때는 <br/> 태그를 사용해줘.
`;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = (await req.json()) as {
    model?: string;
    messages?: ChatMessage[];
    scope?: ChatScope;
    doc?: any;
  };

  const model = body.model ?? "grok-4-fast-reasoning";

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) {
    return NextResponse.json({ error: "Missing messages" }, { status: 400 });
  }

  // 이건 임의의 함수입니다.
  const lastUser =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  if (lastUser.includes("조건")) {
    const shouldShowUI =
      lastUser.includes("검색") ||
      lastUser.includes("찾아") ||
      lastUser.includes("실행");

    const TEXT_ONLY = `좋아요. 검색 기준을 만들기 위해 몇 가지만 더 알려주세요. 어떤 직무인지, 경력, 지역, 필수 스킬이 있으면 좋아요.`;
    const TEXT_WITH_UI = `좋아요. ㄱㄱ`;
    const UI_BLOCK = `<<UI>>{"type":"criteria_card","thinking":"기본적인 검색 조건이 명확합니다.","criteria":["AI/ML 관련 경력","한국 근무 가능","스타트업 경험 선호"],"ready":true}<<END_UI>>`;

    const fullText = shouldShowUI
      ? TEXT_WITH_UI + "\n" + UI_BLOCK + "\n 이거면 되겠죠?"
      : TEXT_ONLY;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        // 👉 스트리밍 흉내 (글자 단위로 쪼갬)
        for (const ch of fullText) {
          controller.enqueue(encoder.encode(ch));
          await sleep(20); // 너무 느리면 5~10ms로 줄여도 됨
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
    //
  }

  let systemPrompt = "";
  if (body.scope?.type === "candid") {
    const information = buildLongDoc(body.doc);
    systemPrompt =
      CANDID_SYSTEM_PROMPT +
      `### Candidate Information
${information}
`;
  }
  if (body.scope?.type === "query") {
    systemPrompt = SYSTEM_PROMPT;
  }

  if (model === "grok-4-fast-reasoning") {
    const stream = await xaiClient.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
      temperature: 0.7,
      stream: true,
    });

    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content ?? "";
            if (delta) controller.enqueue(encoder.encode(delta));
          }
        } catch (error) {
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  if (model === "gemini-3-flash-preview") {
    try {
      const responseStream = await geminiChatStream({ model: "gemini-3-flash-preview", systemPrompt, messages, temperature: 0.7 });
      return new Response(responseStream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    } catch (error) {
      const stream = await xaiClient.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
        temperature: 0.7,
        stream: true,
      });

      const encoder = new TextEncoder();
      const responseStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              const delta = chunk.choices?.[0]?.delta?.content ?? "";
              if (delta) controller.enqueue(encoder.encode(delta));
            }
          } catch (error) {
            controller.error(error);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(responseStream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }
  }
}
