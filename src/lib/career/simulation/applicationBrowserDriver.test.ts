import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { controlledBrowserDriver } from "./applicationBrowserDriver";
import {
  applicationBrowserActionSchema,
  type BrowserPendingRequest,
} from "./applicationBrowserActions";

const requireModule = createRequire(join(process.cwd(), "package.json"));
test(
  "hosted browser denies HTTP and private HTTPS destinations",
  { skip: process.env.APPLICATION_BROWSER_TEST !== "1", timeout: 45000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "harper-browser-network-"));
    let requests = 0;
    const server = createServer((_req, res) => {
      requests++;
      res.end("<p>Synthetic private service</p>");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    await writeFile(join(directory, "server.cjs"), controlledBrowserDriver);
    const child = spawn(process.execPath, [join(directory, "server.cjs")], {
      env: {
        ...process.env,
        HARPER_BROWSER_DIRECTORY: directory,
        HARPER_BROWSER_PUBLIC_NETWORK: "1",
        HARPER_BROWSER_PLAYWRIGHT_MODULE:
          requireModule.resolve("playwright-core"),
        HARPER_BROWSER_CHROMIUM_EXECUTABLE:
          process.env.RESUME_CHROMIUM_EXECUTABLE_PATH ||
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      },
      stdio: ["ignore", "ignore", "ignore"],
    });
    try {
      let port = "";
      for (let i = 0; i < 600; i++) {
        try {
          port = await readFile(join(directory, "port"), "utf8");
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      assert.ok(port, "Controlled browser must start");
      const token = await readFile(join(directory, "token"), "utf8");
      const urls = [
        `http://127.0.0.1:${(server.address() as { port: number }).port}`,
        "https://127.0.0.1/",
        "https://[::ffff:127.0.0.1]/",
      ];
      for (const [i, url] of urls.entries()) {
        const response = await fetch(`http://127.0.0.1:${port}`, {
          method: "POST",
          headers: { Authorization: "Bearer " + token },
          body: JSON.stringify({
            action: "navigate",
            url,
            commandId: String(i),
          }),
          signal: AbortSignal.timeout(10000),
        });
        const result = (await response.json()) as { error: string };
        assert.equal(response.status, 409);
        assert.match(result.error, /ERR_BLOCKED_BY_CLIENT/);
      }
      assert.equal(requests, 0, "Private service never receives a request");
    } finally {
      child.kill("SIGKILL");
      if (child.exitCode === null && child.signalCode === null)
        await new Promise<void>((resolve) =>
          child.once("exit", () => resolve())
        );
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  }
);
test("planning commands cannot contain code, approval grants, or unapproved attachment paths", () => {
  for (const input of [
    { action: "eval", code: "submit()" },
    { action: "inspect", code: "submit()" },
    { operation: "resolve", approved: true },
    { action: "attach", ref: "1", path: "/etc/passwd" },
    { action: "fill_fields", fields: [{ action: "click", ref: "1" }] },
    { action: "fill_fields", fields: [{ action: "attach", ref: "1", path: "/etc/passwd" }] },
    { action: "fill_fields", fields: [{ action: "fill", ref: "1", value: "x" }, { action: "fill", ref: "1", value: "y" }] },
  ])
    assert.equal(
      applicationBrowserActionSchema.safeParse(input).success,
      false
    );
});

test(
  "real controlled browser holds POST and GET submissions and releases only the immutable approved request once",
  { skip: process.env.APPLICATION_BROWSER_TEST !== "1", timeout: 60000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "harper-browser-approval-"));
    const received: { url: string; method: string; body: string }[] = [];
    let bootstraps = 0;
    const server = createServer(async (req, res) => {
      if (req.url === "/embedded") {
        res.setHeader("Content-Type", "text/html");
        res.end('<p>Application below</p><iframe name="application" src="/embedded-form"></iframe>');
        return;
      }
      if (req.url === "/bootstrap") {
        bootstraps++;
        res.end("Anonymous form schema");
        return;
      }
      if (req.url?.startsWith("/received")) {
        const chunks: Buffer[] = [];
        for await (const part of req) chunks.push(Buffer.from(part));
        const body = Buffer.concat(chunks).toString("utf8");
        received.push({ url: req.url, method: req.method!, body });
        if (req.url.includes("redirect")) {
          res.writeHead(303, { Location: "/receipt" });
          res.end();
          return;
        }
        res.end("Application received. Fixture receipt TEST-1.");
        return;
      }
      if (req.url === "/receipt") {
        res.end("Application received. Fixture receipt TEST-REDIRECT.");
        return;
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<form method="${req.url?.includes("get") ? "get" : "post"}" enctype="${req.url?.includes("multipart") || req.url?.includes("batch") ? "multipart/form-data" : "application/x-www-form-urlencoded"}" action="/received${req.url?.includes("redirect") ? "?redirect=1" : ""}"><label>Name<input name="name" required></label><label>File<input name="resume" type="file"></label>
      ${req.url?.includes("batch") ? '<label>Email<input name="email" type="email"></label><label>Answer<textarea name="answer"></textarea></label><label>Country<select name="country"><option value="KR">South Korea</option><option value="US">United States</option></select></label><label>Test consent<input name="consent" type="checkbox"></label>' : ''}
      <button>Submit</button></form><script>
      fetch('/bootstrap',{method:'POST',body:'anonymous-form-bootstrap'});
      ${req.url === "/embedded-form" ? "document.querySelector('input[name=name]').addEventListener('input',()=>top.history.replaceState({},'', '#editing'));" : ""}
      ${req.url?.includes("batch-autosave") ? "document.querySelector('input[name=name]').addEventListener('input',()=>fetch('/received-autosave',{method:'POST',body:document.querySelector('input[name=name]').value}));" : ""}
      ${req.url?.includes("change") ? "document.querySelector('form').addEventListener('submit',()=>setTimeout(()=>document.querySelector('input[name=name]').value='Changed while waiting',80));" : ""}
      ${req.url?.includes("background") ? "let timer;document.querySelector('input[name=name]').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{fetch('/received-background?value='+encodeURIComponent(document.querySelector('input[name=name]').value));fetch('/received-background',{method:'POST',body:'background'});new WebSocket(location.origin.replace(/^http/,'ws')+'/received-background');},350);});" : ""}
      </script>`);
    });
    server.on("upgrade", (request, socket) => {
      received.push({ url: request.url ?? "", method: "WS", body: "" });
      socket.destroy();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    await writeFile(
      join(directory, "resume.txt"),
      "SYNTHETIC RESUME BYTES 155"
    );
    await writeFile(join(directory, "server.cjs"), controlledBrowserDriver);
    await writeFile(join(directory, "initial-url"), `${origin}/embedded`);
    const child = spawn(process.execPath, [join(directory, "server.cjs")], {
      env: {
        ...process.env,
        HARPER_BROWSER_DIRECTORY: directory,
        HARPER_BROWSER_PLAYWRIGHT_MODULE:
          requireModule.resolve("playwright-core"),
        HARPER_BROWSER_CHROMIUM_EXECUTABLE:
          process.env.RESUME_CHROMIUM_EXECUTABLE_PATH ||
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let diagnostics = "";
    child.stderr.on("data", (part) => (diagnostics += part));
    let port = "";
    try {
      // Match the executor's 30-second startup allowance, including when PDF
      // tests start another Chromium concurrently.
      for (let i = 0; i < 600; i++) {
        if (child.exitCode !== null || child.signalCode !== null) break;
        try {
          port = await readFile(join(directory, "port"), "utf8");
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      assert.ok(port, diagnostics);
      const token = await readFile(join(directory, "token"), "utf8");
      let id = 0;
      const send = async (input: Record<string, unknown>) => {
        t.diagnostic(String(input.action ?? input.operation));
        const response = await fetch(`http://127.0.0.1:${port}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ commandId: `fixture-${++id}`, ...input }),
          signal: AbortSignal.timeout(15000),
        });
        return {
          status: response.status,
          data: (await response.json()) as {
            snapshot?: {
              text?: string;
              frames?: { ref: string; name: string }[];
              elements: { ref: string; tag: string; label: string; value?: string }[];
            };
            pendingRequest?: BrowserPendingRequest;
            executed?: boolean;
            error?: string;
            completedFields?: number;
          },
        };
      };
      for (const variant of [
        "embedded",
        "post",
        "get",
        "multipart",
        "redirect",
        "background",
        "deny",
        "change",
        "batch",
        "batch-autosave",
        "batch-invalid",
      ]) {
        const before = received.length;
        let reply = await send({
          action: "navigate",
          url: `${origin}/${variant}`,
        });
        assert.equal(reply.status, 200);
        if (reply.data.pendingRequest) {
          const held = reply.data.pendingRequest;
          reply = await send({
            operation: "resolve",
            id: held.id,
            bodyHash: held.bodyHash,
            formHash: held.formHash,
            approved: true,
          });
        }
        if (variant === "embedded") {
          assert.equal(reply.data.snapshot!.elements.length, 0);
          const frame = reply.data.snapshot!.frames!.find(f => f.name === "application")!;
          reply = await send({ action: "inspect", frameRef: frame.ref });
          assert.equal(reply.status, 200);
        }
        const name = reply.data.snapshot!.elements.find(
          (e) => e.label === "Name"
        )!.ref;
        if (variant.startsWith("batch")) {
          const ref = (label: string) => reply.data.snapshot!.elements.find(e => e.label === label)!.ref;
          const fields = variant === "batch" ? [
            { action: "fill", ref: name, value: "Fixture Person" },
            { action: "fill", ref: ref("Email"), value: "fixture@example.com" },
            { action: "fill", ref: ref("Answer"), value: "승인된 한국어 답변" },
            { action: "select", ref: ref("Country"), value: "US" },
            { action: "check", ref: ref("Test consent"), checked: true },
            { action: "attach", ref: ref("File"), path: join(directory, "resume.txt") },
          ] : [
            { action: "fill", ref: variant === "batch-invalid" ? ref("Email") : name, value: variant === "batch-invalid" ? "invalid" : "Fixture Person" },
            { action: "fill", ref: ref("Answer"), value: "Must not be entered" },
          ];
          reply = await send({ action: "fill_fields", fields });
          assert.equal(reply.status, 200);
          assert.equal(received.length, before, "batch input never sends an unapproved request");
          if (variant === "batch-autosave") {
            const held = reply.data.pendingRequest!;
            assert.ok(held, "input-triggered transmission pauses the batch");
            reply = await send({ operation: "resolve", id: held.id, bodyHash: held.bodyHash, formHash: held.formHash, approved: false });
          }
          if (variant !== "batch") {
            if (variant === "batch-invalid") assert.match(reply.data.error ?? "", /validation/);
            assert.equal(reply.data.snapshot!.elements.find(e => e.label === "Answer")!.value, "", "a held request or validation failure prevents all remaining fields");
            assert.equal(received.length, before);
            continue;
          }
          assert.equal(reply.data.completedFields, 6);
          assert.equal(reply.data.snapshot!.elements.find(e => e.label === "Answer")!.value, "승인된 한국어 답변");
        } else {
        reply = await send({
          action: "fill",
          ref: name,
          value: "Fixture Person",
        });
        assert.equal(reply.status, 200, JSON.stringify(reply.data));
        if (variant === "background") {
          await new Promise((resolve) => setTimeout(resolve, 500));
          assert.equal(
            received.length,
            before,
            "background GET, POST and WebSocket traffic cannot carry entered data"
          );
        }
        if (variant === "multipart") {
          const upload = reply.data.snapshot!.elements.find(
            (e) => e.label === "File"
          )!.ref;
          reply = await send({
            action: "attach",
            ref: upload,
            path: join(directory, "resume.txt"),
          });
          assert.equal(reply.status, 200);
        }
        }
        const button = reply.data.snapshot!.elements.find(
          (e) => e.tag === "button"
        )!.ref;
        reply = await send({ action: "click", ref: button });
        const pending = reply.data.pendingRequest!;
        assert.ok(pending, JSON.stringify(reply.data));
        const replacement = await send({
          action: "fill",
          ref: "0",
          value: "Unapproved replacement",
        });
        assert.equal(
          replacement.data.pendingRequest?.id,
          pending.id,
          "no model operation can replace the held form before approval"
        );
        assert.ok(pending.fields.some((f) => f.value === "Fixture Person"));
        assert.equal(
          received.length,
          before,
          "no request reaches the site before approval"
        );
        const forged = await send({
          operation: "resolve",
          id: pending.id,
          bodyHash: "forged",
          formHash: pending.formHash,
          approved: true,
        });
        assert.equal(forged.status, 409);
        assert.equal(received.length, before);
        if (variant === "change")
          await new Promise((resolve) => setTimeout(resolve, 120));
        const approval = {
          operation: "resolve",
          id: pending.id,
          bodyHash: pending.bodyHash,
          formHash: pending.formHash,
          approved: variant !== "deny",
        };
        const resolved = await send(approval);
        if (variant === "deny") {
          assert.equal(resolved.status, 200);
          assert.equal(resolved.data.executed, false);
          assert.equal(received.length, before);
        } else {
          assert.equal(resolved.status, 200);
          assert.equal(resolved.data.executed, true);
          assert.equal(received.length, before + 1);
          if (variant === "redirect")
            assert.match(resolved.data.snapshot?.text ?? "", /TEST-REDIRECT/);
          await send(approval);
          assert.equal(
            received.length,
            before + 1,
            "approval retries cannot send twice"
          );
          const wrongReceipt = await send({
            ...approval,
            formHash: "a different review",
          });
          assert.equal(wrongReceipt.status, 409);
          assert.equal(received.length, before + 1);
          assert.ok(
            (received.at(-1)!.body + received.at(-1)!.url).includes("Fixture")
          );
          if (variant === "multipart" || variant === "batch") {
            assert.ok(
              received.at(-1)!.body.includes("SYNTHETIC RESUME BYTES 155")
            );
            assert.ok(received.at(-1)!.body.includes('filename="resume.txt"'));
            if (variant === "batch") {
              assert.ok(received.at(-1)!.body.includes("승인된 한국어 답변"));
              assert.ok(received.at(-1)!.body.includes("fixture@example.com"));
            }
          }
          assert.ok(
            !received.at(-1)!.body.includes("Changed while waiting"),
            "page changes cannot alter an already serialized approved request"
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const unsupported = await send({
        action: "eval",
        code: "process.exit()",
      });
      assert.equal(unsupported.status, 409);
      assert.equal(
        bootstraps,
        1,
        "Only the initial anonymous page may bootstrap; later loads cannot resend supplied data"
      );
    } finally {
      if (diagnostics) t.diagnostic(diagnostics);
      child.kill("SIGKILL");
      if (child.exitCode === null && child.signalCode === null)
        await new Promise<void>((resolve) =>
          child.once("exit", () => resolve())
        );
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  }
);
