import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { JSDOM } from "jsdom";
import { MessagesProvider } from "@/i18n/useMessage";
import { gmailIntegrationQueryKey } from "@/hooks/career/useGmailIntegration";
import { GmailIntegrationAction } from "./GmailIntegrationAction";

test("restored Gmail write access shows completion while read-only connections retain the connect action", () => {
  for (const writeConnected of [false, true]) {
    const client = new QueryClient();
    client.setQueryData(gmailIntegrationQueryKey(null), {
      status: "active", connected: true, writeConnected,
      analysis: { status: "not_started", updatedAt: null },
    });
    const dom = new JSDOM(renderToStaticMarkup(
      <QueryClientProvider client={client}><MessagesProvider locale="ko"><GmailIntegrationAction /></MessagesProvider></QueryClientProvider>
    ));
    assert.equal(Boolean(dom.window.document.querySelector('svg.lucide-badge-check')), writeConnected);
    assert.equal(dom.window.document.querySelectorAll("button").length, writeConnected ? 0 : 1);
    dom.window.close();
    client.clear();
  }
});
