import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";
import http from "node:http";
import dns from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { SubmissionGate, hash } from "./gate.mjs";
import { readForm, fillObservedFields } from "./form.mjs";
import { inspectionSnapshotText, questionReportSchema } from "./inspectionText.mjs";
import {
  createBrowserUseSession,
  stopBrowserUseSession,
  browserUseStagehandOptions,
} from "./browserUseCloud.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const MAX_STEPS = 100;
const denied = new BlockList();
for (const [ip, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
])
  denied.addSubnet(ip, bits, "ipv4");
for (const [ip, bits] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
])
  denied.addSubnet(ip, bits, "ipv6");
export async function publicDestination(value) {
  try {
    const u = new URL(value),
      host = u.hostname.replace(/^\[|\]$/g, "");
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      (u.port && u.port !== "443")
    )
      return false;
    const addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await dns.lookup(host, { all: true });
    return (
      addresses.length > 0 &&
      addresses.every(
        (a) => !denied.check(a.address, a.family === 6 ? "ipv6" : "ipv4")
      )
    );
  } catch {
    return false;
  }
}

export async function startWorker(config, directory) {
  const workerStarted = Date.now();
  const [{ default: Browserbase }, { Stagehand, tool }, { chromium }, { z }] =
    await Promise.all([
      import("@browserbasehq/sdk"),
      import("@browserbasehq/stagehand"),
      import("playwright-core"),
      import("zod"),
    ]);
  if (!(await publicDestination(config.url)))
    throw Error("A public HTTPS application URL is required");
  const useBrowserUse = config.browserProvider === "browser-use";
  const bb = useBrowserUse
    ? undefined
    : new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
  let session, stagehand, browser, server;
  const controller = new AbortController(),
    files = new Map(),
    answers = new Map(),
    commands = new Map(),
    choosers = new Map();
  const state = {
    status: "starting",
    required_actions: [],
    steps: 0,
    usage: [],
    requestsStarted: 0,
    progress: [],
    maxSteps: MAX_STEPS,
    timings: { snapshots: [], model: [], tools: [] },
  };
  let testSafety;
  let dataEntered = false,
    lastSnapshot = { url: config.url, fields: [] },
    started = false,
    closed = false;
  const wake = new Set();
  const changed = () => {
    for (const resolve of wake) resolve();
    wake.clear();
  };
  const events = [];
  const trace = (kind, message, data) => {
    if (!config.readOnly || !config.diagnostics) return;
    events.push({ sequence: events.length + 1, at: new Date().toISOString(), kind, message, data });
    changed();
  };
  const gate = new SubmissionGate((item) => {
    state.pendingRequest = item || undefined;
    state.required_actions = item
      ? [
          {
            type: "function_call",
            name: "confirm_application_submission",
            call_id: item.id,
            turn_id: "stagehand",
          },
        ]
      : [];
    state.status = item ? "waiting" : "running";
    changed();
  });
  const waitForDecision = async () => {
    while (gate.pending || answers.size) {
      await new Promise((r) => wake.add(r));
      controller.signal.throwIfAborted();
    }
  };
  const ask = async (name, args) => {
    await waitForDecision();
    const id = randomUUID();
    state.required_actions = [
      {
        type: "function_call",
        name,
        call_id: id,
        turn_id: "stagehand",
        arguments: args,
      },
    ];
    state.status = "waiting";
    changed();
    return new Promise((resolve) => answers.set(id, resolve));
  };
  const fieldTargets = new Map();
  const registryKey = "__harperFields_" + randomUUID().replaceAll("-", "");
  const snapshot = async ({ detailed = true } = {}) => {
    const began = Date.now();
    const pages = browser.contexts()[0].pages();
    const scopes = pages.flatMap((p, pageIndex) =>
      p.frames().map((frame, frameIndex) => ({ frame, pageIndex, frameIndex }))
    );
    const results = await Promise.all(
      scopes.map(async (scope) => ({
        ...scope,
        result: await scope.frame
          .evaluate(readForm, { detailed, key: registryKey })
          .catch(() => null),
      }))
    );
    const elements = [],
      texts = [],
      fields = [];
    if (detailed) fieldTargets.clear();
    for (const { frame, pageIndex, frameIndex, result } of results) {
      if (!result) continue;
      if (result.text) texts.push(result.text);
      for (const field of result.fields) {
        fields.push({ label: field.label, value: field.value });
        if (detailed) {
          elements.push({ ...field, pageIndex, frameIndex });
          fieldTargets.set(field.ref, frame);
        }
      }
    }
    lastSnapshot = {
      ...lastSnapshot,
      url: pages.at(-1)?.url() || config.url,
      fields,
      ...(detailed
        ? {
            title:
              results.filter(
                (r) => r.pageIndex === pages.length - 1 && r.frameIndex === 0
              )[0]?.result?.title || "",
            text: texts.join("\n\n").slice(0, 40000),
            elements,
          }
        : {}),
    };
    state.snapshot = lastSnapshot;
    if (detailed) trace("snapshot", "페이지·입력 필드 읽기", { ...lastSnapshot, durationMs: Date.now() - began });
    if (detailed) testSafety?.recordSnapshot(lastSnapshot);
    state.timings.snapshots.push({
      ms: Date.now() - began,
      detailed,
      frames: scopes.length,
    });
    return lastSnapshot;
  };
  const close = async () => {
    if (closed) return;
    closed = true;
    controller.abort();
    await gate.close();
    changed();
    for (const r of answers.values()) r({ cancelled: true });
    answers.clear();
    await browser?.close().catch(() => {});
    await stagehand?.close().catch(() => {});
    if (session && useBrowserUse)
      await stopBrowserUseSession(session.id).catch(() => {});
    else if (session)
      await bb.sessions
        .update(session.id, {
          projectId: process.env.BROWSERBASE_PROJECT_ID,
          status: "REQUEST_RELEASE",
        })
        .catch(() => {});
    server?.close();
  };
  try {
    session = useBrowserUse
      ? await createBrowserUseSession()
      : await bb.sessions.create({
          projectId: process.env.BROWSERBASE_PROJECT_ID,
          timeout: 1800,
          proxies: false,
          region: "us-east-1",
          browserSettings: {
            solveCaptchas: false,
            viewport: { width: 1280, height: 960 },
          },
        });
    state.sessionId = session.id;
    await fs.writeFile(path.join(directory, "session-id"), session.id, {
      mode: 0o600,
    });
    const model = {
      modelName: "openai/gpt-6-luna",
      apiKey: process.env.OPENAI_API_KEY,
      middleware: {
        transformParams: async ({ params }) => {
          const { temperature, topP, ...rest } = params;
          return {
            ...rest,
            maxOutputTokens: 128000,
            providerOptions: {
              ...rest.providerOptions,
              openai: {
                ...rest.providerOptions?.openai,
                store: false,
                reasoningEffort: "medium",
              },
            },
          };
        },
      },
      fetch: async (url, options) => {
        const began = Date.now();
        state.requestsStarted++;
        trace("model", "모델 요청 시작", { model: "gpt-6-luna" });
        const response = await fetch(url, options),
          raw = await response
            .clone()
            .json()
            .catch(() => null);
        state.timings.model.push({
          ms: Date.now() - began,
          status: response.status,
        });
        state.usage.push({
          status: response.status,
          id: raw?.id,
          model: raw?.model,
          usage: raw?.usage,
        });
        trace("model", "모델 응답 수신", { status: response.status, durationMs: Date.now() - began, responseId: raw?.id, error: raw?.error?.message });
        return response;
      },
    };
    stagehand = new Stagehand({
      ...(useBrowserUse
        ? browserUseStagehandOptions(session)
        : {
            env: "BROWSERBASE",
            apiKey: process.env.BROWSERBASE_API_KEY,
            projectId: process.env.BROWSERBASE_PROJECT_ID,
            browserbaseSessionID: session.id,
          }),
      disableAPI: true,
      experimental: true,
      model,
      verbose: 0,
      disablePino: true,
      logger: () => {},
    });
    await stagehand.init();
    browser = await chromium.connectOverCDP(session.connectUrl);
    const context = browser.contexts()[0];
    const observePage = (page) => {
      page.on("framenavigated", (frame) => trace("navigation", "페이지 이동", { url: frame.url(), mainFrame: frame === page.mainFrame() }));
      page.on("pageerror", (error) => trace("page_error", error.message));
      page.on("console", (message) => trace("console", message.text(), { type: message.type(), location: message.location() }));
      page.on("requestfailed", (request) => trace("request_error", "페이지 요청 실패", { url: request.url(), method: request.method(), error: request.failure()?.errorText }));
      page.on("response", (response) => {
        if (response.status() >= 400) trace("http_error", "페이지 HTTP 오류", { url: response.url(), status: response.status() });
      });
    };
    if (config.readOnly && config.diagnostics) {
      context.pages().forEach(observePage);
      context.on("page", observePage);
    }
    if (config.preSubmitTest) {
      const { installPreSubmitTest } = await import("./preSubmitTest.mjs");
      testSafety = await installPreSubmitTest({ context, config, state, tool, z, snapshot });
    }
    await context.exposeBinding("__harperInputObserved", () => {
      dataEntered = true;
    });
    await context.addInitScript((readOnly) => {
      navigator.sendBeacon = () => false;
      for (const type of ["input", "change"])
        document.addEventListener(
          type,
          () => {
            void window.__harperInputObserved();
          },
          true
        );
      if (readOnly) {
        document.addEventListener(
          "submit",
          (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
          },
          true
        );
        document.addEventListener(
          "click",
          (e) => {
            const t =
              e.target instanceof Element
                ? e.target.closest("input,textarea,select,button")
                : null;
            if (t && (t.matches("input,textarea,select") || t.form)) {
              e.preventDefault();
              e.stopImmediatePropagation();
            }
          },
          true
        );
        HTMLFormElement.prototype.submit = function () {};
        HTMLFormElement.prototype.requestSubmit = function () {};
      }
    }, !!config.readOnly);
    const watch = (p) => p.on("filechooser", (c) => choosers.set(p, c));
    context.pages().forEach(watch);
    context.on("page", watch);
    await context.routeWebSocket("**", (ws) => ws.close());
    await context.route("**/*", async (route) => {
      const r = route.request();
      if (!(await publicDestination(r.url())))
        return route.abort("blockedbyclient");
      if (testSafety) return testSafety.route(route);
      const read = ["GET", "HEAD", "OPTIONS"].includes(r.method());
      if (config.readOnly) {
        if (read) return route.continue();
        let j;
        try {
          j = JSON.parse(r.postData() || "");
        } catch {}
        // No supplied candidate data in inspection. Only single explicit reads.
        if (
          j &&
          typeof j.query === "string" &&
          /^\s*query\b/.test(j.query) &&
          !j.query.includes("mutation")
        )
          return route.continue();
        trace("blocked_request", "읽기 전용 정책으로 요청 차단", { method: r.method(), url: r.url() });
        return route.abort("blockedbyclient");
      }
      if (!dataEntered) return route.continue();
      // Static/read requests are not a grant to send typed values in a query.
      const u = new URL(r.url()),
        values = [...u.searchParams.values()];
      const containsField = lastSnapshot.fields.some(
        (f) => f.value && values.includes(f.value)
      );
      if (read && !containsField) return route.continue();
      if (
        read &&
        r.redirectedFrom() &&
        r.redirectedFrom().method() === "POST" &&
        new URL(r.redirectedFrom().url()).origin === u.origin
      )
        return route.continue();
      if (gate.denied || answers.size) return route.abort("blockedbyclient");
      // Renderer may be blocked by a held navigation: use pre-gesture fields,
      // and always show the immutable actual request body in the review.
      return gate.hold(route, lastSnapshot);
    });
    const addFiles = (items) => {
      if (config.readOnly && items.length)
        throw Error("Inspection cannot receive documents");
      for (const f of items) {
        if (
          !f.data &&
          (!f.path?.startsWith("/workspace/attachments/") ||
            path.resolve(f.path) !== f.path)
        )
          throw Error("Invalid attachment path");
        const bytes = f.data
          ? Buffer.from(f.data, "base64")
          : readFileSync(f.path);
        if (
          !bytes.length ||
          bytes.length > 5 * 1024 * 1024 ||
          !f.documentId ||
          !f.name
        )
          throw Error("Invalid application attachment");
        if (f.contentHash && f.contentHash !== hash(bytes))
          throw Error("Attachment bytes differ");
        files.set(f.documentId, {
          name: f.name,
          mimeType: f.mimeType || "application/pdf",
          buffer: bytes,
        });
      }
    };
    addFiles(config.files || []);
    const tools = {
      inspectCurrentFields: tool({
        description:
          "Read current application fields, values, validation, file names and source text in all tabs/frames. No submission.",
        inputSchema: z.object({}),
        execute: async () => {
          const observed = await snapshot();
          return config.readOnly ? inspectionSnapshotText(observed) : observed;
        },
      }),
      ...(config.readOnly
        ? {
            report_application_form: tool({
              description:
                config.inspectionMode === "questions"
                  ? "Report observed application questions with input types, required state, choices and file restrictions, and any unread portions or access barriers."
                  : "Report observed application input refs from the most recent inspectCurrentFields result. No invented refs. Include observed access limitations; supported means accessible, never guaranteed submission.",
              inputSchema: config.inspectionMode === "questions" ? questionReportSchema(z) : z.object({
                status: z.enum(["read", "partial", "unavailable"]),
                fieldRefs: z.array(z.string()),
                limitations: z.array(z.string()),
                submission: z.object({
                  status: z.enum(["supported", "unsupported", "unknown"]),
                  reason: z.string(),
                }),
              }),
              execute: async (report) => {
                state.report = report;
                trace("report", "지원 폼 조사 보고", report);
                state.status = "completed";
                changed();
                return "Application inspection report recorded.";
              },
            }),
          }
        : {
            fillObservedFields: tool({
              description:
                "Fill multiple confirmed ordinary fields in ONE call using refs from inspectCurrentFields. Directly sets text/date/number, native select values and checkbox states without another model call. No submit/click. Stops on a held request or first error; completed refs have already changed, so never replay them. Use observed UI tools for custom dropdown result selection. Returns current fields for verification.",
              inputSchema: z.object({
                fields: z
                  .array(
                    z.discriminatedUnion("action", [
                      z.object({
                        ref: z.string(),
                        action: z.literal("fill"),
                        value: z.string(),
                      }),
                      z.object({
                        ref: z.string(),
                        action: z.literal("select"),
                        value: z.string(),
                      }),
                      z.object({
                        ref: z.string(),
                        action: z.literal("check"),
                        checked: z.boolean(),
                      }),
                    ])
                  )
                  .min(1)
                  .max(50),
              }),
              execute: async ({ fields: items }) => {
                if (new Set(items.map((i) => i.ref)).size !== items.length)
                  throw Error("Use each field only once per batch");
                dataEntered = true;
                const result = await fillObservedFields(items, {
                  blocked: () =>
                    !!gate.pending ||
                    gate.denied ||
                    answers.size > 0 ||
                    controller.signal.aborted,
                  resolve: async (ref) => {
                    const f = fieldTargets.get(ref);
                    if (!f) return null;
                    const h = await f.evaluateHandle(
                      ({ key, ref }) => globalThis[key]?.nodes.get(ref) || null,
                      { key: registryKey, ref }
                    );
                    const e = h.asElement();
                    if (!e) await h.dispose();
                    return e;
                  },
                });
                if (gate.pending) return { ...result, awaitingApproval: true };
                return { ...result, snapshot: await snapshot() };
              },
            }),
            listAttachmentInputs: tool({
              description:
                "List real file inputs in all tabs/frames and pending native file choosers.",
              inputSchema: z.object({}),
              execute: async () => {
                const inputs = [];
                for (const [pageIndex, p] of context.pages().entries())
                  for (const [frameIndex, f] of p.frames().entries()) {
                    const es = await f
                      .locator("input[type=file]")
                      .evaluateAll((es) =>
                        es.map((e, index) => ({
                          index,
                          label:
                            [...(e.labels || [])]
                              .map((l) => l.textContent)
                              .join(" ") ||
                            e.getAttribute("aria-label") ||
                            e.name,
                          accept: e.accept,
                        }))
                      )
                      .catch(() => []);
                    inputs.push(
                      ...es.map((e) => ({ ...e, pageIndex, frameIndex }))
                    );
                  }
                return {
                  inputs,
                  pendingFileChoosers: [...choosers.keys()].map((p) =>
                    context.pages().indexOf(p)
                  ),
                };
              },
            }),
            attachDocument: tool({
              description:
                "Attach an authorized document by ID, preserving its name and bytes. Specify a listed input or pending native chooser. Website transmission may pause for user approval; never replay a held upload.",
              inputSchema: z.object({
                documentId: z.string(),
                pageIndex: z.number().int().min(0),
                frameIndex: z.number().int().min(0).optional(),
                index: z.number().int().min(0).optional(),
                fileChooser: z.boolean().optional(),
              }),
              execute: async ({
                documentId,
                pageIndex,
                frameIndex = 0,
                index = 0,
                fileChooser = false,
              }) => {
                const doc = files.get(documentId),
                  p = context.pages()[pageIndex];
                if (!doc || !p) throw Error("Unknown document or page");
                dataEntered = true;
                testSafety?.beginAttachment(documentId);
                if (fileChooser) {
                  const c = choosers.get(p);
                  if (!c) throw Error("Open the attachment chooser first");
                  await c.setFiles(doc);
                  choosers.delete(p);
                } else
                  await p
                    .frames()
                    [frameIndex].locator("input[type=file]")
                    .nth(index)
                    .setInputFiles(doc, { timeout: 15000 });
                await sleep(300);
                testSafety?.recordAttachment({ documentId, name: doc.name, size: doc.buffer.length, sha256: hash(doc.buffer) });
                return { documentId, name: doc.name, size: doc.buffer.length };
              },
            }),
            request_application_information: tool({
              description:
                "Ask for missing confirmed facts or review of a new substantive answer. Pauses until the existing Harper question UI receives an answer. Reuse supplied answers.",
              inputSchema: z.object({
                purpose: z.string(),
                reviewMarkdown: z.string().optional(),
                items: z
                  .array(
                    z.object({
                      kind: z.enum([
                        "change",
                        "question",
                        "choice",
                        "material",
                      ]),
                      title: z.string(),
                      description: z.string().optional(),
                      options: z
                        .array(z.object({ id: z.string(), label: z.string() }))
                        .optional(),
                    })
                  )
                  .min(1)
                  .max(20),
              }),
              execute: (args) => ask("request_application_information", args),
            }),
            report_application_outcome: tool({
              description:
                "Report actual observed outcome. Success requires an approved transmission and a visible receipt/confirmation. Never infer success from a click or model completion.",
              inputSchema: z.object({
                status: z.enum(["succeeded", "failed", "uncertain"]),
                summary: z.string(),
                url: z.string().url(),
                evidence: z.string(),
                emailNotice: z.boolean().optional(),
              }),
              execute: async (args) => {
                await snapshot();
                return ask("report_application_outcome", args);
              },
            }),
          }),
    };
    if (testSafety) Object.assign(tools, testSafety.tools);
    const execute = async (instruction) => {
      try {
        await stagehand.context
          .pages()[0]
          .goto(config.url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await snapshot();
        state.status = "running";
        const result = await stagehand
          .agent({ mode: "hybrid", model, tools })
          .execute({
            instruction:
              instruction +
              "\nInitial observed page (reuse it until navigation or a control changes):\n" +
              (config.readOnly ? inspectionSnapshotText(lastSnapshot) : JSON.stringify(lastSnapshot)),
            maxSteps: MAX_STEPS,
            timings: { snapshots: [], model: [], tools: [] },
            signal: controller.signal,
            excludeTools: config.readOnly
              ? [
                  "type",
                  "keys",
                  "fillForm",
                  "fillFormVision",
                  "dragAndDrop",
                  "clickAndHold",
                  "act",
                  "search",
                ]
              : ["search"],
            toolTimeout: 120000,
            callbacks: {
              prepareStep: async () => {
                await waitForDecision();
                if (gate.denied)
                  throw Error(
                    "The user declined transmission. Do not try another route."
                  );
                if (state.report) controller.abort();
                // Approval needs current values, not repeated body text/options.
                await snapshot({ detailed: false });
                if (!config.readOnly) dataEntered = true;
                return {};
              },
              onStepFinish: async (step) => {
                state.steps++;
                for (const call of step.toolCalls || []) trace("tool_call", call.toolName, { step: state.steps, toolCallId: call.toolCallId, input: call.input ?? call.args });
                for (const result of step.toolResults || []) trace("tool_result", result.toolName, { step: state.steps, toolCallId: result.toolCallId, output: result.output ?? result.result });
                if (step.text?.trim()) trace("progress", step.text, { step: state.steps });
                state.timings.tools.push({
                  step: state.steps,
                  names: (step.toolCalls || []).map((c) => c.toolName),
                });
                if (step.text?.trim())
                  state.progress = [
                    ...state.progress,
                    {
                      id: `stagehand:${state.steps}`,
                      text: step.text.trim().slice(0, 800),
                      at: new Date().toISOString(),
                    },
                  ].slice(-40);
                changed();
              },
            },
          });
        if (!state.report && !state.required_actions.length) {
          state.status = "completed";
          state.error =
            result.message || "The agent ended without a verified outcome";
          await snapshot();
        }
      } catch (e) {
        if (!closed && !state.report) {
          state.status = "error";
          state.error = String(e.message || e);
          trace("error", state.error);
        }
      } finally {
        changed();
      }
    };
    const command = async (input) => {
      if (input.operation === "status") return testSafety ? testSafety.pack(state) : {
        ...state,
        ...(config.diagnostics && config.readOnly ? { events: events.filter(event => event.sequence > (input.afterEvent ?? 0)) } : {}),
      };
      if (input.operation === "test-evidence" && testSafety)
        return testSafety.pack(await testSafety.capture());
      if (input.operation === "start") {
        if (!started) {
          started = true;
          void execute(input.instruction);
        }
        return { started: true };
      }
      if (input.operation === "resolve")
        return gate.resolve(input.request, input.approved === true);
      if (input.operation === "answer") {
        const resolve = answers.get(input.callId);
        if (resolve) {
          const outcome = state.required_actions.some(
            (a) =>
              a.call_id === input.callId &&
              a.name === "report_application_outcome"
          );
          if (outcome) controller.abort();
          answers.delete(input.callId);
          state.required_actions = [];
          state.status = "running";
          resolve(input.output);
          changed();
        }
        return { delivered: true };
      }
      if (input.operation === "upload") {
        addFiles(input.files);
        return { uploaded: true };
      }
      if (input.operation === "stop") {
        setTimeout(() => void close(), 50);
        return { stopped: true };
      }
      throw Error("Unsupported worker command");
    };
    const token = randomUUID() + randomUUID();
    await fs.writeFile(path.join(directory, "token"), token, { mode: 0o600 });
    server = http.createServer((req, res) => {
      const actual = Buffer.from(req.headers.authorization || ""),
        expected = Buffer.from("Bearer " + token);
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      let raw = "";
      req.on("data", (c) => {
        raw += c;
        if (raw.length > 16 * 1024 * 1024) req.destroy();
      });
      req.on("end", async () => {
        try {
          const input = JSON.parse(raw);
          if (typeof input.commandId !== "string")
            throw Error("Command identifier required");
          let value;
          if (input.operation === "status") value = await command(input);
          else {
            if (!commands.has(input.commandId))
              commands.set(input.commandId, command(input));
            value = await commands.get(input.commandId);
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(value));
        } catch (e) {
          res.writeHead(409);
          res.end(JSON.stringify({ error: String(e.message || e) }));
        }
      });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    await fs.writeFile(
      path.join(directory, "port"),
      String(server.address().port),
      { mode: 0o600 }
    );
    state.startup = {
      browserMs: Date.now() - workerStarted,
      installMs: Number(
        await fs
          .readFile(path.join(directory, "install-ms"), "utf8")
          .catch(() => "0")
      ),
    };
    state.status = "ready";
    return { state, command, close };
  } catch (e) {
    await close();
    throw e;
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname)
) {
  const directory = path.dirname(process.argv[1]);
  const config = JSON.parse(
    await fs.readFile(path.join(directory, "config.json"), "utf8")
  );
  await fs.unlink(path.join(directory, "config.json"));
  await startWorker(config, directory).catch(async (e) => {
    await fs.writeFile(
      path.join(directory, "startup-error"),
      String(e.message || e),
      { mode: 0o600 }
    );
    process.exitCode = 1;
  });
}
