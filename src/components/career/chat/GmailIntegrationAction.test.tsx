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
    });
    const dom = new JSDOM(renderToStaticMarkup(
      <QueryClientProvider client={client}><MessagesProvider locale="ko"><GmailIntegrationAction /></MessagesProvider></QueryClientProvider>
    ));
    assert.equal(Boolean(dom.window.document.querySelector('[role="img"][aria-label="연결됨"]')), writeConnected);
    assert.equal(dom.window.document.querySelectorAll("button").length, writeConnected ? 0 : 1);
    dom.window.close();
    client.clear();
  }
});


test("an inbox-read offer accepts a read-only connection independently of sending", () => {
  const client = new QueryClient();
  client.setQueryData(gmailIntegrationQueryKey(null), {
    status: "active", connected: true, writeConnected: false,
  });
  const dom = new JSDOM(renderToStaticMarkup(
    <QueryClientProvider client={client}><MessagesProvider locale="ko"><GmailIntegrationAction capability="read" /></MessagesProvider></QueryClientProvider>
  ));
  assert.ok(dom.window.document.querySelector('[aria-label="연결됨"]'));
  assert.match(dom.window.document.body.textContent ?? "", /커리어에 필요한 메일/);
  assert.equal(dom.window.document.querySelectorAll("button").length, 0);
  dom.window.close();
  client.clear();
});
