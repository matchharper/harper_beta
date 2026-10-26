import test from "node:test";
import assert from "node:assert/strict";
import { LivePhoneSession, type PhoneSessionCallbacks } from "../src/lib/career/phone/LivePhoneSession";

function fixture() {
  const saved: unknown[] = [];
  const tools: string[] = [];
  const callbacks: PhoneSessionCallbacks = {
    config: {}, apiKey: "test", userId: "test",
    onTurn: async turn => { saved.push(turn); return {}; },
    onTool: async call => { tools.push(call.callId); return '{"ok":true}'; },
    onUsage: async () => {}, onEvent: () => {},
  };
  return { session: new LivePhoneSession(callbacks), saved, tools };
}

test("retains the final user utterance and assistant transcript on hangup", async () => {
  const {session,saved}=fixture();
  session.receive({type:"session.input_transcript.delta",delta:"내 프로필"});
  session.receive({type:"session.delegation.created",delegation:{id:"d1",response_id:"r1"}});
  session.receive({type:"session.output_transcript.delta",delta:"확인했어요."});
  session.receive({type:"session.input_transcript.delta",delta:"고마워요"});
  await session.stop();
  assert.deepEqual(saved,[{userMessage:"내 프로필",assistantMessage:"확인했어요."},{userMessage:"고마워요",assistantMessage:""}]);
  assert.deepEqual(session.transcript.map(({role,text})=>({role,text})),[{role:"user",text:"내 프로필"},{role:"assistant",text:"확인했어요."},{role:"user",text:"고마워요"}]);
});

test("executes a completed function call once across repeated terminal events", async () => {
  const {session,tools}=fixture();
  const output=[{type:"function_call",call_id:"tool1",name:"read",arguments:"{}"}];
  session.receive({type:"response.event",delegation_id:"d1",event:{type:"response.output_item.done",response_id:"r1",item:output[0]}});
  for(let i=0;i<2;i++) session.receive({type:"response.event",delegation_id:"d1",event:{type:"response.completed",response:{id:"r1",output}}});
  await session.stop();
  assert.deepEqual(tools,["tool1"]);
});

test("does not execute tools from a failed backend response", async () => {
  const {session,tools}=fixture();
  session.receive({type:"response.event",event:{type:"response.failed",response:{id:"r1",output:[{type:"function_call",call_id:"tool1",name:"write",arguments:"{}"}]}}});
  await session.stop();
  assert.deepEqual(tools,[]);
});
