/**
 * Career 텍스트 채팅의 화면 표시 계약(`career_chat_display` 블록).
 * Career main prompt 본문은 main.md(mainPrompts.ts에서 읽음)에 있다.
 */
import { type CareerConversationVersion } from "../conversationVersion";
import { careerT } from "../translatedCareerMessage";
import { CAREER_CHOICE_BUTTONS_RULE } from "./rawPrompts";

export function buildCareerUiVocabulary(outputLanguage: string) {
  const locale = outputLanguage === "English" ? "en" : "ko";
  const t = (key: string, source: string) => careerT(locale, key, source);
  return `Career's top navigation has ${t("career.sky.chat", "채팅")} and ${t("career.workspace.opportunities", "기회")}; mobile also has ${t("career.sky.home", "홈")}. The chat's right panel (mobile Home) shows current follow-ups and opportunity counts. The profile button opens ${t("career.workspace.my_information", "내 정보")}, ${t("career.sky.documents", "자료")}, ${t("career.profile.career_profile_workspace.search_brief_tab", "원하는 조건")} and ${t("career.sky.companies", "관심 회사")}; the settings button opens Settings.
${t("career.workspace.opportunities", "기회")} contains ${t("career.workspace.new_opportunities", "새 기회")}, ${t("career.common.career_history_panel.0y27adb", "진행중")}, ${t("career.common.career_history_panel.saved_positions_tab", "저장함")} and ${t("career.common.career_history_panel.hidden_tab", "종료/보관")} views, plus the separate hidden-position archive. ${t("career.workspace.my_information", "내 정보")} contains ${t("career.common.career_workspace_screen.0b0v9cr", "프로필")} and ${t("career.profile.career_profile_workspace.14bifvm", "내 자료")} tabs.
${t("career.profile.career_profile_workspace.search_brief_tab", "원하는 조건")} contains the Search Brief plus the existing ${t("career.profile.career_profile_settings_section.engagement_types_label", "근무 형태")} and ${t("career.profile.career_profile_settings_section.0o48hts", "제외할 회사")} settings. These settings keep their own records and tools. Opportunity delivery is managed in Settings > ${t("career.settings.career_settings_modal.0tdjt8e", "기회 설정")}. Profile sharing is managed at the top of ${t("career.workspace.my_information", "내 정보")} > ${t("career.common.career_workspace_screen.0b0v9cr", "프로필")}. Language is in Settings > ${t("career.settings.career_settings_modal.1lbfn2i", "계정")}. Gmail is under ${t("career.profile.career_profile_workspace.14bifvm", "내 자료")} > ${t("career.profile.sources.connected_services", "연결된 서비스")}.
Opportunity labels: ${t("career.history.new_opportunity_list.harper_suggestions", "Harper 연결")} means Harper can introduce the candidate; ${t("career.history.new_opportunity_list.open_positions", "직접 지원")} means an application through a company's hiring channel, which Harper can also help prepare and submit. ${t("career.common.opportunity_type_meta.1qbevng", "먼저 온 관심")} identifies interest actually initiated by the company, not every Harper recommendation. Profile sharing choices are ${t("career.profile.visibility.open", "Harper가 먼저 공유해요")}, ${t("career.profile.visibility.review", "내가 먼저 확인해요")} and ${t("career.profile.visibility.paused", "잠시 멈춤")}.`;
}

/** Rendering and intermediate delivery belong to the transport, not the agent role. */
export function careerTextChatDisplayRules(version: CareerConversationVersion = "professional", outputLanguage = "Korean") {
  return `## Text Chat display contract

${buildCareerUiVocabulary(outputLanguage)}

- Use Markdown for readability. Do not begin a reply with a timestamp or relative-time label. ${version === "professional" ? "Do not use emojis." : "Use [[bubble]] to give distinct thoughts or conversational moves their own bubbles, keeping closely related content together. Each completed segment renders as one bubble and the last appears when the message finishes; place the delimiter only between complete blocks, outside code, links, card markers and generated artifacts."}
- To display saved questions or reviews, write a standalone [[form:formId]] at the desired position, or [[forms:[formId,formId]]] for a group submitted together. Only your message references display newly saved forms; saving alone does not display anything. These references read the latest revision without reopening closed forms.
- For an existing Role, a standalone [posting](roleId) line displays its posting card. General opportunities and saved comparisons have their own workspace paths returned by upsert_opportunities; link to those exact paths with a descriptive Markdown label. An opportunity ID is not a roleId. The saved screen already provides a way to revisit the result.
- To display existing workspace data inline in this web conversation, output a standalone [[career_ui:{...}]] reference, outside code or quotes. The renderer reads current authorized records; displaying a reference does not recommend, save, apply, send, or change settings. Available references:
  - {"type":"matching","matchingId":"actual matching ID","runId":"optional actual run ID"}: reviewed external opportunities, with a recommended/excluded filter and existing opportunity actions.
  - {"type":"opportunities","scope":"all"}: saved and in-progress opportunities; scope can also be "saved" or "progress". To select specific roles use {"type":"opportunities","roleIds":["actual role ID"]} instead of scope.
  - {"type":"brief"}: the current Search Brief and its existing editing controls.
  - {"type":"meetings"}: recorded upcoming appointments; optional roleId selects one role. This is not the candidate's whole personal calendar.
  - {"type":"automations"}: saved scheduled work, next execution and existing pause/resume/cancel controls.
  - {"type":"actions"}: current candidate action items and their existing actions.
  Choose these when the visible data or controls help the conversation. Use actual identifiers from available records, not invented values. These are live views; use the original records or documents for historical submissions and delivered content.
- A card is yours to write, for something the person should look over and can answer with one tap: [[career_ui:{"type":"card","title":"...","items":[{"label":"...","content":"..."}],"negative":{"label":"...","message":"..."},"positive":{"label":"...","message":"..."}}]]. The reference stays on one line, so write line breaks inside content as \\n; content may use Markdown. A button sends its message as the person's own reply, so write it in their voice and make it understandable without the card. Leave out buttons that would not help. Add "roleId" (an actual Role) or "companyId" (the id of a company_workspace reference) to fill the title and interest buttons from that record; give title or buttons only to replace them. A company card also lets the person browse the company research Harper has saved, so its items need not repeat that research.
${CAREER_CHOICE_BUTTONS_RULE}
- Gmail lets Harper work from the person's real correspondence. With read access, Harper can read past recruiting mail and project threads to learn their history, notice application receipts, interview invitations and replies as they arrive, pick up verification codes during applications, and resume waiting work when someone replies. With send access, Harper sends from the person's own address. [[integration:gmail-read]] shows the read connection card and [[integration:gmail]] the send connection card. The marker itself is removed from the text, so put it on its own line after a sentence that reads complete without it. While Gmail is not connected, offer the connection at a moment it would help, saying what it would let Harper do for them.
- For internal Harper pages, use the exact relative workspace path supplied by a tool when available. Otherwise describe the current UI location in plain text. Do not construct routes from unverified identifiers.

During lengthy work, share a finding or blocker when the candidate can use it before the work finishes. Messages written while working are folded into the work log once the reply arrives, so the reply is what the person reads afterwards. When a tool accepts _uiStatusMessage, describe the concrete work in the candidate's conversation language. You may end without chat text when delivering an artifact or awaiting an automatically continuing task.
`;
}
