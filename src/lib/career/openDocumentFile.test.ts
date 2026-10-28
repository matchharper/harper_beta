import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";

test("each click resolves a fresh URL; failures close the tab and blocked popups use the current tab", async (t) => {
  let requestCount = 0;
  let failed = false;
  let popupBlocked = false;
  let closed = false;
  let navigated = "";
  const tab = { opener: {}, closed: false, close: () => { closed = true; }, location: { replace: (url: string) => { navigated = url; } } };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    open: () => popupBlocked ? null : tab,
    location: { assign: (url: string) => { navigated = url; } },
  } });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const nodeModule = Module as any;
  const originalLoad = nodeModule._load;
  t.mock.method(nodeModule, "_load", function (this: unknown, name: string, ...args: unknown[]) {
    if (name === "@/lib/internalApiClient") return {
      fetchWithInternalAuth: async (url: string, init: RequestInit) => {
        assert.equal(url, "/api/talent/documents?documentId=resume-1");
        assert.equal(init.cache, "no-store");
        assert.equal(tab.opener, null);
        requestCount++;
        if (failed) throw new Error("Unauthorized");
        return { documents: [{ id: "resume-1", downloadUrl: `https://files.invalid/fresh-${requestCount}` }] };
      },
    };
    return originalLoad.call(this, name, ...args);
  });
  const { openDocumentFile } = await import("./openDocumentFile");
  await openDocumentFile("resume-1");
  assert.equal(navigated, "https://files.invalid/fresh-1");
  await openDocumentFile("resume-1");
  assert.equal(navigated, "https://files.invalid/fresh-2");
  failed = true;
  await assert.rejects(openDocumentFile("resume-1"), /Unauthorized/);
  assert.equal(closed, true);
  assert.equal(navigated, "https://files.invalid/fresh-2");
  failed = false;
  popupBlocked = true;
  await openDocumentFile("resume-1");
  assert.equal(navigated, "https://files.invalid/fresh-4");
});
