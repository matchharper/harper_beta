import test from "node:test";
import assert from "node:assert/strict";
import { browserPresentationPhase } from "./browserPresentation";
import { createSimulationSession } from "./session";

test("browser outcome remains pending until its actual chat message is loaded, including ended sessions", () => {
  const session = createSimulationSession({roleRef:"job:test",roleName:"Engineer",documentId:"cv",documentName:"CV"});
  session.browser = {id:"run",status:"running",startedAt:"",updatedAt:"",documentId:"cv",documentHash:"hash",url:"https://example.com",purpose:"Apply"};
  assert.equal(browserPresentationPhase(session, []), "running");
  session.browser.status = "waiting";
  assert.equal(browserPresentationPhase(session, []), null);
  session.browser.status = "uncertain";
  session.browser.result = {summary:"Stopped",url:"https://example.com",evidence:"Error"};
  assert.equal(browserPresentationPhase(session, []), "result");
  session.browser.resultMessageId = 123;
  assert.equal(browserPresentationPhase(session, []), "result");
  session.status = "ended";
  assert.equal(browserPresentationPhase(session, []), "result");
  assert.equal(browserPresentationPhase(session, [{id:"123"}]), null);
});
