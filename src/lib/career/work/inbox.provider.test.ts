import assert from "node:assert/strict";
import test from "node:test";
import { CareerCapabilityRuntime, CareerReplyContinuation, type CareerReplyCheckpoint } from "../capabilities/runtime";
import { createCareerInputInbox, formatCareerInboxMessages } from "./inbox";
import type { TalentMessageRow } from "@/lib/talentOnboarding/models";

const row = (id: number): TalentMessageRow => ({ id, role: "user", content: `Request-${id}: 2026-12-01T09:00:00+09:00 그대로 사용해.`,
  conversation_id: "conversation", user_id: "user", message_type: "chat", payload: {}, created_at: "2026-11-04T01:00:00Z" } as TalentMessageRow);
const promptArgs = () => ({ channel: "chat" as const, isOnboardingDone: true, profile: null, structuredProfileText: "Synthetic profile", talentContextSection: "" });
const sse = (events: unknown[]) => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });

test("the next provider call gets all four pending inputs in one message; restart preserves them and completed tool results", async () => {
  const originalFetch = globalThis.fetch;
  const keys = [process.env.OPENAI_API_KEY, process.env.ANTHROPIC_API_KEY];
  process.env.OPENAI_API_KEY = "test-key"; process.env.ANTHROPIC_API_KEY = "test-key";
  try {
    const { runCareerChatAssistant, runCareerChatAssistantStream } = await import("../llm");
    for (const native of [false, true]) for (const streaming of [false, true]) {
      const model = native ? "claude-sonnet-4-6" : "gpt-6.1-sol";
      const source = [row(1)];
      let saved: CareerReplyCheckpoint | undefined, requests = 0, executions = 0;
      const save = async (checkpoint: CareerReplyCheckpoint) => { saved = structuredClone(checkpoint); };
      const make = (resume?: CareerReplyCheckpoint) => new CareerCapabilityRuntime({
        replyId: "inbox:exact", mode: "full", allowLoaders: false, promptArgs,
        eligibleTools: [{ type: "function", function: { name: "read_document", description: "Read", parameters: { type: "object", properties: {} } } }],
        deadlineAt: resume ? undefined : Date.now() + 250, checkpoint: save, resume,
        inputInbox: createCareerInputInbox({ read: async () => ({ messages: source, deliveredIds: saved?.inputMessageIds ?? [], inputIds: source.map(row => row.id), completed: false }),
          deliveredIds: resume?.inputMessageIds ?? [], save }),
      });
      globalThis.fetch = async (url, init) => {
        if (String(url).includes("/rest/v1/")) return Response.json([]);
        requests++;
        const body = JSON.parse(String(init?.body));
        const inputs: any[] = body.messages ?? body.input;
        const userInputs = inputs.filter(message => message.role === "user" && JSON.stringify(message).includes("Request-"));
        assert.equal(userInputs.length, requests === 1 ? 1 : 2, "four pending rows become one user message");
        const text = JSON.stringify(inputs);
        for (let id = 1; id <= (requests === 1 ? 1 : 5); id++) assert.equal(text.split(`Request-${id}:`).length - 1, 1);
        // Inputs arrive while the tool is in flight; its completed result must survive restart.
        if (requests === 2) {
          assert.deepEqual(saved?.inputMessageIds, [1, 2, 3, 4, 5], "receipt and transcript persisted before dispatch");
          assert.ok(text.includes("Document read exactly once"));
          return new Promise<Response>((_resolve, reject) => {
            const keepAlive = setTimeout(() => reject(new Error("Provider deadline was not enforced")), 2000);
            init!.signal!.addEventListener("abort", () => { clearTimeout(keepAlive); reject(init!.signal!.reason); }, { once: true });
          });
        }
        assert.ok(requests <= 3);
        const done = requests === 3;
        if (done) assert.ok(text.includes("Document read exactly once"));
        if (native) {
          const content = done ? [{ type: "text", text: "Five requests handled." }] : [{ type: "tool_use", id: "read-once", name: "read_document", input: {} }];
          const response = { id: `m${requests}`, model, content, stop_reason: done ? "end_turn" : "tool_use", usage: { input_tokens: 1, output_tokens: 1 } };
          return streaming ? sse([{ type: "message_start", message: response },
            ...content.flatMap((block, index) => [{ type: "content_block_start", index, content_block: block }, { type: "content_block_stop", index }]),
            { type: "message_delta", delta: { stop_reason: response.stop_reason }, usage: { output_tokens: 1 } }, { type: "message_stop" }]) : Response.json(response);
        }
        const response = { id: `r${requests}`, model, status: "completed", output: done
          ? [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Five requests handled." }] }]
          : [{ type: "function_call", call_id: "read-once", name: "read_document", arguments: "{}" }], usage: { input_tokens: 1, output_tokens: 1 } };
        return streaming ? sse([{ type: "response.completed", response }]) : Response.json(response);
      };
      const invoke = (runtime: CareerCapabilityRuntime) => {
        const step = runtime.resolveStep(false);
        const args = { primaryModel: model, toolRuntime: runtime, tools: step.tools, systemBlocks: step.systemBlocks,
          messages: [], usageLabel: "test:career-conversation-inbox", onTextDelta: () => {},
          executeTool: async () => { executions++; source.push(row(2), row(3), row(4), row(5)); return { ok: true, modelOutput: "Document read exactly once" }; } };
        return streaming ? runCareerChatAssistantStream(args) : runCareerChatAssistant(args);
      };
      await assert.rejects(invoke(make()), CareerReplyContinuation);
      assert.ok(saved);
      assert.equal(await invoke(make(saved)), "Five requests handled.");
      assert.equal(executions, 1);
      assert.equal(requests, 3);
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [i, key] of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"].entries()) {
      if (keys[i] === undefined) delete process.env[key]; else process.env[key] = keys[i];
    }
  }
});

test("inbox preserves user-authored timestamps and hidden messages remain executable input", () => {
  const message = { ...row(42), payload: { hidden: true } };
  const text = formatCareerInboxMessages([message]);
  assert.ok(text.includes(message.content));
  assert.ok(text.includes("User message 42:"));
});

test("batched card inputs retain their exact target, revision and owned attachment references", () => {
  const message = { ...row(43), payload: { careerInputAction: {
    documentIds:["owned-document"], conversationStarterId:"resume", companyRequestId:"company-request",
    coachingActivityAction:{action:"continue",activityMessageId:71,expectedRevision:4,channel:"chat"},
  } } };
  const text=formatCareerInboxMessages([message]);
  for (const reference of ["owned-document","resume","company-request","activityMessageId 71","expectedRevision 4","channel chat"])
    assert.ok(text.includes(reference));
  assert.ok(text.includes(message.content));
});

test("initial provider fallback retains the delivered input and drains newly pending inputs once", async () => {
  const originalFetch = globalThis.fetch;
  const keys = [process.env.OPENAI_API_KEY, process.env.ANTHROPIC_API_KEY];
  process.env.OPENAI_API_KEY = "test-key"; process.env.ANTHROPIC_API_KEY = "test-key";
  try {
    const { runCareerChatAssistant, runCareerChatAssistantStream } = await import("../llm");
    for (const streaming of [false, true]) {
      const messages = [row(1)];
      let calls = 0;
      const runtime = new CareerCapabilityRuntime({ mode: "full", allowLoaders: false, eligibleTools: [], promptArgs,
        inputInbox: createCareerInputInbox({ read: async () => ({ messages, deliveredIds: [], inputIds: messages.map(row => row.id), completed: false }),
          deliveredIds: [], save: async () => {} }) });
      globalThis.fetch = async (url, init) => {
        const body = JSON.parse(String(init?.body));
        if (String(url).includes("api.anthropic.com")) {
          if (messages.length === 1) messages.push(row(2), row(3), row(4), row(5));
          return Response.json({ error: "synthetic initial provider outage" }, { status: 500 });
        }
        calls++;
        const input = body.input ?? body.messages;
        for (let id = 1; id <= 5; id++) assert.equal(JSON.stringify(input).split(`Request-${id}:`).length - 1, 1);
        // Some provider adapters merge consecutive user messages. All pending
        // inputs must still share one message, with the first input retained.
        const batch = input.filter((message: any) => message.role === "user" && JSON.stringify(message).includes("Request-2:"));
        assert.equal(batch.length, 1);
        for (let id = 3; id <= 5; id++) assert.ok(JSON.stringify(batch[0]).includes(`Request-${id}:`));
        const response = { id: "fallback", model: "gpt-6.1-sol", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "All five retained." }] }], usage: { input_tokens: 1, output_tokens: 1 } };
        return streaming ? sse([{ type: "response.completed", response }]) : Response.json(response);
      };
      const step = runtime.resolveStep(false);
      const args = { modelConfig: { primaryModel: "claude-sonnet-4-6", fallbackModel: "gpt-6.1-sol", anthropicOverloadFallbackModel: "gpt-6.1-sol" },
        toolRuntime: runtime, tools: [], systemBlocks: step.systemBlocks, messages: [], executeTool: async () => {}, onTextDelta: () => {}, usageLabel: "test:career-inbox-fallback" };
      assert.equal(await (streaming ? runCareerChatAssistantStream(args) : runCareerChatAssistant(args)), "All five retained.");
      assert.equal(calls, 1);
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [i, key] of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"].entries()) {
      if (keys[i] === undefined) delete process.env[key]; else process.env[key] = keys[i];
    }
  }
});

test("an inbox is checked even when the current execution offers no tools", async () => {
  const originalFetch = globalThis.fetch;
  const keys = [process.env.OPENAI_API_KEY, process.env.ANTHROPIC_API_KEY];
  process.env.OPENAI_API_KEY = "test-key"; process.env.ANTHROPIC_API_KEY = "test-key";
  try {
    const { runCareerChatAssistant } = await import("../llm");
    for (const native of [false, true]) {
      let saved = false;
      const model = native ? "claude-sonnet-4-6" : "gpt-6.1-sol";
      const runtime = new CareerCapabilityRuntime({ mode: "full", allowLoaders: false, eligibleTools: [], promptArgs,
        inputInbox: createCareerInputInbox({ read: async () => ({ messages: [row(1)], deliveredIds: [], inputIds: [1], completed: false }), deliveredIds: [], save: async () => { saved = true; } }) });
      globalThis.fetch = async (_url, init) => {
        assert.equal(saved, true);
        assert.ok(String(init?.body).includes("Request-1:"));
        return native ? Response.json({ id: "m", model, content: [{ type: "text", text: "Done" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } })
          : Response.json({ id: "r", model, status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Done" }] }], usage: { input_tokens: 1, output_tokens: 1 } });
      };
      const step = runtime.resolveStep(false);
      assert.equal(await runCareerChatAssistant({ primaryModel: model, toolRuntime: runtime, tools: [], systemBlocks: step.systemBlocks, messages: [], executeTool: async () => {}, usageLabel: "test:career-empty-tool-inbox" }), "Done");
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [i, key] of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"].entries()) {
      if (keys[i] === undefined) delete process.env[key]; else process.env[key] = keys[i];
    }
  }
});

test("new input stops unstarted calls in a batch with valid tool results on every provider path", async () => {
  const originalFetch = globalThis.fetch;
  const keys = [process.env.OPENAI_API_KEY, process.env.ANTHROPIC_API_KEY];
  process.env.OPENAI_API_KEY = "test-key"; process.env.ANTHROPIC_API_KEY = "test-key";
  try {
    const { runCareerChatAssistant, runCareerChatAssistantStream } = await import("../llm");
    for (const native of [false,true]) for (const streaming of [false,true]) for (const duringModel of [false,true]) {
      const source = [row(1)]; let calls=0, executions=0;
      const model = native ? "claude-sonnet-4-6" : "gpt-6.1-sol";
      const runtime = new CareerCapabilityRuntime({mode:"full",allowLoaders:false,promptArgs,
        eligibleTools:[{type:"function",function:{name:"read_document",description:"Read",parameters:{type:"object",properties:{}}}}],
        inputInbox:createCareerInputInbox({deliveredIds:[],save:async()=>{},read:async()=>({messages:source,deliveredIds:[],inputIds:source.map(m=>m.id),completed:false})})});
      globalThis.fetch = async (_url,init) => {
        calls++; const body=JSON.parse(String(init?.body));
        if(calls===1 && duringModel)source.push(row(2));
        if(calls===2){
          const input=body.messages??body.input;
          const text=JSON.stringify(input);
          assert.equal(text.split("Request-2:").length-1,1);
          assert.equal(text.split("Not executed: new conversation input arrived.").length-1,duringModel?3:2);
          if(native){
            const blocks=input.flatMap((m:any)=>Array.isArray(m.content)?m.content:[]);
            assert.deepEqual(blocks.filter((b:any)=>b.type==="tool_use").map((b:any)=>b.id),["call-0","call-1","call-2"]);
            assert.deepEqual(blocks.filter((b:any)=>b.type==="tool_result").map((b:any)=>b.tool_use_id),["call-0","call-1","call-2"]);
          }else assert.deepEqual(input.filter((m:any)=>m.type==="function_call_output").map((m:any)=>m.call_id),["call-0","call-1","call-2"]);
        }
        assert.ok(calls<=2);
        const done=calls===2;
        if(native){
          const content=done?[{type:"text",text:"Updated instruction handled."}]:Array.from({length:3},(_,i)=>({type:"tool_use",id:`call-${i}`,name:"read_document",input:{}}));
          const response={id:`m${calls}`,model,content,stop_reason:done?"end_turn":"tool_use",usage:{input_tokens:1,output_tokens:1}};
          return streaming?sse([{type:"message_start",message:response},...content.flatMap((block,index)=>[{type:"content_block_start",index,content_block:block},{type:"content_block_stop",index}]),{type:"message_delta",delta:{stop_reason:response.stop_reason},usage:{output_tokens:1}},{type:"message_stop"}]):Response.json(response);
        }
        const response={id:`r${calls}`,model,status:"completed",output:done?[{type:"message",role:"assistant",content:[{type:"output_text",text:"Updated instruction handled."}]}]:Array.from({length:3},(_,i)=>({type:"function_call",call_id:`call-${i}`,name:"read_document",arguments:"{}"})),usage:{input_tokens:1,output_tokens:1}};
        return streaming?sse([{type:"response.completed",response}]):Response.json(response);
      };
      const step=runtime.resolveStep(false);
      const args={primaryModel:model,toolRuntime:runtime,tools:step.tools,systemBlocks:step.systemBlocks,messages:[],usageLabel:"test:career-mid-batch",onTextDelta:()=>{},
        executeTool:async()=>{executions++;source.push(row(2));return {ok:true,modelOutput:"Read completed"};}};
      assert.equal(await(streaming?runCareerChatAssistantStream(args):runCareerChatAssistant(args)),"Updated instruction handled.");
      assert.equal(executions,duringModel?0:1);
    }
  } finally {
    globalThis.fetch=originalFetch;
    for(const [i,key] of ["OPENAI_API_KEY","ANTHROPIC_API_KEY"].entries())if(keys[i]===undefined)delete process.env[key];else process.env[key]=keys[i];
  }
});
