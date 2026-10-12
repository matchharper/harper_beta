import test from "node:test";
import assert from "node:assert/strict";
import { appendBrowserProgress, browserProgressFromEvent } from "./browserProgress";

test("only completed public text becomes bounded progress, never reasoning or command output", () => {
  for (const type of ["agent.session.turn.output_text.delta", "agent.session.turn.reasoning.done", "agent.session.turn.command_execution.output.done"])
    assert.equal(browserProgressFromEvent({type,item_id:"x",text:"private"}), null);
  const entry = browserProgressFromEvent({type:"agent.session.turn.output_text.done",item_id:"message-1",content_index:0,text:"지원 페이지를 확인하고 있어요."}, "now")!;
  assert.equal(entry.text, "지원 페이지를 확인하고 있어요.");
  const once = appendBrowserProgress([], entry);
  assert.equal(appendBrowserProgress(once, entry), once);
  assert.equal(browserProgressFromEvent({type:"agent.session.turn.output_text.done",item_id:"large",text:"a".repeat(2000)})!.text.length, 800);
  let history = once;
  for(let i=0;i<50;i++) history=appendBrowserProgress(history,{id:String(i),text:"Update",at:"now"});
  assert.equal(history.length,40);
  assert.equal(history.at(-1)!.id,"49");
});
