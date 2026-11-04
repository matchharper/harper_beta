import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { TabBoxes } from "./tab-boxes";

test("multiple selection toggles independently and single selection still changes tabs", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  const globals = {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const items = [
    { value: "full_time", label: "Full-time" },
    { value: "fractional", label: "Part-time" },
    { value: "advisor", label: "Advisor", disabled: true },
  ];
  const Multiple = () => {
    const [values, setValues] = useState(["full_time"]);
    return (
      <TabBoxes
        selectionMode="multiple"
        activeValues={values}
        onValueChange={setValues}
        items={items}
        variant="neutral"
      />
    );
  };
  const Single = () => {
    const [value, setValue] = useState("full_time");
    return (
      <TabBoxes
        activeValue={value}
        onValueChange={setValue}
        items={items}
        variant="neutral"
      />
    );
  };
  try {
    await act(() => root.render(<Multiple />));
    const buttons = [...dom.window.document.querySelectorAll("button")];
    const pressed = () =>
      buttons.map((button) => button.getAttribute("aria-pressed"));
    assert.ok(dom.window.document.querySelector('[role="group"]'));
    assert.equal(dom.window.document.querySelector('[role="tab"]'), null);
    assert.deepEqual(pressed(), ["true", "false", "false"]);
    await act(() => buttons[1].click());
    assert.deepEqual(pressed(), ["true", "true", "false"]);
    await act(() => buttons[0].click());
    assert.deepEqual(pressed(), ["false", "true", "false"]);
    await act(() => buttons[1].click());
    assert.deepEqual(pressed(), ["false", "false", "false"]);
    await act(() => buttons[2].click());
    assert.deepEqual(pressed(), ["false", "false", "false"]);

    await act(() => root.render(<Single />));
    const tabs = [
      ...dom.window.document.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]'
      ),
    ];
    assert.ok(dom.window.document.querySelector('[role="tablist"]'));
    await act(() => tabs[1].click());
    assert.deepEqual(
      tabs.map((tab) => tab.getAttribute("aria-selected")),
      ["false", "true", "false"]
    );
    assert.equal(tabs[1].getAttribute("aria-pressed"), null);
  } finally {
    await act(() => root.unmount());
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
