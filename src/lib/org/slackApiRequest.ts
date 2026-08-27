export function applyHarperSlackApiMessagePolicy(
  method: string,
  body: Record<string, unknown> = {}
) {
  if (method !== "chat.postMessage") return body;
  return {
    ...body,
    unfurl_links: false,
    unfurl_media: false,
  };
}

export function createSlackApiRequest(
  token: string,
  body: Record<string, unknown> = {}
) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value === null || value === undefined) continue;
    form.set(key, String(value));
  }

  return {
    body: form,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  } as const;
}
