import { createHash, randomUUID } from "node:crypto";
export const hash = (value) => createHash("sha256").update(value).digest("hex");

// Holds the actual browser request in the server worker, across Next invocations.
// No serialized HTTP replay, guessed submission endpoint, or model approval.
export class SubmissionGate {
  constructor(onChange) {
    this.onChange = onChange;
    this.pending = null;
    this.receipts = new Map();
    this.denied = false;
  }
  async hold(route, snapshot) {
    if (this.pending || this.denied) return route.abort("blockedbyclient");
    const r = route.request(),
      body = r.postDataBuffer() || Buffer.alloc(0);
    const contentType = r.headers()["content-type"] || "";
    const state = { pageUrl: snapshot.url, fields: snapshot.fields };
    const item = {
      id: randomUUID(),
      url: r.url(),
      method: r.method(),
      bodyHash: hash(body),
      formHash: hash(JSON.stringify(state)),
      ...state,
    };
    if (
      /^(application\/(json|x-www-form-urlencoded)|text\/)/i.test(contentType)
    ) {
      if (body.length > 256000) return route.abort("blockedbyclient");
      item.bodyPreview = body.toString("utf8");
    }
    await new Promise((resolve) => {
      this.pending = { item, route, resolve };
      this.onChange(item);
    });
  }
  async resolve(request, approved) {
    const prior = this.receipts.get(request.id);
    if (prior) {
      if (
        prior.bodyHash !== request.bodyHash ||
        prior.formHash !== request.formHash ||
        prior.approved !== approved
      )
        throw Error("Submission decision scope changed");
      if (prior.error)
        throw Error(
          "Approved request outcome is uncertain; it will not be replayed"
        );
      return { executed: prior.executed };
    }
    const held = this.pending;
    if (
      !held ||
      held.item.id !== request.id ||
      held.item.bodyHash !== request.bodyHash ||
      held.item.formHash !== request.formHash
    )
      throw Error("Submission approval is no longer current");
    const receipt = {
      bodyHash: request.bodyHash,
      formHash: request.formHash,
      approved,
      executed: approved,
    };
    this.receipts.set(request.id, receipt); // claim before any external side effect
    if (!approved) this.denied = true;
    try {
      if (approved) await held.route.continue();
      else await held.route.abort("blockedbyclient");
    } catch {
      receipt.error = true;
      throw Error(
        "Approved request outcome is uncertain; it will not be replayed"
      );
    } finally {
      if (this.pending === held) this.pending = null;
      held.resolve();
      this.onChange(this.pending?.item ?? null);
    }
    return { executed: approved };
  }
  async close() {
    if (this.pending)
      await this.resolve(this.pending.item, false).catch(() => {});
  }
}
