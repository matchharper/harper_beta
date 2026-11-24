/** Shared product contract for text, voice, onboarding and background Career. 본문은 internal-opportunities.md. */
import "@/lib/llm/registerMarkdownText";
import INTERNAL_OPPORTUNITIES_MARKDOWN from "./internal-opportunities.md";

export const CAREER_INTERNAL_OPPORTUNITIES = INTERNAL_OPPORTUNITIES_MARKDOWN.trimEnd();
