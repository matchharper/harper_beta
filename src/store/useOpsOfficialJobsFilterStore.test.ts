import assert from "node:assert/strict";
import test, { before } from "node:test";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
});

let jobsFilterStoreModule: typeof import("@/store/useOpsOfficialJobsFilterStore");

before(async () => {
  jobsFilterStoreModule = await import("@/store/useOpsOfficialJobsFilterStore");
});

test("normalizes invalid persisted official job filters", () => {
  const { normalizeOpsOfficialJobsStoredFilters } = jobsFilterStoreModule;

  assert.deepEqual(
    normalizeOpsOfficialJobsStoredFilters({
      jobFilter: "draft",
      linkedinFilter: "invalid" as "all",
      locationFilter: "ca" as "all",
      query: "platform engineer",
    }),
    {
      jobFilter: "draft",
      linkedinFilter: "all",
      locationFilter: "all",
      query: "platform engineer",
    }
  );
});

test("persists and rehydrates every official job list filter", async () => {
  const { useOpsOfficialJobsFilterStore } = jobsFilterStoreModule;
  useOpsOfficialJobsFilterStore.getState().setJobFilter("draft");
  useOpsOfficialJobsFilterStore.getState().setLinkedinFilter("unpublished");
  useOpsOfficialJobsFilterStore.getState().setLocationFilter("jp");
  useOpsOfficialJobsFilterStore.getState().setQuery("backend");

  const stored = storage.getItem("ops-official-jobs-filters");
  assert.ok(stored);

  useOpsOfficialJobsFilterStore.setState({
    jobFilter: "all",
    hasHydrated: false,
    linkedinFilter: "all",
    locationFilter: "all",
    query: "",
  });
  storage.setItem("ops-official-jobs-filters", stored);
  await useOpsOfficialJobsFilterStore.persist.rehydrate();

  assert.deepEqual(
    {
      hasHydrated: useOpsOfficialJobsFilterStore.getState().hasHydrated,
      jobFilter: useOpsOfficialJobsFilterStore.getState().jobFilter,
      linkedinFilter: useOpsOfficialJobsFilterStore.getState().linkedinFilter,
      locationFilter: useOpsOfficialJobsFilterStore.getState().locationFilter,
      query: useOpsOfficialJobsFilterStore.getState().query,
    },
    {
      hasHydrated: true,
      jobFilter: "draft",
      linkedinFilter: "unpublished",
      locationFilter: "jp",
      query: "backend",
    }
  );
});
