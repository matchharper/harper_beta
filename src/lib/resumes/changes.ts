export type ResumeChange = {
  op: "set" | "add" | "remove";
  path: string;
  value?: unknown;
};

const owns = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function hasId(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasId);
  return (
    isObject(value) && (owns(value, "id") || Object.values(value).some(hasId))
  );
}

function arrayIndex(array: unknown[], selector: string, append = false) {
  if (append && selector === "-") return array.length;
  // Objects with IDs are selected by their stable ID, not their current position.
  const byId = array.findIndex(
    (item) => isObject(item) && item.id === selector
  );
  if (byId !== -1) return byId;
  if (
    !array.some((item) => isObject(item) && owns(item, "id")) &&
    /^(0|[1-9]\d*)$/.test(selector)
  ) {
    const index = Number(selector);
    if (index < array.length || (append && index === array.length))
      return index;
  }
  throw new Error(
    "Resume change target not found. Read the current JSON before editing."
  );
}

// Apply to an isolated copy. The caller validates the complete result before saving.
export function applyResumeChanges<T>(original: T, changes: ResumeChange[]): T {
  const result = structuredClone(original);
  for (const change of changes) {
    if (!change.path.startsWith("/") || /~(?![01])/u.test(change.path))
      throw new Error(
        "Resume change path must be a JSON pointer relative to content."
      );
    const parts = change.path
      .slice(1)
      .split("/")
      .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
    if (
      parts.some(
        (part) =>
          !part ||
          ["__proto__", "prototype", "constructor", "id"].includes(part)
      )
    )
      throw new Error("Invalid resume change path; item IDs cannot be edited.");
    if (
      change.op !== "remove" &&
      (!owns(change, "value") || hasId(change.value))
    )
      throw new Error("Resume changes require a value without item IDs.");
    if (change.op === "remove" && owns(change, "value"))
      throw new Error("remove must not include a value.");
    let parent: unknown = result;
    for (const part of parts.slice(0, -1)) {
      if (Array.isArray(parent)) parent = parent[arrayIndex(parent, part)];
      else if (isObject(parent) && owns(parent, part)) parent = parent[part];
      else throw new Error("Resume change parent not found.");
    }
    const key = parts.at(-1)!;
    if (Array.isArray(parent)) {
      const index = arrayIndex(parent, key, change.op === "add");
      if (change.op === "add")
        parent.splice(index, 0, structuredClone(change.value));
      else if (change.op === "remove") parent.splice(index, 1);
      else {
        if (hasId(parent[index]))
          throw new Error(
            "Edit the entry fields instead of replacing an entry."
          );
        parent[index] = structuredClone(change.value);
      }
    } else if (isObject(parent)) {
      if (change.op === "add") {
        // An optional collection may not exist yet. Add its first entry directly.
        if (Array.isArray(parent[key]))
          parent[key].push(structuredClone(change.value));
        else if (!owns(parent, key))
          parent[key] = [structuredClone(change.value)];
        else throw new Error("Use add on an array, or set on an object field.");
      } else if (change.op === "remove") {
        if (!owns(parent, key))
          throw new Error("Resume change target not found.");
        delete parent[key];
      } else {
        if (hasId(parent[key]))
          throw new Error(
            "Edit individual entries instead of replacing a collection."
          );
        parent[key] = structuredClone(change.value);
      }
    } else throw new Error("Resume change parent must be an object or array.");
  }
  return result;
}
