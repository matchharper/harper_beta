import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readForm, fillObservedFields } from "./form.mjs";

function node(tagName, type) {
  return {
    tagName,
    type,
    isConnected: true,
    getClientRects: () => [1],
    getAttribute: () => null,
    closest: () => null,
    hasAttribute: () => false,
    labels: [],
    value: "",
    name: type,
  };
}
test("observed refs survive value changes but never target a replacement node", () => {
  const first = node("INPUT", "email"),
    second = node("INPUT", "email");
  let nodes = [first];
  const context = vm.createContext({
    document: {
      querySelectorAll: () => nodes,
      title: "Form",
      body: { innerText: "Form" },
    },
    crypto: { randomUUID: () => "frame" },
    HTMLSelectElement: class {},
  });
  const read = () =>
    vm.runInContext(
      `(${readForm.toString()})({key:"fields",detailed:true})`,
      context
    );
  const ref = read().fields[0].ref;
  first.value = "changed@example.com";
  assert.equal(read().fields[0].ref, ref);
  first.isConnected = false;
  nodes = [second];
  assert.notEqual(read().fields[0].ref, ref);
  assert.equal(context.fields.nodes.has(ref), false);
});
function env(types, stopAfter = Infinity) {
  const calls = [],
    disposed = [];
  const resolve = async (ref) =>
    types[ref] && {
      evaluate: async (fn) => fn(node(types[ref][0], types[ref][1])),
      fill: async (value) => calls.push([ref, "fill", value]),
      selectOption: async (value) => calls.push([ref, "select", value]),
      setChecked: async (value) => calls.push([ref, "check", value]),
      dispose: async () => disposed.push(ref),
    };
  return { resolve, blocked: () => calls.length >= stopAfter, calls, disposed };
}
test("batch handles distinct native controls and stops immediately on held transmission", async () => {
  const e = env({
    a: ["INPUT", "email"],
    b: ["SELECT", "select-one"],
    c: ["INPUT", "checkbox"],
  });
  const fields = [
    { ref: "a", action: "fill", value: "synthetic@example.com" },
    { ref: "b", action: "select", value: "CA" },
    { ref: "c", action: "check", checked: false },
  ];
  assert.deepEqual((await fillObservedFields(fields, e)).completed, [
    "a",
    "b",
    "c",
  ]);
  assert.deepEqual(e.calls[1], ["b", "select", { value: "CA" }]);
  assert.deepEqual(e.calls[2], ["c", "check", false]);
  const held = env({ a: ["INPUT", "email"], b: ["SELECT", "select-one"] }, 1);
  assert.equal((await fillObservedFields(fields, held)).interrupted, true);
  assert.equal(held.calls.length, 1);
  assert.deepEqual(held.disposed, ["a"]);
});
test("missing/replaced fields and submit/file controls never execute or continue a batch", async () => {
  for (const type of ["submit", "file", "button"]) {
    const e = env({ a: ["INPUT", type], b: ["INPUT", "email"] });
    const result = await fillObservedFields(
      [
        { ref: "a", action: "fill", value: "x" },
        { ref: "b", action: "fill", value: "y" },
      ],
      e
    );
    assert.equal(result.failedRef, "a");
    assert.equal(e.calls.length, 0);
  }
  const e = env({});
  assert.equal(
    (
      await fillObservedFields(
        [{ ref: "missing", action: "fill", value: "x" }],
        e
      )
    ).failedRef,
    "missing"
  );
});
