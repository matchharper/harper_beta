// Runs in a browser frame. Stable refs point to the observed DOM node, never a
// selector guessed by the model or an index that could target a replacement.
export function readForm({ detailed = true, key }) {
  const registry = (globalThis[key] ||= {
    nodes: new Map(),
    refs: new WeakMap(),
    next: 0,
    prefix: crypto.randomUUID(),
  });
  const fields = [...document.querySelectorAll("input,textarea,select")]
    .filter((e) => e.type !== "hidden")
    .map((e) => {
      let ref = registry.refs.get(e);
      if (!ref) {
        ref = `${registry.prefix}:${++registry.next}`;
        registry.refs.set(e, ref);
        registry.nodes.set(ref, e);
      }
      const field = {
        ref,
        tag: e.tagName.toLowerCase(),
        type: e.getAttribute("role") || e.type || "",
        label:
          [...(e.labels || [])].map((l) => l.innerText.trim()).join(" ") ||
          e.getAttribute("aria-label") ||
          e.name ||
          "",
        value:
          e.type === "file"
            ? [...(e.files || [])].map((f) => f.name).join(", ")
            : ["checkbox", "radio"].includes(e.type)
              ? String(e.checked)
              : e.value || "",
      };
      if (!detailed) return field;
      return {
        ...field,
        requiredState:
          e.required || e.getAttribute("aria-required") === "true"
            ? true
            : e.getAttribute("aria-required") === "false"
              ? false
              : null,
        maxLength: e.hasAttribute("maxlength") ? e.maxLength : null,
        fileTypes:
          e.type === "file" ? (e.accept || "").split(",").filter(Boolean) : [],
        instructions: (
          e.closest("fieldset")?.innerText ||
          e.parentElement?.innerText ||
          ""
        ).slice(0, 2000),
        options:
          e instanceof HTMLSelectElement
            ? [...e.options].map((o) => ({ label: o.text, value: o.value }))
            : undefined,
        valid: e.validity?.valid,
        error: e.validationMessage || "",
        visible: e.getClientRects().length > 0,
      };
    });
  for (const [ref, node] of registry.nodes)
    if (!node.isConnected) registry.nodes.delete(ref);
  return {
    fields,
    ...(detailed
      ? {
          text: (document.body?.innerText || "").slice(0, 40000),
          title: document.title,
        }
      : {}),
  };
}

// No clicks, submissions, JavaScript or arbitrary selectors. Conditional/custom
// controls remain available through Stagehand's existing observed UI tools.
export async function fillObservedFields(items, { resolve, blocked }) {
  const completed = [];
  for (const item of items) {
    if (blocked()) return { completed, interrupted: true };
    let handle;
    try {
      handle = await resolve(item.ref);
      if (!handle)
        throw Error("Field is no longer present; inspect the current form");
      const kind = await handle.evaluate((e) => {
        if (
          !e.isConnected ||
          !e.getClientRects().length ||
          e.disabled ||
          e.readOnly
        )
          return null;
        if (e.tagName === "SELECT") return "select";
        if (e.tagName === "TEXTAREA") return "fill";
        if (e.tagName !== "INPUT") return null;
        if (["checkbox", "radio"].includes(e.type)) return "check";
        return [
          "text",
          "email",
          "tel",
          "url",
          "search",
          "number",
          "date",
          "month",
          "week",
          "time",
          "datetime-local",
          "password",
        ].includes(e.type)
          ? "fill"
          : null;
      });
      if (kind !== item.action)
        throw Error(
          "Field does not support this operation; use the current observed control"
        );
      if (blocked()) return { completed, interrupted: true };
      if (kind === "check") {
        if (typeof item.checked !== "boolean")
          throw Error("Checkbox value must be boolean");
        await handle.setChecked(item.checked, { timeout: 5000 });
      } else {
        if (typeof item.value !== "string")
          throw Error("Field value must be a string");
        if (kind === "select")
          await handle.selectOption({ value: item.value }, { timeout: 5000 });
        else await handle.fill(item.value, { timeout: 5000 });
      }
      completed.push(item.ref);
    } catch (error) {
      return {
        completed,
        interrupted: true,
        failedRef: item.ref,
        error: String(error.message || error),
      };
    } finally {
      await handle?.dispose().catch(() => {});
    }
  }
  return { completed, interrupted: blocked() };
}
