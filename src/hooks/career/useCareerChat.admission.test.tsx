import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { User } from "@supabase/supabase-js";
import { MessagesProvider } from "@/i18n/useMessage";

test("post-onboarding card actions and saved answers are admitted together without locking chat or losing their references", async () => {
  const { useCareerChat } = await import("./useCareerChat");
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/career" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window:dom.window, document:dom.window.document, CustomEvent:dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT:true })) {
    originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  let api!: ReturnType<typeof useCareerChat>;
  const requests: Record<string,unknown>[] = [];
  const finish: Array<()=>void> = [];
  let admissions = 0;
  const fetchWithAuth = async (_url:string, init?:RequestInit) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    const id = requests.length;
    return new Promise<Response>(resolve => finish.push(() => resolve(Response.json({userMessage:{
      id, role:"user", content:body.message || "Saved written answers", messageType:"chat", clientRequestId:body.clientRequestId,
    }},{status:202}))));
  };
  function Harness() {
    api=useCareerChat({user:{id:"user"} as User,conversationId:"conversation",isOnboardingDone:true,sessionPending:false,
      persistedMessages:[],fetchWithAuth,hasDurableWork:true,onRequestAdmitted:()=>{admissions++;}});
    return null;
  }
  const root=createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async()=>root.render(<MessagesProvider locale="ko"><Harness /></MessagesProvider>));
    const inputs: Parameters<typeof api.sendChatMessage>[0][] = [
      {text:"Other question"},
      {text:"Career check-in",conversationStarterId:"career_check_in"},
      {text:"Continue coaching",coachingActivityAction:{action:"start",activityMessageId:71,expectedRevision:4,channel:"chat"}},
      {text:"Approved the reviewed document",formResponseMessageId:20},
      {text:"",internalCallAnswerSubmission:{callId:"written-call",questions:["First?"],responses:[{questionIndex:0,decision:"answer",text:"Original answer"}]}},
    ];
    let pending!: Promise<void>[];
    await act(async()=>{pending=inputs.map(input=>api.sendChatMessage(input));});
    assert.equal(requests.length,5,"every action reaches admission before any HTTP request finishes");
    assert.equal(api.chatPending,false);
    assert.equal(new Set(requests.map(request=>request.clientRequestId)).size,5);
    requests.forEach((request,index)=>{
      assert.equal(request.durable,true);
      assert.equal(request.message,inputs[index].text);
      for (const key of ["conversationStarterId","coachingActivityAction","formResponseMessageId","internalCallAnswerSubmission"] as const)
        assert.deepEqual(request[key],inputs[index][key]);
    });
    await act(async()=>{finish.toReversed().forEach(resolve=>resolve());await Promise.all(pending);});
    assert.equal(admissions,5);
    assert.equal(api.messages.length,5);
    assert.ok(api.messages.every(message=>message.role==="user"&&!String(message.id).startsWith("temp-")));
    assert.equal(api.chatError,"");
  } finally {
    await act(async()=>root.unmount());dom.window.close();
    for (const [key,descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);
    }
  }
});
