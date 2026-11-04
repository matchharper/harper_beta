# Email application agent

2026-11-02. Canonical runner: `scripts/evalEmailApplicationAgent.ts`.

Unit: a synthetic multi-turn email application using the production Career model/provider loop, capability/handbook loader, email prompt/tool/result adapters, actual form/browser executors against an in-memory ownership/revision store, and the production HTML/plain-text renderer. Database, document inventory and browser-provider observations are synthetic. It does not call the production email consumer, Queue, Resend, Gmail or real application sites. No real submission or mail delivery occurs.

`cases-v2.json` and `gold-v1.json` are frozen before their model calls; `manifest-v2.json` records their SHA-256 digests. V1 is retained: its sequential provider observations incorrectly advanced read-only inspections to submission receipts, invalidating the full v1 run. V2 binds observations to user turns and supplies the complete review fields/consent text. Repeated inspections return the same state. This fixture cannot judge whether the requested browser action would produce that state; a reviewer must check every browser task and its authority. Model/prompt changes create new runs. Runner reads provider credentials from `.env.local`, replaces database credentials with inert values, and blocks all network except the configured model APIs. Raw requests, responses, tool inputs/results and MIME previews stay in ignored owner-only `runs/`.

Run: `node --import tsx scripts/evalEmailApplicationAgent.ts [--only <case-id>]`. Default model and reasoning come from production `emailAssistantModel()` (same default as Career web). No evaluator LLM or wording gate. Machine checks cover call/schema validity and nonempty deliverable email. Calls and session identity are recorded for manual review, including duplicate submission requests. Codex reads all emails, proposed forms and browser tasks against the frozen rubric: latest request fulfilled, exact corrections/authority preserved, review actually readable in email, useful authenticated login link, no invented receipt or implied recipient reading, no redundant approval after the approved review.

Release gate: all selected structural checks and manual review pass. Focused unit tests additionally cover deadline yield/resumption, no redispatch, authenticated viewer links and hidden-artifact delivery. Results do not prove production deployment, real browser navigation, inbox reception, arbitrary website compatibility or representative quality/latency. No deployment is authorized.

Local implementation and reviewed run: [2026-11-02 report](reports/2026-11-02.md).

The workspace's earlier evaluation index and email-channel-reply files were already deleted in the working tree. Their HEAD instructions were read without restoring those user deletions. This is a separately registered task, not an overwrite of their frozen datasets.
