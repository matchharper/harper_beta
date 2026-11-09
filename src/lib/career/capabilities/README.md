# Career capabilities and handbooks

The post-onboarding text runtime supplies general tools without an application mode. Account, channel and trusted caller eligibility are resolved before loading; a loader never broadens that boundary. Onboarding, Realtime voice and explicitly tool-free callers keep their own contracts.

`registry.ts` defines reusable capability bundles. The full eligible catalog remains visible; `load_career_capabilities` exposes a bundle's schemas and policies from the next completion. The original assistant also has `load_handbook`. Internal loading has no UI status, external effect or consent implication.

`manage_work` belongs to the manually loaded `delegation` capability. The catalog exposes its purpose, but Decisions and full mode do not automatically load it. A delegate can use its own management contract immediately. Delegation is optional for independent reasoning/context, not a requirement for multiple messages, multiple applications or human waits.

`web_search` and `open_url` are core tools, immediately callable whenever the channel/caller allows them. There is no Career `web_research` bundle or loading step. Existing caller eligibility still applies.

## Turn preparation

`server.ts` accepts the claimed conversation reply, current handbook state and a text selector input. `decisions.ts` performs one OpenAI Decisions request for that logical reply, selecting bundles and handbooks independently. It provides recent conversation messages, exact current references, previous tool execution facts and active handbook leases. It does not send full schemas, handbook bodies or internal object dumps. Failure leaves ordinary loaders available. A continuation reuses its saved selection and transcript.

New turns do not automatically restore the old tool leases. Previous availability and use inform the selector; current selection and explicit loads determine the offered tools. `lease.ts` still reads historical records, including the former resume capability, for compatibility. The old application capability is no longer offered.

`CareerCapabilityRuntime.resolveStep()` is a read/assembly operation. It neither calls Decisions nor consumes handbook replies. Provider loops call `beforeCompletion()` immediately before sending the actual assembled input; this records the handbook versions supplied to that completion. All provider paths share this runtime and its offered-tool snapshot.

## Handbook lifecycle and continuation

There are two guides: `resume` and `application`, under `../handbooks/`. Their actual character counts are computed from versioned source text. The body appears once in system/developer context, after the cached profile/Brief prefix; the loader result contains only the receipt.

An active guide lasts three delivered logical replies. Multiple tool completions, previews, fallback calls and stream chunks consume no additional replies. The first completed reply after loading counts as one only if a provider request actually received the guide. Selecting an already-active guide does not renew it. Explicit manual reload renews it, idempotently within the same reply. There is no wall-clock expiration.

`../agentTurnRuntime.server.ts` claims the reply through server-only RPCs. Authoritative state lives in `talent_agent_runtime.state`, keyed by conversation: claim ownership, handbook counters, previous execution facts and an unfinished provider transcript. It is separate from client-readable conversation rows. `complete()` persists the counter only after a completed user-facing reply is stored. Assistant payloads also contain `agentTurn: {replyId, record, handbooks}` so the claim RPC can recover a crash after message persistence without replaying tools. Message traces are not the authoritative counter, so deleting a message cannot revive a lease. Errors, cancellation and checkpointing do not consume a reply.

There is no arbitrary domain-call or loader-attempt cap. A real caller deadline and abort signal control execution. `runCompletion()` combines the remaining request deadline with cancellation; a deadline before or during a provider request persists a `CareerReplyCheckpoint` containing provider-native messages (including completed tool results), current tools/system blocks, model/transport, loaded capabilities and handbook execution facts. After durable persistence it throws `CareerReplyContinuation`, a control signal. The caller queues the same logical reply and source message. Resume uses the saved model and transcript without replaying prior external effects. User cancellation does not enqueue work. Browser sessions retain their executor lifecycle while the caller awaits completion. Completed tool inputs and model-facing outputs remain in the existing turn receipt and are projected into subsequent conversation history. Successful empty finals retain that receipt; finalization does not invoke a second writer.

Checkpoints are keyed by logical reply, so a later user reply cannot overwrite a queued transcript. Resume adds the exact subsequent user messages (with an explicit history boundary) and refreshes handbook counters from current authoritative state; it cannot restore a lease consumed while queued. Only explicit loads within the resumed reply retain their new lease.

Career Stop records `careerTurnStopped` on the original user message. A Stop before the first SSE event records a hidden `career_turn_stop` receipt keyed by the client's request ID; the source insert and Stop endpoint both check the other side, so neither ordering loses cancellation. A claimed turn observes the durable flag before model/tool execution and every two seconds during an in-flight call. Its existing reply claim settles cancelled checkpoints without consuming handbook replies. Matching and browser executors reuse their cancellation contracts; already dispatched Gmail writes retain their real success or uncertain outcome. Completed results, saved settings and schedules remain intact. Stop preserves visible partial text and appears in subsequent model history as an execution fact; it does not generate a final assistant reply.

The existing every-minute dispatch route repairs a saved-checkpoint/failed-publish gap. A server-only batch claim gives pending generic checkpoints a two-minute dispatch lease and returns only queue routing facts. Each checkpoint has a distinct publication key, including repeated timeouts with unchanged transcript length. Failed publishing is retried after that lease; the same reply claim and publication key prevent duplicate work. Adapter-owned email checkpoints stay in the email queue. The recovery scanner never publishes private provider transcripts into queue payloads.

## Conversation execution and optional delegation

Post-onboarding text inputs, including card actions and saved answers, enter the same durable inbox without owning a browser stream. The original conversation consumes pending messages before a model completion and checks for newer input before each individual tool call. Unstarted calls in an already-issued batch receive explicit non-execution results; the provider transcript remains valid before the new input is appended. An in-flight synchronous tool is allowed to finish. This does not run another conversation LLM during that tool.

Browser tools wait for their result before the original conversation can call the model or execute another tool. If the host deadline expires, the exact transcript and pending run are checkpointed. A terminal result that needs human input is also a completed browser call; the model receives it immediately while the executor retains human ownership until Done. The same reply resumes when that run finishes; the completed observation is attached to its original tool result, not admitted as another conversation invocation. User inputs arriving during the wait stay in the same inbox. Evaluation receipts and explicitly delegated results still use the existing event path. Browser control-return resumes its existing owner. They are not synthetic user authorization. Delivery receipts and the exact transcript are checkpointed together; late inputs/events pass to a successor under the conversation lock. Existing private delegated checkpoints retain their own resumable transcript.

Delegates persist their final text privately in the invocation result. They cannot call the user-contact or form tools; the originating conversation owns explanations and questions. Public tool labels appear under the originating reply while running and are preserved with the delivered result. The main conversation receives actual work notes, evidence references and remaining needs. There is no extra summarizer LLM.

Conversation-owned browser execution/email effects use the same stable effect identity and dispatch receipt pattern as delegated work. A live claim, source ownership, Stop and unread inputs fence dispatch. A completed receipt is reused across replies; an uncertain dispatch is not automatically repeated. Stop also covers receipts still pending after the visible reply finished.

## Observability and verification

Selector and original-model calls share request/user/conversation/source attribution. Decisions usage uses endpoint pricing and a distinct preload label, not recommendation-tool or normal completion prices. Compare total end-to-end latency and billed cost; attribution rows are not new charges. The selector's performance benefit is a hypothesis, not a guarantee.

`generalRuntime.test.ts` verifies selector input/response structure, fail-open behavior, exact handbook consumption and deadline/cancellation. `generalProvider.test.ts` renders the actual native/OpenAI request payloads in streaming and ordinary paths, confirming next-completion injection, dedicated tool-result text and hidden loader UI. These tests use mocked providers and perform no paid model or external business actions.

Local, preview and production queue consumers are isolated by executor-owned environment metadata. Model arguments cannot select that environment; claims, inbox merging and checkpoint recovery use the same boundary.
