// slack.ts
import { xaiInference } from "@/lib/llm/llm";
import { IncomingWebhook } from "@slack/webhook";

const webhookUrl = process.env.SLACK_TOKEN!;

export const slack = new IncomingWebhook(webhookUrl);

export async function notifySlack(message: string) {
  await slack.send({
    text: message,
  });
}

export const makeMessage = async (
  inputText: string,
  criteria: string,
  typed: "no" | "less" | "more" = "no"
) => {
  let augment = ``;
  if (typed === "no") {
    augment = `
  현재 case) 현재 위 조건으로 유저가 입력을 했고, 이걸 기반으로 우리 데이터베이스 안에서 SQL 문을 만들어서 사람을 서치 했더니 아무도 나오지 않았어. 이때 결과가 나오지 않았다는 안내와 함께 어떻게 다르게 검색을 해볼 수 있는지 안내해주려고 해.
  `;
  } else if (typed === "less") {
    augment = `
  현재 case) 현재 위 조건으로 유저가 입력을 했고, 이걸 기반으로 우리 데이터베이스 안에서 SQL 문을 만들어서 사람을 서치 했더니 10명도 나오지 않았어. 이때 결과를 충분히 가져오지 못했다는 안내와 함께 어떻게 다르게 검색을 해볼 수 있는지 안내해주려고 해.
  `;
  } else if (typed === "more") {
    augment = `
  현재 case) 현재 위 조건으로 유저가 입력을 했고, 이걸 기반으로 우리 데이터베이스 안에서 SQL 문을 만들어서 사람을 서치 했더니 사람은 많은데 완전히 만족하는 사람이 5명 이하였어. 이때 한번더 실행하면 완전히 만족하는 사람을 더 찾을 수 있어서, 이걸 안내해주려고 해.
  지금은 recommendations를 출력하지마. "recommendations": [] 이렇게 빈 배열로 출력해줘.
  `;
  }

  const prompt = `
  Input text: ${inputText}
  Criteria: ${criteria}
  
  Input이 영어면 메세지와 추천 둘다 영어로, input이 한글이면 둘다 한글로 해줘.
  
  - 안내문과 추천하는 recommendation 1~2개를 각각 담아서 json으로 출력해줘.
  - 검색을 잘못한 유저를 탓하는 말투를 쓰면 안돼.
  - recommendations는 기존 input text와는 조금 다른 텍스트여야해.
  - message는 한문장이나 두문장으로만 해줘. 너무 길지 않게.
  
  Case별 안내
  ${augment}
  
  """
  Example:
  Example input text: 구글이랑 메타랑 당근마켓이랑 넷플릭스 동시에 다니고 있는 디자이너
  {
  "message": "요청을 완벽하게 처리하지 못했어요. 동시에 모든 회사를 다니는 사람은 드물기 때문에, 다른 관점으로 다시 시도해보는건 어떨까요?",
  "recommendations": ["구글, 메타, 당근마켓, 넷플릭스를 전부 다녀본 디자이너", "구글, 메타, 당근마켓, 넷플릭스 중 최소 2군데 이상 근무해본 디자이너"]
  }
  """
  
  `;
  // "message": "지금 결과도 출발점으로는 괜찮은데, 수가 좀 적어요. 더 깊게 찾아볼까요?",
  const response = await xaiInference(
    "grok-4-fast-reasoning",
    "You are a helpful assistant",
    prompt
  );
  try {
    const outJson = JSON.parse(response);
    return outJson;
  } catch (error) {
    return null;
  }
};
