/** Diagnostic transport only: business outcomes and recovery remain source-owned. */
export const TOOL_MODEL_DIAGNOSTIC = Symbol.for("harper.toolModelDiagnostic");

export const TOOL_DIAGNOSTIC_LIMITS = { maxDepth: 12, maxNodes: 2048, maxChars: 64 * 1024 };
const PRIVATE_KEYS = /^(?:authorization|cookie|setcookie|password|passwd|secret|clientsecret|token|apikey|accesstoken|refreshtoken|idtoken|apitoken|authtoken|oauthtoken|sessiontoken|privatekey)$/i;
const ENVELOPES = new Set(["stack", "request", "config", "headers", "body"]);
const PRIORITY = ["name", "code", "status", "statusCode", "message", "cause", "errors"];
const reported = new WeakMap<object, readonly unknown[]>();

export function registerToolDiagnostics(value: unknown, diagnostics: readonly unknown[]) {
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    if (diagnostics.length) reported.set(value as object, diagnostics);
    else reported.delete(value as object);
  }
}
export function getToolDiagnostics(value: unknown): readonly unknown[] {
  return value !== null && (typeof value === "object" || typeof value === "function") ? reported.get(value as object) ?? [] : [];
}

export function redactToolDiagnosticText(value: string): string {
  let text = value;
  // Browser callers have no server credentials; only configured values are read.
  if (typeof process !== "undefined" && process.env) {
    for (const key of Object.keys(process.env)) {
      if (!/(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|SERVICE_ROLE_KEY|CLIENT_KEY)$/.test(key)) continue;
      const secret = process.env[key];
      if (secret && (secret.length >= 8 || text === secret)) text = text.split(secret).join("[Redacted]");
    }
  }
  return text.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [Redacted]")
    .replace(/(\b(?:api[_-]?key|token|(?:access|refresh|api|auth|oauth|id|session)[_-]?token|client[_-]?secret|password|authorization)\s*[=:]\s*["']?)[^\s,"';}]+/gi, "$1[Redacted]")
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[Redacted]@");
}

export function serializeToolDiagnostic(error: unknown, limits = TOOL_DIAGNOSTIC_LIMITS): string {
  const seen = new WeakMap<object, string>();
  let nodes = 0, chars = 0;
  const text = (value: string) => {
    const available = Math.max(0, limits.maxChars - chars);
    const safe = redactToolDiagnosticText(value.slice(0, available));
    chars += Math.min(safe.length, available);
    return value.length > available ? safe + "[Diagnostic size limit]" : safe;
  };
  function visit(value: unknown, depth: number, path: string): unknown {
    if (++nodes > limits.maxNodes) return "[Diagnostic node limit]";
    if (chars >= limits.maxChars) return "[Diagnostic size limit]";
    if (typeof value === "string") return text(value);
    if (value === null || typeof value === "boolean" || typeof value === "number") return value;
    if (typeof value === "function") return "[Function diagnostic]";
    if (typeof value !== "object") return text(String(value));
    const previous = seen.get(value);
    if (previous) return `[Circular/reference: ${previous}]`;
    if (depth >= limits.maxDepth) return "[Diagnostic depth limit]";
    seen.set(value, path);
    try {
      const policy = Object.getOwnPropertyDescriptor(value, TOOL_MODEL_DIAGNOSTIC);
      if (policy && "value" in policy) return visit(policy.value, depth + 1, `${path}.modelDiagnostic`);
      if (value instanceof Date) return text(value.toISOString());
      if (Array.isArray(value)) {
        const result: unknown[] = [];
        for (let index = 0; index < value.length; index++) {
          if (nodes >= limits.maxNodes || chars >= limits.maxChars) { result.push("[Diagnostic collection limit]"); break; }
          const item = Object.getOwnPropertyDescriptor(value, String(index));
          result.push(item && "value" in item ? visit(item.value, depth + 1, `${path}[${index}]`) : "[Accessor/hole not evaluated]");
        }
        return result;
      }
      if (value instanceof Map || value instanceof Set) {
        const result: unknown[] = [];
        for (const item of value instanceof Map ? value.entries() : value) {
          if (nodes >= limits.maxNodes || chars >= limits.maxChars) { result.push("[Diagnostic collection limit]"); break; }
          result.push(visit(item, depth + 1, `${path}[${result.length}]`));
        }
        return result;
      }
      const result: Record<string, unknown> = Object.create(null);
      const allKeys = Reflect.ownKeys(value);
      if (allKeys.length > limits.maxNodes) result.serializationIncomplete = true;
      const keys = allKeys.slice(0, limits.maxNodes).filter((key): key is string => typeof key === "string");
      for (const key of [...new Set([...PRIORITY, ...keys])]) {
        if (nodes >= limits.maxNodes || chars >= limits.maxChars) { result.serializationIncomplete = true; break; }
        const label = text(key);
        const canonical = key.replace(/[_-]/g, "");
        if (PRIVATE_KEYS.test(canonical) || ENVELOPES.has(key)) { result[label] = "[Excluded diagnostic metadata]"; continue; }
        let descriptor: PropertyDescriptor | undefined;
        try { descriptor = Object.getOwnPropertyDescriptor(value, key); }
        catch { result[label] = "[Unreadable diagnostic property]"; continue; }
        if (!descriptor && typeof DOMException !== "undefined" && value instanceof DOMException && ["name", "message", "code"].includes(key)) {
          const native = Object.getOwnPropertyDescriptor(DOMException.prototype, key);
          if (native?.get) { result[label] = visit(native.get.call(value), depth + 1, `${path}.${label}`); continue; }
        }
        if (!descriptor && value instanceof Error) {
          let prototype: object | null = value;
          let inherited: PropertyDescriptor | undefined;
          for (let level = 0; prototype && level < limits.maxDepth; level++) {
            inherited = Object.getOwnPropertyDescriptor(prototype, key);
            if (inherited) break;
            prototype = Object.getPrototypeOf(prototype);
          }
          if (inherited) result[label] = "value" in inherited ? visit(inherited.value, depth + 1, `${path}.${label}`) : "[Accessor not evaluated]";
          continue;
        }
        if (!descriptor) continue;
        if (!("value" in descriptor)) { result[label] = "[Accessor not evaluated]"; continue; }
        // Known SDK envelopes may carry a whole user request. Preserve diagnostic
        // status and the explicit error payload, never dump response data blindly.
        if (key === "response" && descriptor.value && typeof descriptor.value === "object") {
          const response = descriptor.value;
          const safe: Record<string, unknown> = {};
          for (const field of ["status", "statusCode", "statusText", "error"]) {
            const part = Object.getOwnPropertyDescriptor(response, field);
            if (part && "value" in part) safe[field] = part.value;
          }
          const data = Object.getOwnPropertyDescriptor(response, "data");
          const nested = data && "value" in data && data.value && typeof data.value === "object" ? Object.getOwnPropertyDescriptor(data.value, "error") : undefined;
          if (nested && "value" in nested) safe.error = nested.value;
          safe.excludedPayload = true;
          result[label] = visit(safe, depth + 1, `${path}.${label}`); continue;
        }
        result[label] = visit(descriptor.value, depth + 1, `${path}.${label}`);
      }
      return result;
    } catch { return "[Unreadable diagnostic object]"; }
  }
  try {
    const value = visit(error, 0, "$error");
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    return serialized.length > limits.maxChars ? serialized.slice(0, limits.maxChars) + "\n[Diagnostic size limit]" : serialized;
  } catch { return "The error diagnostic could not be read."; }
}

export const formatToolError = serializeToolDiagnostic;
export function toolErrorResult(error: unknown, diagnostics: readonly unknown[] = []) { return { ok: false as const, error: formatToolError(error), ...(diagnostics.length ? { additionalToolDiagnostics: formatToolError(diagnostics) } : {}) }; }

/** Compatibility export. Never rewrite a source-owned result or authored text. */
export function normalizeToolErrorResult<T>(result: T): T { return result; }

export function toolResultDiagnostics(value: unknown, includeReported = true): readonly unknown[] {
  const diagnostics = includeReported ? [...getToolDiagnostics(value)] : [];
  if (value instanceof Error) diagnostics.push(value);
  if (value && typeof value === "object") {
    for (const key of ["error", "errorDetails"]) {
      try {
        const property = Object.getOwnPropertyDescriptor(value, key);
        if (property && "value" in property && property.value !== undefined && property.value !== null && property.value !== false && property.value !== "") diagnostics.push(property.value);
      } catch { /* A renderer still gets the original result. */ }
    }
  }
  return diagnostics;
}

export function projectToolDiagnosticFieldsForTransport(value: unknown): unknown {
  if (value instanceof Error) return formatToolError(value);
  let projection = value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of ["error", "errorDetails"]) {
      const field = Object.getOwnPropertyDescriptor(value, key);
      if (field && "value" in field && field.value != null) {
        const safe = formatToolError(field.value);
        if (typeof field.value === "object" || ["bigint", "symbol", "function"].includes(typeof field.value) || (typeof field.value === "string" && safe !== field.value)) projection = { ...(projection as Record<string, unknown>), [key]: safe };
      }
    }
  }
  return projection;
}

export function prepareToolResultForModel(value: unknown, render: (value: unknown) => string = value => JSON.stringify(value), diagnostics = toolResultDiagnostics(value)): { content: string; diagnosticText?: string } {
  let base: string;
  try {
    const projection = projectToolDiagnosticFieldsForTransport(value);
    base = render(projection);
    if (typeof base !== "string") throw new TypeError("Tool renderer returned no text");
  }
  catch (error) {
    // This renderer is already a model-safe projection. A failed projection
    // cannot grant permission to disclose the entire original value.
    return { content: `Tool result rendering failed.\n${formatToolError(error)}`, diagnosticText: formatToolError(diagnostics) };
  }
  if (!diagnostics.length) return { content: base };
  // Valid JSON consumers (including assistantInstruction readers) keep valid JSON.
  const additional = formatToolError(diagnostics.length === 1 ? diagnostics[0] : diagnostics);
  return { content: base, diagnosticText: additional };
}

export function appendToolDiagnosticText(base: string, additional?: string): string {
  if (!additional) return base;
  try {
    const parsed = JSON.parse(base);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      let key = "additionalToolDiagnostics";
      for (let index = 2; Object.prototype.hasOwnProperty.call(parsed, key); index++) key = `additionalToolDiagnostics_${index}`;
      return JSON.stringify({ ...parsed, [key]: additional });
    }
  } catch { /* A text result uses a separate supplemental section. */ }
  return `${base}\n\nAdditional tool diagnostics:\n${additional}`;
}


export function serializeToolResultForModel(value: unknown, render: (value: unknown) => string = value => JSON.stringify(value), diagnostics = toolResultDiagnostics(value)): string {
  const prepared = prepareToolResultForModel(value, render, diagnostics);
  return appendToolDiagnosticText(prepared.content, prepared.diagnosticText);
}

export const TOOL_RUNTIME_CONTROL = Symbol.for("harper.toolRuntimeControl");

/** Explicit runtime control signal, never inferred from conversational wording. */
export function throwIfToolControlError(error: unknown): void {
  if (error && typeof error === "object" && Object.getOwnPropertyDescriptor(error, TOOL_RUNTIME_CONTROL)?.value === true) throw error;
}
