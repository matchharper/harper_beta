import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const composer = source("./ChatComposer.tsx");
const composerActionMenu = source("./ChatComposerActionMenu.tsx");
const composerPicker = source("./ChatComposerPicker.tsx");
const dropdownMenu = source("../ui/dropdown-menu.tsx");
const timeline = source("./ChatTimeline.tsx");
const thinking = source("./ChatThinkingLogPanel.tsx");
const careerComposer = source("../career/chat/CareerComposerSection.tsx");
const careerComposerActionMenuStart = careerComposer.indexOf(
  "const composerActionMenuItems"
);
const careerComposerActionMenu = careerComposer.slice(
  careerComposerActionMenuStart,
  careerComposer.indexOf("\n  ];", careerComposerActionMenuStart)
);
const careerBubble = source("../career/chat/CareerMessageBubble.tsx");
const careerTimeline = source("../career/chat/CareerTimelineSection.tsx");
const careerThinking = source("../career/chat/elements/ThinkingLogPanel.tsx");
const orgAgent = source("../org/agent/OrgAgentPanel.tsx");
const orgComposer = source("../org/agent/OrgAgentComposer.tsx");
const orgMessage = source("../org/agent/OrgAgentMessage.tsx");
const mobileChatLauncher = source(
  "../career/mobile/CareerMobileChatLauncher.tsx"
);
const mobileNavigationMenu = source(
  "../career/mobile/CareerMobileNavigationMenu.tsx"
);
const mobileTopBar = source("../career/mobile/CareerMobileTopBar.tsx");

test("shared primitives preserve the established Career visual classes", () => {
  assert.match(
    composer,
    /border-neutral-1000-a05 bg-bg-floating\/55 shadow-sm backdrop-blur-2xl/
  );
  assert.doesNotMatch(composer, /focus-within:border/);
  assert.match(
    composer,
    /min-h-\[72px\][\s\S]*px-3\.5 py-4 text-base leading-5/
  );
  assert.match(
    timeline,
    /mt-1 ml-auto w-fit max-w-\[min\(820px,92%\)\] self-end rounded-\[14px\] bg-black px-3 py-1\.5 text-neutral-00/
  );
  assert.match(
    timeline,
    /mt-3 flex max-w-\[520px\] min-w-\[320px\] w-full flex-col gap-2/
  );
  assert.match(
    timeline,
    /inline-flex gap-2 h-8 items-center justify-center rounded-\[8px\]/
  );
  assert.match(thinking, /ml-\[7px\] border-l border-neutral-1000-a05 pl-4/);
  assert.match(thinking, /ThinkingLogStatusIcon/);
  assert.match(thinking, /animate-spin text-neutral-soft/);
  assert.doesNotMatch(thinking, /text-positive/);
  assert.doesNotMatch(thinking, /text-critical/);
});

test("Career adapters use shared presentation without enabling org attachments", () => {
  assert.match(careerComposer, /<ChatComposerFrame/);
  assert.match(careerComposer, /<ChatComposerActionMenu/);
  assert.match(careerComposer, /mobileLeadingAction=/);
  assert.match(
    careerComposer,
    /setPendingFileAttachment\(createDraftFileAttachment\(file\)\)/
  );
  assert.match(careerComposer, /files:[\s\S]*submittedFileAttachment\.file/);
  assert.match(careerComposer, /<ChatAttachmentDraftList/);
  assert.match(careerComposer, /onRequestMoreOpenPositions/);
  assert.match(careerComposer, /id: "upload-file"/);
  assert.match(careerComposer, /id: "request-more-open-positions"/);
  assert.match(careerComposer, /id: "conversation-starter-preference-update"/);
  assert.match(careerComposer, /id: "conversation-starter-match-quality"/);
  const uploadIndex = careerComposerActionMenu.indexOf('id: "upload-file"');
  const recommendationIndex = careerComposerActionMenu.indexOf(
    'id: "request-more-open-positions"'
  );
  const preferenceCallIndex = careerComposerActionMenu.indexOf(
    'id: "conversation-starter-preference-update"'
  );
  const matchQualityCallIndex = careerComposerActionMenu.indexOf(
    'id: "conversation-starter-match-quality"'
  );
  const pendingItemsIndex = careerComposerActionMenu.indexOf(
    "...pendingActionMenuItems"
  );
  assert.ok(
    uploadIndex < recommendationIndex &&
      recommendationIndex < preferenceCallIndex &&
      preferenceCallIndex < matchQualityCallIndex &&
      matchQualityCallIndex < pendingItemsIndex
  );
  assert.match(careerComposerActionMenu, /subtext: "PDF, DOCX, TXT"/);
  assert.equal(
    careerComposerActionMenu.match(/icon: <PhoneCall \/>/g)?.length,
    2
  );
  assert.doesNotMatch(
    careerComposerActionMenu.slice(recommendationIndex),
    /subtext:/
  );
  assert.doesNotMatch(
    careerComposerActionMenu,
    /sectionLabel: "(?:대화|도구)"/
  );
  assert.match(
    careerComposer,
    /onStartConversationStarter\(\{ mode: "call", starterId \}\)/
  );
  assert.match(
    careerComposer,
    /const visiblePendingActions = resolvedPendingActions/
  );
  assert.match(careerComposer, /action\.kind === "internal_fit_question"/);
  assert.match(careerComposer, /"매칭 재평가 질문"/);
  assert.equal(
    careerComposer.match(/subtextLayout: "stacked" as const/g)?.length,
    5
  );
  assert.match(careerComposer, /className="z-20 max-md:min-h-12 max-md:py-3"/);
  assert.doesNotMatch(careerComposer, /allowAttachments/);
  assert.doesNotMatch(careerComposer, /<form/);
  assert.match(careerBubble, /<ChatMessageBubbleFrame/);
  assert.match(careerBubble, /<ChatAssistantContent/);
  assert.match(careerBubble, /<ChatAssistantPending/);
  assert.match(careerBubble, /<ChatChoiceList/);
  assert.match(careerTimeline, /<ChatDateDivider/);
  assert.match(careerTimeline, /<ChatLoadOlderButton/);
  assert.match(careerThinking, /<ChatThinkingLogPanel/);
});

test("composer action menu reuses Picker visuals with its own popup behavior", () => {
  assert.match(composerActionMenu, /export function ChatComposerActionMenu/);
  assert.match(composerActionMenu, /items\.map\(\(item, index\)/);
  assert.match(composerActionMenu, /side="top"/);
  assert.match(composerActionMenu, /CHAT_COMPOSER_PICKER_SURFACE_CLASS_NAME/);
  assert.match(composerActionMenu, /<ChatComposerPickerItemContent/);
  assert.match(
    composerActionMenu,
    /item\.subtextLayout === "stacked"[\s\S]*"min-h-12 py-1\.5"/
  );
  assert.match(composerActionMenu, /layout=\{item\.subtextLayout\}/);
  assert.match(
    composerPicker,
    /export const CHAT_COMPOSER_PICKER_SURFACE_CLASS_NAME/
  );
  assert.match(composerPicker, /export function ChatComposerPickerItemContent/);
  assert.match(composerPicker, /const isStacked = layout === "stacked"/);
  assert.match(composerPicker, /flex-col items-start justify-center/);
  assert.match(composerActionMenu, /slide-in-from-bottom-3/);
  assert.match(composerActionMenu, /slide-out-to-bottom-2/);
  assert.match(composerActionMenu, /<DropdownMenuContent/);
  assert.match(dropdownMenu, /data-\[state=open\]:zoom-in-95/);
  assert.match(composerActionMenu, /item\.subtext/);
});

test("org attachment composer stacks the textarea above split actions", () => {
  assert.match(composer, /actionLayout\?: "footer" \| "overlay"/);
  assert.match(composer, /const DEFAULT_MAX_ROWS = 4/);
  assert.match(composer, /mobileLeadingAction\?: ReactNode/);
  assert.match(
    orgComposer,
    /const attachmentContext =[\s\S]*attachments\.map\(\(attachment\)/
  );
  assert.match(
    orgComposer,
    /rounded-xl border border-neutral-1000-a10 bg-bg-floating/
  );
  assert.match(orgComposer, /context=\{attachmentContext\}/);
  assert.match(
    composer,
    /actionLayout === "footer"[\s\S]*md:w-full md:justify-between md:px-2 md:pb-2/
  );
  assert.match(
    composer,
    /actionLayout === "footer" \? "md:w-full md:flex-none" : "md:flex-1"/
  );
  assert.match(
    orgComposer,
    /actionLayout=\{allowAttachments \? "footer" : "overlay"\}/
  );
  assert.match(careerComposer, /actionLayout="footer"/);
  assert.match(orgComposer, /allowAttachments && "min-h-12 py-3"/);
  assert.match(orgComposer, /ROLE_CREATION_TEXTAREA_MAX_ROWS = 4/);
  assert.match(orgComposer, /resizeRoleCreationTextarea\(textarea\)/);
  assert.match(orgComposer, /new window\.ResizeObserver/);
  assert.match(orgMessage, /<ChatAssistantContent/);
  assert.match(orgMessage, /<ChatAssistantPending/);
  assert.match(orgMessage, /logs=\{message\.thinkingLogs\}/);
  assert.match(orgAgent, /logs=\{chat\.thinkingLogs\}/);
  assert.match(orgAgent, /chat\.assistantStatus === "pending"/);
  assert.match(
    orgAgent,
    /paddingBottom:[\s\S]*composerOverlayHeight \+ ORG_AGENT_TIMELINE_BOTTOM_GAP_PX/
  );
  assert.match(orgAgent, /if \(!stickToBottom\) return/);
});

test("org user attachments render above and outside the message bubble", () => {
  const userAttachmentsIndex = orgMessage.indexOf(
    "{isUser && attachments.length > 0"
  );
  const messageBubbleIndex = orgMessage.indexOf(
    "<ChatMessageBubbleFrame",
    userAttachmentsIndex
  );
  const assistantAttachmentsIndex = orgMessage.indexOf(
    "{!isUser && attachments.length > 0",
    messageBubbleIndex
  );

  assert.ok(userAttachmentsIndex >= 0);
  assert.ok(messageBubbleIndex > userAttachmentsIndex);
  assert.ok(assistantAttachmentsIndex > messageBubbleIndex);
});

test("mobile app bar and chat drawer share one navigation menu", () => {
  assert.match(mobileTopBar, /<CareerMobileNavigationMenu/);
  assert.match(mobileChatLauncher, /<CareerMobileNavigationMenu/);
  assert.match(mobileChatLauncher, /<List className="h-4 w-4"/);
  assert.match(mobileChatLauncher, /CHAT_COMPOSER_GLASS_SURFACE_CLASS_NAME/g);
  assert.match(mobileNavigationMenu, /options\.map\(\(option\)/);
  assert.match(mobileNavigationMenu, /onChangeTab\(option\.id\)/);
  assert.match(mobileNavigationMenu, /rounded-full bg-action/);
  assert.doesNotMatch(mobileNavigationMenu, /rounded-full bg-info/);
});

test("closed mobile chat reuses the shared collapsed composer surface", () => {
  assert.match(composer, /export const ChatComposerCollapsedFrame/);
  assert.match(mobileChatLauncher, /<ChatComposerCollapsedFrame/);
  assert.match(mobileChatLauncher, /showChatInterviewCta/);
  assert.match(mobileChatLauncher, /harperPreparing/);
  assert.doesNotMatch(mobileChatLauncher, /border-primary\/20 bg-primary\/5/);
});

test("mobile chat toolbar follows the iOS visual viewport", () => {
  assert.match(
    mobileChatLauncher,
    /--career-mobile-chat-toolbar-top[\s\S]*offsetTop/
  );
  assert.match(mobileChatLauncher, /className="fixed left-3 z-\[70\]"/);
  assert.match(
    mobileChatLauncher,
    /"fixed right-3 z-\[70\] rounded-full text-neutral-muted"/
  );
});
