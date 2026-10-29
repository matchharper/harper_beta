import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { mock } from "node:test";
import React, { act, useState } from "react";
import { JSDOM } from "jsdom";
import type { CareerSidebarContextValue } from "../CareerSidebarContext";
import type { CareerTalentProfile } from "../types";

const fixture: CareerTalentProfile = {
  talentUser: null,
  talentExperiences: [
    {
      id: 1,
      talent_id: "fixture",
      role: "Older role",
      description: "Earlier work",
      employment_type: "Full-time",
      start_date: "2020-03-01",
      end_date: "2022-06-30",
      months: 27,
      company_id: "company",
      company_link: "https://example.com/company",
      company_name: "Fixture company",
      company_location: "Seoul",
      company_logo: null,
      memo: "Keep this memo",
    },
    {
      id: 2,
      talent_id: "fixture",
      role: "Current role",
      description: "Current work",
      employment_type: null,
      start_date: "2023-01",
      end_date: null,
      months: 45,
      company_id: null,
      company_link: null,
      company_name: "Another company",
      company_location: null,
      company_logo: null,
      memo: null,
    },
  ],
  talentEducations: [
    {
      id: 3,
      talent_id: "fixture",
      school: "Fixture school",
      degree: "BS",
      field: "Computing",
      start_date: "2016",
      end_date: "2020",
      description: "Studies",
      url: "https://example.com/school",
      memo: "School memo",
    },
  ],
  talentExtras: [
    {
      title: "Fixture award",
      date: "2024",
      description: "Award details",
      memo: "Award memo",
    },
  ],
};

test("timeline editing prefills each kind, updates the original row, preserves metadata and supports retry/cancel/add", async () => {
  const dom = new JSDOM("<div id='root'></div>", {
    url: "http://localhost",
    pretendToBeVisual: true,
  });
  const names = [
    "window",
    "document",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLTextAreaElement",
    "HTMLButtonElement",
    "Element",
    "Node",
    "NodeFilter",
    "MutationObserver",
    "Event",
    "CustomEvent",
    "navigator",
    "getComputedStyle",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const previous = names.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
  );
  for (const key of names)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value:
        key === "IS_REACT_ACT_ENVIRONMENT"
          ? true
          : key === "getComputedStyle"
            ? dom.window.getComputedStyle.bind(dom.window)
            : (dom.window as unknown as Record<string, unknown>)[key],
    });
  const require = createRequire(import.meta.url);
  const cssLoader = require.extensions[".css"];
  require.extensions[".css"] = (module) => {
    module.exports = {};
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "fixture";
  const network = mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected network request");
  });
  const { createRoot } = await import("react-dom/client");
  const { RouterContext } =
    await import("next/dist/shared/lib/router-context.shared-runtime");
  const { MessagesProvider } = await import("@/i18n/useMessage");
  const { CareerSidebarProvider } = await import("../CareerSidebarContext");
  const { default: CareerTalentProfilePanel } =
    await import("./CareerTalentProfilePanel");
  const { supabase } = await import("@/lib/supabase");
  const auth = mock.method(supabase.auth, "getSession", async () => ({
    data: { session: null },
    error: null,
  }));
  const saved: CareerTalentProfile[] = [];
  let rejectSave = false;
  const Harness = () => {
    const [profile, setProfile] = useState(fixture);
    const [error, setError] = useState("");
    const value: Partial<CareerSidebarContextValue> = {
      user: null,
      talentProfile: profile,
      savedProfileLinks: [],
      profileSavePending: false,
      profileSaveError: error,
      onSaveTalentProfile: async (args) => {
        const structuredProfile = args?.structuredProfile;
        assert.ok(structuredProfile);
        if (rejectSave) {
          setError("Fixture save failed");
          return false;
        }
        saved.push(structuredProfile);
        setProfile(structuredProfile);
        setError("");
        return true;
      },
    };
    return (
      <RouterContext.Provider
        value={
          {
            pathname: "/career/profile",
            asPath: "/career/profile",
            query: {},
          } as never
        }
      >
        <MessagesProvider locale="ko">
          <CareerSidebarProvider value={value as CareerSidebarContextValue}>
            <CareerTalentProfilePanel />
          </CareerSidebarProvider>
        </MessagesProvider>
      </RouterContext.Provider>
    );
  };
  const root = createRoot(dom.window.document.getElementById("root")!);
  const button = (label: string) => {
    const element = [
      ...dom.window.document.querySelectorAll<HTMLButtonElement>("button"),
    ].find(
      (item) =>
        item.getAttribute("aria-label") === label ||
        item.textContent?.trim() === label
    );
    assert.ok(element, `Missing button: ${label}`);
    return element;
  };
  const input = (label: string) => {
    const element = [...dom.window.document.querySelectorAll("label")]
      .find((item) => item.querySelector("span")?.textContent === label)
      ?.querySelector("input,textarea") as HTMLInputElement;
    assert.ok(element, `Missing field: ${label}`);
    return element;
  };
  const click = async (label: string) => {
    await act(async () => {
      button(label).click();
    });
  };
  const change = async (label: string, value: string) => {
    const element = input(label);
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value"
      )!.set!.call(element, value);
      element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  };
  try {
    await act(async () => {
      root.render(<Harness />);
    });
    await click("Older role 수정하기");
    assert.equal(input("직무").value, "Older role");
    assert.equal(input("시작일").value, "2020-03-01");
    assert.equal(input("종료일 또는 현재").value, "2022-06-30");
    await change("직무", "Updated role");
    rejectSave = true;
    await click("저장하기");
    assert.equal(saved.length, 0);
    assert.equal(input("직무").value, "Updated role");
    assert.ok(
      dom.window.document
        .querySelector('[role="alert"]')
        ?.textContent?.includes("Fixture save failed")
    );
    rejectSave = false;
    await click("저장하기");
    assert.equal(dom.window.document.querySelector('[role="dialog"]'), null);
    assert.deepEqual(saved[0].talentExperiences, [
      { ...fixture.talentExperiences[0], role: "Updated role" },
      fixture.talentExperiences[1],
    ]);
    await click("Fixture school 수정하기");
    assert.equal(input("시작일").value, "2016");
    await change("학교명", "Updated school");
    await click("저장하기");
    assert.deepEqual(saved[1].talentEducations, [
      { ...fixture.talentEducations[0], school: "Updated school" },
    ]);
    await click("Fixture award 수정하기");
    assert.equal(input("날짜").value, "2024");
    await change("제목", "Updated award");
    await click("저장하기");
    assert.deepEqual(saved[2].talentExtras, [
      { ...fixture.talentExtras[0], title: "Updated award" },
    ]);
    await click("Updated role 수정하기");
    await change("직무", "Discarded change");
    await click("취소");
    assert.equal(saved.length, 3);
    await click("경력 추가");
    assert.equal(input("직무").value, "");
    assert.equal(input("회사명").value, "");
    assert.ok(button("추가"));
    await click("취소");
    await click("Updated role 수정하기");
    assert.equal(input("직무").value, "Updated role");
    assert.equal(saved.length, 3);
    assert.equal(network.mock.callCount(), 0);
  } finally {
    await act(async () => root.unmount());
    auth.mock.restore();
    network.mock.restore();
    if (cssLoader) require.extensions[".css"] = cssLoader;
    else delete require.extensions[".css"];
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
