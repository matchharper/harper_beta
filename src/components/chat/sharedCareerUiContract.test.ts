import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const composer = source("./ChatComposer.tsx");
const timeline = source("./ChatTimeline.tsx");
const thinking = source("./ChatThinkingLogPanel.tsx");
const careerComposer = source("../career/chat/CareerComposerSection.tsx");
const careerBubble = source("../career/chat/CareerMessageBubble.tsx");
const careerTimeline = source("../career/chat/CareerTimelineSection.tsx");
const careerThinking = source("../career/chat/elements/ThinkingLogPanel.tsx");
const orgAgent = source("../org/agent/OrgAgentPanel.tsx");
const orgComposer = source("../org/agent/OrgAgentComposer.tsx");
const orgMessage = source("../org/agent/OrgAgentMessage.tsx");

test("shared primitives preserve the established Career visual classes", () => {
  assert.match(
    composer,
    /overflow-hidden rounded-\[16px\] border border-neutral-1000-a10 bg-bg-floating\/75 shadow-sm backdrop-blur-xl/
  );
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
});

test("Career adapters use shared presentation without enabling org attachments", () => {
  assert.match(careerComposer, /<ChatComposerFrame/);
  assert.doesNotMatch(careerComposer, /allowAttachments/);
  assert.match(careerBubble, /<ChatMessageBubbleFrame/);
  assert.match(careerBubble, /<ChatAssistantContent/);
  assert.match(careerBubble, /<ChatAssistantPending/);
  assert.match(careerBubble, /<ChatChoiceList/);
  assert.match(careerTimeline, /<ChatDateDivider/);
  assert.match(careerTimeline, /<ChatLoadOlderButton/);
  assert.match(careerThinking, /<ChatThinkingLogPanel/);
});

test("org attachment composer stacks the textarea above split actions", () => {
  assert.match(composer, /actionLayout\?: "footer" \| "overlay"/);
  assert.match(
    composer,
    /actionLayout === "footer"[\s\S]*justify-between px-3 pb-3/
  );
  assert.match(
    composer,
    /actionLayout === "footer" \? "w-full flex-none" : "flex-1"/
  );
  assert.match(
    orgComposer,
    /actionLayout=\{allowAttachments \? "footer" : "overlay"\}/
  );
  assert.match(orgComposer, /allowAttachments && "min-h-12 py-3"/);
  assert.match(orgComposer, /ROLE_CREATION_TEXTAREA_MAX_ROWS = 4/);
  assert.match(orgComposer, /resizeRoleCreationTextarea\(textarea\)/);
  assert.match(orgComposer, /new window\.ResizeObserver/);
  assert.match(orgMessage, /<ChatAssistantContent/);
  assert.match(orgMessage, /<ChatAssistantPending/);
  assert.match(orgAgent, /chat\.assistantStatus === "pending"/);
  assert.match(
    orgAgent,
    /paddingBottom:[\s\S]*composerOverlayHeight \+ ORG_AGENT_TIMELINE_BOTTOM_GAP_PX/
  );
  assert.match(orgAgent, /if \(!stickToBottom\) return/);
});
