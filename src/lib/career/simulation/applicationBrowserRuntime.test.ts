import test from "node:test";
import assert from "node:assert/strict";
import { Sandbox } from "@vercel/sandbox";
import { applicationBrowserRuntime as runtime } from "./applicationBrowserRuntime";
import { applicationBrowserTools } from "./applicationBrowserServer";

test("browser provisioning is owned by the executor and the planner has no code or approval tool", async (t) => {
  let configuration: Record<string, unknown> | undefined;
  const commands: Record<string, unknown>[] = [],
    files: { path: string; content: unknown }[] = [];
  let stopped = 0;
  const sandbox = {
    name: "fixture",
    expiresAt: new Date(Date.now() + 60000),
    status: "running",
    writeFiles: async (inputs: typeof files) => {
      files.push(...inputs);
    },
    runCommand: async (input: Record<string, unknown>) => {
      commands.push(input);
      return { exitCode: 0 };
    },
    readFileToBuffer: async () => Buffer.from("1234"),
    stop: async () => {
      stopped++;
    },
  };
  t.mock.method(Sandbox, "create", async (options: Record<string, unknown>) => {
    configuration = options;
    return sandbox;
  });
  await runtime.create(
    [
      {
        path: "/vercel/sandbox/attachments/resume.txt",
        data: Buffer.from("synthetic resume").toString("base64"),
      },
    ],
    "https://example.org/job"
  );
  assert.equal(configuration!.persistent, false);
  assert.equal(configuration!.timeout, 1800000);
  assert.ok(
    !("env" in configuration!),
    "provider credentials are not passed to the browser"
  );
  assert.ok(
    !("ports" in configuration!),
    "the command endpoint is not exposed"
  );
  assert.ok(
    files.some(
      (file) =>
        file.path.endsWith("initial-url") &&
        file.content === "https://example.org/job"
    )
  );
  assert.deepEqual(
    applicationBrowserTools
      .filter((tool) => "name" in tool)
      .map((tool) => tool.name),
    [
      "perform_application_browser_action",
      "ask_application_input",
      "report_application_outcome",
    ]
  );
  assert.deepEqual(applicationBrowserTools[0], {
    type: "programmatic_tool_calling",
    enabled: false,
  });
  sandbox.runCommand = async () => ({ exitCode: 1 });
  await assert.rejects(
    runtime.create([], "https://example.org/job"),
    /setup failed/
  );
  assert.equal(stopped, 1, "a failed setup removes the new VM");
});

test("only verified attachments and fixed commands reach the VM; expired or lost browsers never restart", async (t) => {
  let gets = 0;
  const inputs: Record<string, unknown>[] = [];
  let status = "running";
  t.mock.method(Sandbox, "get", async (options: Record<string, unknown>) => {
    gets++;
    assert.equal(options.resume, false);
    return {
      status,
      writeFiles: async (files: { content: unknown }[]) =>
        inputs.push(JSON.parse(String(files[0].content))),
      runCommand: async (command: string, args: string[]) => {
        assert.equal(command, "node");
        assert.equal(args[0], "/vercel/sandbox/harper-browser/client.cjs");
        return {
          exitCode: 0,
          stdout: async () => JSON.stringify({ executed: true }),
        };
      },
    };
  });
  const ref = {
    name: "fixture",
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  await assert.rejects(
    runtime.execute(
      ref,
      { action: "navigate", url: "http://example.org" },
      [],
      "1"
    ),
    /public HTTPS/
  );
  await assert.rejects(
    runtime.execute(
      ref,
      { action: "attach", ref: "1", documentId: "someone-else" },
      [],
      "2"
    ),
    /verified/
  );
  assert.equal(gets, 0);
  await runtime.execute(
    ref,
    { action: "attach", ref: "1", documentId: "owned" },
    [{ documentId: "owned", path: "/vercel/sandbox/attachments/owned.pdf" }],
    "3"
  );
  assert.equal(inputs[0].path, "/vercel/sandbox/attachments/owned.pdf");
  const request = {
    id: "held",
    url: "https://example.org/submit",
    method: "POST",
    bodyHash: "hash",
    formHash: "scope",
    pageUrl: "https://example.org/job",
    fields: [],
  };
  await runtime.resolve(ref, request, true);
  assert.deepEqual(inputs[1], {
    operation: "resolve",
    commandId: "approval:held:true",
    id: "held",
    bodyHash: "hash",
    formHash: "scope",
    approved: true,
  });
  const count = gets;
  await assert.rejects(
    runtime.execute(
      { ...ref, expiresAt: new Date(0).toISOString() },
      { action: "inspect" },
      [],
      "4"
    ),
    /expired/
  );
  assert.equal(gets, count);
  status = "stopped";
  await assert.rejects(
    runtime.execute(ref, { action: "inspect" }, [], "5"),
    /lost/
  );
  assert.equal(inputs.length, 2, "no command is issued after browser loss");
});
