import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { JSDOM } from "jsdom";

// Component interactions with synthetic settings; no API, OAuth, or mail.
test("connection choices, setup blockers, settings return, and interview submission", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  const keys = [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLButtonElement",
    "Element",
    "Node",
    "NodeFilter",
    "Event",
    "MutationObserver",
    "CustomEvent",
    "getComputedStyle",
    "FormData",
  ] as const;
  const saved = new Map(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  );
  for (const key of keys)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: (dom.window as any)[key],
    });
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  let ready = false,
    refreshes = 0;
  const refetch = async () => {
    refreshes++;
  };
  const query = () => ({ isPending: false, isError: false, refetch });
  const mod = Module as any,
    original = mod._load;
  const mocks: Record<string, unknown> = {
    "next/router": { useRouter: () => ({ push: () => {} }) },
    "@/hooks/org/useOrgWorkspace": {
      useOrgWorkspace: () => ({
        currentUser: { userId: "member" },
        workspace: {
          workspaceId: "workspace",
          companyName: "Synthetic Company",
        },
      }),
    },
    "@/i18n/org/OrgLocaleProvider": {
      useOrgLocale: () => ({
        locale: "en",
        c: (_ko: string, en: string) => en,
      }),
    },
    "@/hooks/org/useOrgGoogleCalendar": {
      useOrgGoogleCalendar: () => ({
        statusQuery: {
          ...query(),
          data: { status: ready ? "active" : "not_connected" },
        },
      }),
    },
    "@/hooks/org/useOrgMeetingAvailability": {
      useOrgMeetingAvailability: () => ({
        ...query(),
        data: {
          availability: ready
            ? {
                timezone: "Asia/Seoul",
                weeklyRules: { "1": [{ start: "09:00", end: "18:00" }] },
                dateOverrides: {},
              }
            : null,
        },
      }),
    },
    "@/i18n/org/meetingSummary": {
      formatOrgMeetingAvailabilitySummary: () => "Monday, 9 AM–6 PM",
    },
    "@/components/common/TalentCareerModal": {
      __esModule: true,
      default: ({ open, title, description, children, footer }: any) =>
        open ? (
          <section>
            <h1>{title}</h1>
            <p>{description}</p>
            {children}
            {footer}
          </section>
        ) : null,
    },
    "@/components/org/meetings/OrgInterviewAvailabilityDialog": {
      OrgInterviewAvailabilityDialog: ({ onRequestClose }: any) => (
        <button onClick={onRequestClose}>Close availability editor</button>
      ),
    },
  };
  mod._load = function (request: string, parent: unknown, isMain: boolean) {
    return request in mocks
      ? mocks[request]
      : original.call(this, request, parent, isMain);
  };
  let Component: typeof import("./OrgCandidateDecisionDialogs").AcceptIntroDialog;
  try {
    Component = (await import("./OrgCandidateDecisionDialogs"))
      .AcceptIntroDialog;
  } finally {
    mod._load = original;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const submissions: any[] = [];
  const render = () =>
    root.render(
      <Component
        candidateName="Synthetic Candidate"
        candidateEmail="candidate@example.invalid"
        defaultEmail="member@example.invalid"
        roleTitle="Engineer"
        open
        onClose={() => {}}
        onSubmit={async (value) => {
          submissions.push(value);
        }}
      />
    );
  const select = async (value: string) =>
    act(async () => {
      (
        document.querySelector(`input[value="${value}"]`) as HTMLInputElement
      ).click();
    });
  const button = (label: string) =>
    Array.from(document.querySelectorAll("button")).find(
      (item) => item.textContent === label
    )!;
  const submit = () =>
    document
      .querySelector("form")!
      .dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true })
      );
  try {
    await act(async () => {
      render();
    });
    assert.equal(
      (document.querySelector('input[value="intro_email"]') as HTMLInputElement)
        .checked,
      true
    );
    assert.equal(document.querySelector('input[value="direct_contact"]'), null);
    await select("interview");
    assert.match(document.body.textContent!, /Complete your interview setup/);
    assert.ok(button("Send intro & connect").disabled);
    assert.equal(
      document.querySelector('a[target="_blank"]')?.getAttribute("href"),
      "/org/settings?tab=calendar&orgId=workspace"
    );
    await act(async () => {
      button("Set availability").click();
    });
    assert.ok(button("Close availability editor"));
    await act(async () => {
      button("Close availability editor").click();
      ready = true;
      render();
    });
    assert.match(document.body.textContent!, /Ready to request an interview/);
    await act(async () => {
      window.dispatchEvent(new dom.window.Event("focus"));
    });
    assert.equal(refreshes, 2);
    const topic = document.querySelector(
      'input[maxlength="600"]'
    ) as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value"
      )!.set!.call(topic, "Discuss engineering experience");
      topic.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await select("intro_email");
    await select("interview");
    assert.equal(
      (document.querySelector('input[maxlength="600"]') as HTMLInputElement)
        .value,
      "Discuss engineering experience"
    );
    assert.equal(button("Send intro & connect").disabled, false);
    await act(async () => {
      submit();
    });
    assert.equal(submissions.length, 1);
    assert.equal(submissions[0].scheduleInterview, true);
    assert.deepEqual(submissions[0].introEmails, []);
    assert.equal(
      submissions[0].meetingPurpose,
      "Discuss engineering experience"
    );
  } finally {
    await act(async () => {
      root.unmount();
    });
    for (const key of keys) {
      const descriptor = saved.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
    dom.window.close();
  }
});
