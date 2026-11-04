import { CAREER_HANDBOOK_REPLIES, CAREER_HANDBOOKS, findCareerHandbook, normalizeCareerHandbookLeases, type CareerHandbookId, type CareerHandbookLease } from "./registry";

/** Supply/consumption facts only. The conversation reply claim owns concurrency. */
export class CareerHandbookRuntime {
  private readonly leases = new Map<CareerHandbookId, CareerHandbookLease>();
  readonly loaded = new Set<CareerHandbookId>();
  readonly injected = new Set<CareerHandbookId>();
  private readonly manualLoads = new Set<CareerHandbookId>();

  constructor(remembered: readonly CareerHandbookLease[] = []) {
    for (const lease of normalizeCareerHandbookLeases(remembered)) this.leases.set(lease.id, { ...lease });
  }
  load(ids: readonly CareerHandbookId[], source: "selector" | "manual") {
    for (const id of ids) {
      const book = findCareerHandbook(id);
      if (!book) continue;
      const existing = this.leases.has(id);
      if (!existing || (source === "manual" && !this.manualLoads.has(id))) {
        this.leases.set(id, { id, version: book.version, remainingReplies: CAREER_HANDBOOK_REPLIES });
        this.loaded.add(id);
      }
      if (source === "manual") this.manualLoads.add(id);
    }
  }
  snapshot() {
    return CAREER_HANDBOOKS.flatMap(book => {
      const lease = this.leases.get(book.id);
      return lease ? [{ ...lease }] : [];
    });
  }
  blocks() {
    return this.snapshot().flatMap(lease => {
      const book = findCareerHandbook(lease.id);
      return book ? [{ key: `handbook:${book.id}`, text: `## Handbook: ${book.id}\n${book.body}`, cacheable: false }] : [];
    });
  }
  markInjected(supplied: readonly CareerHandbookLease[]) {
    for (const lease of supplied) if (this.leases.get(lease.id)?.version === lease.version) this.injected.add(lease.id);
  }
  afterDeliveredReply(): CareerHandbookLease[] {
    return this.snapshot().map(lease => ({ ...lease, remainingReplies: lease.remainingReplies - (this.injected.has(lease.id) ? 1 : 0) }))
      .filter(lease => lease.remainingReplies > 0);
  }
}
