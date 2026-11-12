import type { CareerMessagePayload } from "@/components/career/types";

/** Resolve admission immediately so another input can be sent while output is
 * streaming. A lost stream after admission must never become a message retry. */
export function receiveCareerReply(response: Response, callbacks: {
  onMessage: (message: CareerMessagePayload, live: boolean) => void;
  onSettled: () => void;
}): Promise<{ userMessage?: CareerMessagePayload; error?: string }> {
  if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("text/event-stream"))
    return response.json();
  return new Promise((resolve, reject) => {
    let admitted = false;
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const event = (frame: string) => {
      const lines = frame.split("\n");
      const kind = lines.find(line => line.startsWith("event:"))?.slice(6).trim();
      const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
      if (!data) return;
      const value = JSON.parse(data);
      if (kind === "admitted" && value?.userMessage) { admitted = true; resolve(value); }
      if ((kind === "activity" || kind === "message") && value?.message)
        callbacks.onMessage(value.message, kind === "activity");
    };
    void (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
          let boundary: number;
          while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            event(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2);
          }
          if (done) { if (buffer.trim()) event(buffer); break; }
        }
        if (!admitted) throw new Error("Chat admission was not acknowledged");
      } catch (error) {
        await reader.cancel().catch(() => undefined);
        if (!admitted) reject(error);
      } finally {
        reader.releaseLock();
        if (admitted) callbacks.onSettled();
      }
    })();
  });
}
