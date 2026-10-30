import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createFixtures, previewDetail } from "@/app/dev/role-start/fixtures";
import { OrgCandidateReviewContent } from "./OrgCandidateReviewContent";
import type { OrgCandidateReviewHeaderProps } from "./OrgCandidateReviewHeader";

// Browser-only synthetic data; no workspace provider, requests or persistence.
test("review actions stay in the header and the standalone body needs only profile data", async () => {
  const require = createRequire(import.meta.url);
  const originalCssLoader = require.extensions[".css"];
  require.extensions[".css"] = (module) => {
    module.exports = {};
  };
  let OrgCandidateReviewHeader: (typeof import("./OrgCandidateReviewHeader"))["OrgCandidateReviewHeader"];
  try {
    ({ OrgCandidateReviewHeader } = await import("./OrgCandidateReviewHeader"));
  } finally {
    if (originalCssLoader) require.extensions[".css"] = originalCssLoader;
    else delete require.extensions[".css"];
  }
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const fixtures = createFixtures();
  const detail = previewDetail(fixtures, fixtures.items[1].talentId);
  const calls: string[] = [];
  const header: OrgCandidateReviewHeaderProps = {
    detail,
    navigation: null,
    onNavigate: () => {},
    roleMoveButton: null,
    onAccept: () => {
      calls.push("accept");
    },
    onReject: () => {
      calls.push("reject");
    },
    onPass: async () => {
      calls.push("pass");
    },
    onSave: async () => {
      calls.push("save");
    },
    saved: false,
    pending: false,
    canManage: true,
  };
  const press = (key: string, target: Element = dom.window.document.body) => {
    const event = new dom.window.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const buttons = () => [...dom.window.document.querySelectorAll("button")];
  try {
    await act(async () => {
      root.render(<OrgCandidateReviewHeader {...header} />);
    });
    await act(async () => {
      buttons()
        .find((button) => button.textContent === "Save")!
        .click();
      buttons()
        .find((button) => button.textContent === "Send Intro")!
        .click();
      press("s");
      press("r");
    });
    assert.deepEqual(calls, ["save", "accept", "save", "accept"]);

    await act(async () => {
      root.render(<OrgCandidateReviewHeader {...header} pending />);
    });
    await act(async () => {
      press("s");
      press("r");
    });
    assert.equal(calls.length, 4, "pending actions suppress shortcuts");
    assert.ok(buttons().every((button) => button.disabled));

    await act(async () => {
      root.render(<OrgCandidateReviewHeader {...header} canManage={false} />);
    });
    await act(async () => {
      press("s");
      press("r");
    });
    assert.equal(calls.length, 4, "read-only users cannot invoke decisions");
    assert.equal(buttons().length, 0);

    // No role, workspace, recommendation, action callbacks or notes provider.
    const {
      talent,
      profile,
      profileMarkdown,
      companyPresentation,
      criteriaEvaluations,
    } = detail;
    await act(async () => {
      root.render(
        <OrgCandidateReviewContent
          detail={{
            talent,
            profile,
            profileMarkdown,
            companyPresentation,
            criteriaEvaluations,
            resume: { hasStorageFile: true, fileName: "resume.pdf", links: [] },
          }}
          onResumeClick={(kind) => {
            calls.push(kind);
          }}
        />
      );
    });
    assert.ok(
      dom.window.document.body.textContent?.includes(detail.talent.name!)
    );
    assert.ok(
      dom.window.document.body.textContent?.includes(
        detail.profile.experiences[0].companyName!
      )
    );
    assert.equal(
      dom.window.document.querySelector("textarea"),
      null,
      "notes are opt-in"
    );
    assert.equal(
      dom.window.document.querySelector("[aria-keyshortcuts]"),
      null
    );
    await act(async () => {
      assert.equal(press("s"), false, "unmounted header releases shortcuts");
      assert.equal(press("r"), false);
      buttons()
        .find((button) => button.textContent === "이력서")!
        .click();
    });
    assert.deepEqual(calls, ["save", "accept", "save", "accept", "storage"]);
  } finally {
    await act(async () => {
      root.unmount();
    });
    Object.assign(globalThis, {
      window: originalWindow,
      document: originalDocument,
      IS_REACT_ACT_ENVIRONMENT: false,
    });
    dom.window.close();
  }
});
