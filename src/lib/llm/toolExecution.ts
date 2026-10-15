import { AsyncLocalStorage } from "node:async_hooks";
import { formatToolError, throwIfToolControlError, registerToolDiagnostics, serializeToolResultForModel, prepareToolResultForModel, toolResultDiagnostics, TOOL_DIAGNOSTIC_LIMITS } from "./toolError";

export type CapturedCall<T> =
  | { returned: true; value: T; diagnostics: readonly unknown[] }
  | { returned: false; error: unknown; diagnostics: readonly unknown[] };
const activeDiagnostics = new AsyncLocalStorage<unknown[]>();

/** Only unresolved, model-shareable diagnostics belong here. Invocation scoped. */
export function reportToolDiagnostic(value: unknown) {
  const diagnostics = activeDiagnostics.getStore();
  if (diagnostics && diagnostics.length < 32) {
    const remaining = TOOL_DIAGNOSTIC_LIMITS.maxChars - diagnostics.reduce<number>((total, item) => total + String(item).length, 0);
    if (remaining > 0) diagnostics.push(formatToolError(value, { ...TOOL_DIAGNOSTIC_LIMITS, maxChars: remaining }));
    else if (diagnostics[diagnostics.length - 1] !== "[Additional diagnostics omitted]") diagnostics.push("[Additional diagnostics omitted]");
  }
  else if (diagnostics && diagnostics.length === 32) diagnostics.push("[Additional diagnostics omitted]");
}

export async function runToolCall<T>(execute: () => Promise<T>, metadata: { callId?: string; name?: string } = {}): Promise<CapturedCall<T>> {
  const diagnostics: unknown[] = [];
  return activeDiagnostics.run(diagnostics, async () => {
    try {
      const value = await execute();
      return { returned: true, value, diagnostics };
    } catch (error) { return { returned: false, error, diagnostics }; }
    finally {
      if (diagnostics.length) {
        try { console.warn("[tool-diagnostics]", { ...metadata, diagnostic: formatToolError(diagnostics) }); }
        catch { /* Observability cannot replace the tool result. */ }
      }
    }
  });
}

/** Preserve caller-owned exception/control flow and the original result identity. */
export async function executeToolCall<T>(execute: () => Promise<T>): Promise<T> {
  const captured = await runToolCall(execute);
  if (!captured.returned) throw captured.error;
  registerToolDiagnostics(captured.value, captured.diagnostics);
  return captured.value;
}

export function prepareToolDelivery<T>(capture: CapturedCall<T>, render: (value: unknown) => string) {
  if (!capture.returned) return serializeToolResultForModel(capture.error, () => formatToolError(capture.error), capture.diagnostics);
  return serializeToolResultForModel(capture.value, render, [...new Set([...toolResultDiagnostics(capture.value, false), ...capture.diagnostics])]);
}

export { TOOL_DIAGNOSTIC_LIMITS };

/** A transport can preserve native blocks/JSON and attach this sidecar itself. */
export function prepareNativeToolDelivery<T, Content>(capture: CapturedCall<T>, render: (value: T) => Content): { content: Content; diagnosticText?: string } {
  if (!capture.returned) throw capture.error;
  const content = render(capture.value);
  const diagnosticText = capture.diagnostics.map(value => formatToolError(value)).join("\n");
  return { content, ...(diagnosticText ? { diagnosticText } : {}) };
}

export function unwrapToolCall<T>(capture: CapturedCall<T>): T {
  if (!capture.returned) throw capture.error;
  return capture.value;
}

/** Reporting callbacks cannot turn an already verified result into a tool failure. */
export async function observeToolCall(effect: () => unknown): Promise<void> {
  try { await effect(); }
  catch (error) {
    throwIfToolControlError(error);
    reportToolDiagnostic({ error, source: "reporting_callback" });
    try { console.warn("[tool-observer-failed]", formatToolError(error)); } catch { /* Preserve the original execution path. */ }
  }
}

export function prepareToolDeliveryParts<T>(capture: CapturedCall<T>, render: (value: unknown) => string) {
  if (!capture.returned) return { content: formatToolError(capture.error), diagnosticText: formatToolError(capture.diagnostics) };
  return prepareToolResultForModel(capture.value, render, [...capture.diagnostics, ...toolResultDiagnostics(capture.value, false)]);
}
