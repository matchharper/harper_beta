import assert from "node:assert/strict";
import test from "node:test";
import {
  callNps,
  npsServiceKey,
  NpsApiError,
  parseNpsResponse,
} from "./client";

test("a single item and a list both come back as a list, with fields unchanged", () => {
  const one = parseNpsResponse(JSON.stringify({
    response: { header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
      body: { items: { item: { seq: "1", wkplNm: "하퍼" } }, totalCount: 1, pageNo: 1, numOfRows: 10 } },
  }));
  assert.deepEqual(one.items, [{ seq: "1", wkplNm: "하퍼" }]);
  assert.equal(one.totalCount, 1);

  const many = parseNpsResponse(JSON.stringify({
    response: { header: { resultCode: "00" }, body: { items: { item: [{ seq: "1" }, { seq: "2" }] }, totalCount: "2" } },
  }));
  assert.equal(many.items.length, 2);
  assert.equal(many.totalCount, 2);

  const none = parseNpsResponse(JSON.stringify({ response: { header: { resultCode: "00" }, body: { items: "", totalCount: 0 } } }));
  assert.deepEqual(none.items, []);
  // The live API answers a search with no match as a single empty object (observed 2026-11-23).
  const empty = parseNpsResponse(JSON.stringify({ response: { header: { resultCode: "00" }, body: { items: { item: [{}] }, totalCount: 0 } } }));
  assert.deepEqual(empty.items, []);
});

test("gateway errors arrive as XML and keep their reason", () => {
  assert.throws(
    () => parseNpsResponse(
      "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>",
      401
    ),
    (error: unknown) => error instanceof NpsApiError && error.details.code === "30"
      && error.message.includes("SERVICE_KEY_IS_NOT_REGISTERED_ERROR")
  );
  // With dataType=json the gateway answers an unregistered key like this (HTTP 403, observed 2026-11-23).
  assert.throws(
    () => parseNpsResponse(JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: {
      errMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR", returnAuthMsg: "등록되지 않은 서비스키", returnReasonCode: "30" } } }), 403),
    (error: unknown) => error instanceof NpsApiError && error.details.code === "30"
      && error.message.includes("SERVICE_KEY_IS_NOT_REGISTERED_ERROR")
  );
  assert.throws(
    () => parseNpsResponse(JSON.stringify({ response: { header: { resultCode: "03", resultMsg: "NODATA_ERROR" } } })),
    /NODATA_ERROR/
  );
});

test("an Encoding key is decoded once so the request is not double-encoded", async () => {
  assert.equal(npsServiceKey("abc%2Bdef%3D%3D"), "abc+def==");
  assert.equal(npsServiceKey("abc+def=="), "abc+def==");
  assert.throws(() => npsServiceKey(""), /DATA_GO_KR_SERVICE_KEY/);

  let requested = "";
  await callNps("search", { wkplNm: "하퍼", bzowrRgstNo: undefined }, {
    serviceKey: "abc%2Bdef%3D%3D",
    fetch: (async (url: URL) => {
      requested = url.toString();
      return new Response(JSON.stringify({ response: { header: { resultCode: "00" }, body: { items: "" } } }));
    }) as typeof fetch,
  });
  const url = new URL(requested);
  assert.equal(url.pathname, "/B552015/NpsBplcInfoInqireServiceV2/getBassInfoSearchV2");
  assert.equal(url.searchParams.get("serviceKey"), "abc+def==");
  assert.equal(url.searchParams.get("wkplNm"), "하퍼");
  assert.equal(url.searchParams.has("bzowrRgstNo"), false);
});
