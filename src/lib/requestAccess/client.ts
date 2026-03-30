export function extractRequestAccessToken(input: string) {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return "";

  try {
    const url =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? new URL(trimmed)
        : trimmed.includes("?") && trimmed.includes("=")
          ? new URL(trimmed, "https://matchharper.com")
          : null;

    const request = url?.searchParams.get("request");
    return String(request ?? "").trim() || trimmed;
  } catch {
    return trimmed;
  }
}
