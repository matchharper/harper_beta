/**
 * Career main prompt(`career_main` 블록). 본문 정본은 main.md이고, 이 파일은 읽어서 치환만 한다.
 * - {output_language}, {positions_tab_label}: 현재 언어 설정
 * - {internal_opportunities}: internal-opportunities.md (온보딩·음성 지침과 공유)
 * dev 말투 실험(friendly)은 experiments/friendly-voice.md로 main.md의 말투 문단만 바꾼다.
 * 폴더 구성과 그 밖의 입력은 README.md 참고.
 */
import "@/lib/llm/registerMarkdownText";
import CAREER_MAIN_MARKDOWN from "./main.md";
import FRIENDLY_VOICE_MARKDOWN from "./experiments/friendly-voice.md";
import type { CareerConversationVersion } from "../conversationVersion";
import { CAREER_INTERNAL_OPPORTUNITIES } from "./internalOpportunities";
import {
  careerPromptText,
  type CareerPromptExperiment,
} from "./promptExperiment";
import { interpolateCareerPromptText } from "./promptUtils";

/** The friendly paragraph replaces the main.md paragraph that opens with the same sentence. */
function withFriendlyVoice(main: string) {
  const voice = FRIENDLY_VOICE_MARKDOWN.trim();
  const opening = voice.slice(0, voice.indexOf(". ") + 1);
  const paragraphs = main.split("\n\n");
  const index = paragraphs.findIndex((paragraph) => paragraph.startsWith(opening));
  if (index < 0)
    throw new Error("experiments/friendly-voice.md의 첫 문장으로 시작하는 말투 문단이 main.md에 없습니다.");
  paragraphs[index] = voice;
  return paragraphs.join("\n\n");
}

export function careerMainPromptForVersion(version: CareerConversationVersion = "professional") {
  const main = CAREER_MAIN_MARKDOWN.replace("{internal_opportunities}", () => CAREER_INTERNAL_OPPORTUNITIES);
  return version === "friendly" ? withFriendlyVoice(main) : main;
}

export function buildCareerMainPrompt(args: {
  outputLanguage: string;
  positionsTabLabel: string;
  promptExperiment?: CareerPromptExperiment;
  conversationVersion?: CareerConversationVersion;
}) {
  return interpolateCareerPromptText(
    careerPromptText(
      args.promptExperiment,
      "career_main",
      careerMainPromptForVersion(args.conversationVersion)
    ),
    {
      output_language: args.outputLanguage,
      positions_tab_label: args.positionsTabLabel,
    }
  );
}
