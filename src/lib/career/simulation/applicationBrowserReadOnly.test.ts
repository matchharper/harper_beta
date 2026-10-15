import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { controlledBrowserDriver } from "./applicationBrowserDriver";

test(
  "real read-only browser preserves native metadata and refuses editing, approval and submission",
  {
    skip: process.env.APPLICATION_BROWSER_TEST !== "1",
    timeout: 60000,
  },
  async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "harper-browser-read-only-")
    );
    let writes = 0;
    const server = createServer((req, res) => {
      if (req.method !== "GET") {
        writes++;
        res.end("unexpected write");
        return;
      }
      res.setHeader("Content-Type", "text/html");
      if (req.url === "/broken") {
        res.end('<body><p>Unavailable frame</p><script>Object.defineProperty(document.body,"innerText",{get(){throw new Error("Fixture frame read failure")}})</script>');
        return;
      }
      if (req.url === "/never-ready") {
        res.write('<html><head>'); // Deliberately no body, EOF or DOMContentLoaded.
        return;
      }
      if (req.url === "/embed") {
        res.end(
          '<p>Frame instructions: write in English.</p><label>Work sample<input type="file" accept=".pdf,.docx" aria-required="false"></label>'
        );
        return;
      }
      if (req.url === "/next") {
        res.end("<p>Next public page</p>");
        return;
      }
      res.end(
        `<form action="/mutate" method="post"><label>Motivation<textarea name="motivation" required maxlength="500" aria-describedby="hint"></textarea></label><p id="hint">Write in English.</p><label>Consent<input type="checkbox"></label><label>Choice<select><option value="a">A</option></select></label><div><div>Unbound source question</div><div><textarea name="opaque-machine-name"></textarea></div></div><label id="custom-label">Accessible choice</label><input role="combobox" aria-labelledby="custom-label"><input aria-hidden="true" aria-label="Hidden mirror"><section><p>Choose sources</p><ul><li><label>Source A<input type="checkbox" name="sources"></label></li><li><label>Source B<input type="checkbox" name="sources"></label></li></ul></section><button>Submit</button></form><iframe src="/never-ready" name="auxiliary"></iframe><iframe src="/embed" name="application"></iframe><iframe src="/broken" name="broken"></iframe><span style="cursor:pointer" id="custom-open">Custom navigation</span><script>document.getElementById("custom-open").addEventListener("click",()=>location.href="/next")</script><div role="button" tabindex="0">Accessible action</div><a href="/next" target="_blank">Open application</a><button onclick="document.querySelector('form').requestSubmit();fetch('/mutate',{method:'POST'})">Outside button</button>`
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    await writeFile(join(directory, "server.cjs"), controlledBrowserDriver);
    const requireModule = createRequire(join(process.cwd(), "package.json"));
    const child = spawn(process.execPath, [join(directory, "server.cjs")], {
      env: {
        ...process.env,
        HARPER_BROWSER_DIRECTORY: directory,
        HARPER_BROWSER_READ_ONLY: "1",
        HARPER_BROWSER_PUBLIC_NETWORK: "0",
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
        if (child.exitCode !== null || child.signalCode !== null) break;
        try {
          port = await readFile(join(directory, "port"), "utf8");
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      assert.ok(port, "Read-only driver must start");
      const token = await readFile(join(directory, "token"), "utf8");
      let id = 0;
      const send = async (input: Record<string, unknown>) => {
        const response = await fetch(`http://127.0.0.1:${port}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ commandId: `read-${++id}`, ...input }),
          signal: AbortSignal.timeout(15000),
        });
        return {
          status: response.status,
          data: (await response.json()) as any,
        };
      };
      const started = Date.now();
      let initial = await send({ action: "navigate", url: origin });
      assert.ok(Date.now() - started < 5000, "An unfinished auxiliary frame cannot block the main document");
      assert.equal(initial.status, 200);
      const element = (label: string) => {
        const found = initial.data.snapshot.elements.find(
          (e: any) => e.label === label
        );
        assert.ok(found, `Observed ${label}`);
        return found;
      };
      assert.ok(!initial.data.snapshot.elements.some((e: any) => e.label === "Work sample"));
      assert.doesNotMatch(initial.data.snapshot.text, /Frame instructions/);
      const frame = initial.data.snapshot.frames.find((f: any) => f.name === "application");
      assert.ok(frame && !frame.inspected);
      const invalidFrame = await send({ action: "inspect", frameRef: "999999" });
      assert.equal(invalidFrame.status, 409);
      initial = await send({ action: "inspect", frameRef: frame.ref });
      assert.equal(initial.status, 200);
      assert.equal(initial.data.snapshot.frames.find((f: any) => f.ref === frame.ref).inspected, true);
      assert.equal(initial.data.snapshot.frames.find((f: any) => f.name === "auxiliary").inspected, false);
      assert.equal(element("Custom navigation").tag, "span");
      assert.equal(element("Accessible action").tag, "div");
      const motivation = element("Motivation");
      assert.equal(motivation.requiredState, true);
      assert.equal(motivation.maxLength, 500);
      assert.match(motivation.instructions, /Write in English/);
      const sample = element("Work sample");
      assert.deepEqual(sample.fileTypes, [".pdf", ".docx"]);
      assert.equal(sample.requiredState, false);
      assert.match(initial.data.snapshot.text, /Frame instructions/);
      assert.equal(element("Unbound source question").type, "textarea");
      assert.equal(element("Accessible choice").type, "combobox");
      assert.ok(
        !initial.data.snapshot.elements.some(
          (e: any) => e.label === "Hidden mirror"
        )
      );
      assert.match(element("Source A").instructions, /Choose sources/);
      assert.match(element("Source B").instructions, /Choose sources/);
      for (const input of [
        { action: "fill", ref: motivation.ref, value: "Synthetic text" },
        { action: "check", ref: element("Consent").ref, checked: true },
        {
          action: "select",
          ref: initial.data.snapshot.elements.find(
            (e: any) => e.tag === "select"
          ).ref,
          value: "a",
        },
        { action: "attach", ref: sample.ref, path: "/tmp/no-file" },
        { operation: "resolve", requestId: "fake", approved: true },
        { action: "click", ref: motivation.ref },
        { action: "click", ref: element("Submit").ref },
      ]) {
        const result = await send(input);
        assert.equal(result.status, 409);
        assert.match(result.data.error, /Read-only browser/);
      }
      const click = await send({
        action: "click",
        ref: element("Outside button").ref,
      });
      assert.equal(click.status, 200);
      assert.equal(click.data.pendingRequest, undefined);
      assert.equal(
        writes,
        0,
        "Outside-button mutation and form submission stay blocked"
      );
      assert.equal(
        click.data.snapshot.elements.find((e: any) => e.label === "Motivation")
          .value,
        ""
      );
      const broken = click.data.snapshot.frames.find((f: any) => f.name === "broken");
      const partial = await send({ action: "inspect", frameRef: broken.ref });
      assert.equal(partial.status, 200);
      assert.ok(partial.data.snapshot.elements.some((e: any) => e.label === "Motivation"));
      assert.ok(partial.data.snapshot.elements.some((e: any) => e.label === "Work sample"));
      assert.equal(partial.data.snapshot.readErrors.length, 1);
      assert.equal(partial.data.snapshot.readErrors[0].frameRef, broken.ref);
      assert.match(partial.data.snapshot.readErrors[0].error, /Fixture frame read failure/);
      const link = partial.data.snapshot.elements.find(
        (e: any) => e.label === "Open application"
      );
      const next = await send({ action: "click", ref: link.ref });
      assert.match(next.data.snapshot.text, /Next public page/);
      const staleFrame = await send({ action: "inspect", frameRef: frame.ref });
      assert.equal(staleFrame.status, 409);
      assert.match(staleFrame.data.error, /no longer current/);
      const reopened = await send({ action: "navigate", url: origin });
      const custom = reopened.data.snapshot.elements.find(
        (e: any) => e.label === "Custom navigation"
      );
      const customNext = await send({ action: "click", ref: custom.ref });
      assert.match(customNext.data.snapshot.text, /Next public page/);
      assert.equal(writes, 0);
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
