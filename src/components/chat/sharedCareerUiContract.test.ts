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
const careerComposer = source("../career/chat/CareerComposerSection.tsx");
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
