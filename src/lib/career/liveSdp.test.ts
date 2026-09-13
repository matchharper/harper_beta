import assert from "node:assert/strict";
import test from "node:test";
import { MAX_LIVE_SDP_OFFER_LENGTH, parseLiveSdpOffer } from "./liveSdp";

test("preserves the browser SDP offer including its final CRLF", () => {
  const offer = "v=0\r\ns=-\r\nt=0 0\r\n";

  assert.equal(parseLiveSdpOffer(offer), offer);
});

test("rejects missing and oversized SDP offers", () => {
  assert.equal(parseLiveSdpOffer("  \r\n"), null);
  assert.equal(parseLiveSdpOffer(42), null);
  assert.equal(
    parseLiveSdpOffer("x".repeat(MAX_LIVE_SDP_OFFER_LENGTH + 1)),
    null
  );
});
