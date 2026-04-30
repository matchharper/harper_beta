if (typeof window !== "undefined") {
  throw new Error("opportunityDiscovery utils must not run in the browser");
}

export function normalizeWhitespace(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}
