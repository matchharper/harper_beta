// pages/index.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";

type LeadRow = {
  id: string | number;
  local_id: string;
  email: string;
  url: string | null;
  text: string | null;
  type: number;
  name: string | null;
};

function getOrCreateLocalId() {
  if (typeof window === "undefined") return "";
  const key = "lead_local_id";
  let v = window.localStorage.getItem(key);
  if (!v) {
    // Simple local id (uuid 대체)
    v = `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(key, v);
  }
  return v;
}

export default function HomePage() {
  const [localId, setLocalId] = useState("");
  const [contact, setContact] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");

  const [recent, setRecent] = useState<LeadRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const contactRef = useRef<HTMLInputElement | null>(null);

  // 1) local_id 세팅 + 첫 인풋 포커스
  useEffect(() => {
    const id = getOrCreateLocalId();
    setLocalId(id);

    // next tick focus
    requestAnimationFrame(() => {
      contactRef.current?.focus();
    });
  }, []);

  const fetchRecent = useCallback(async (lid: string) => {
    if (!lid) return;
    setLoadingRecent(true);
    const { data, error } = await supabase
      .from("harper_waitlist")
      .select("local_id, email, url, text, id, name")
      .eq("local_id", lid)
      .order("created_at", { ascending: false });

    setLoadingRecent(false);
    if (error) {
      console.error(error);
      return;
    }
    setRecent((data ?? []) as LeadRow[]);
  }, []);

  // 2) local_id 준비되면 최근 10개 로드
  useEffect(() => {
    if (!localId) return;
    fetchRecent(localId);
  }, [localId, fetchRecent]);

  const canSubmit = useMemo(() => {
    return contact.trim().length > 0 && localId.length > 0;
  }, [contact, localId]);

  const submit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!canSubmit) return;

      const payload = {
        local_id: localId,
        email: contact.trim(),
        url: url.trim() ? url.trim() : null,
        text: note.trim() ? note.trim() : null,
        name: name.trim() ? name.trim() : null,
      };

      // 3) "기다리지 말고 바로 다음 사람"
      // - 입력값 즉시 비우고 포커스
      setContact("");
      setUrl("");
      setNote("");
      setName("");
      requestAnimationFrame(() => contactRef.current?.focus());

      // 4) Optimistic: 화면에 먼저 추가(임시 id)
      const optimistic: LeadRow = {
        id: Date.now(),
        local_id: localId,
        email: payload.email,
        url: payload.url,
        text: payload.text,
        type: 1,
        name: payload.name,
      };
      setRecent((prev) => [optimistic, ...prev]);

      // 5) 실제 insert는 await 안 함 (fire-and-forget)
      //    완료되면 recent를 다시 당겨와서 tmp 정리
      supabase
        .from("harper_waitlist")
        .insert(payload)
        .then(({ error }) => {
          if (error) {
            console.error(error);
            // 실패 시: 일단 다시 fetch해서 정리 (또는 optimistic 제거)
            fetchRecent(localId);
            return;
          }
          fetchRecent(localId);
        });
    },
    [canSubmit, contact, url, note, localId, fetchRecent, name]
  );

  const deleteRow = useCallback(
    (row: LeadRow) => {
      // 1) optimistic remove
      setRecent((prev) => prev.filter((r) => r.email !== row.email));

      supabase
        .from("harper_waitlist")
        .delete()
        .eq("email", row.email)
        .then(({ error }) => {
          if (error) {
            console.error(error);
            fetchRecent(localId);
          }
        });
    },
    [fetchRecent, localId]
  );

  return (
    <div className="min-h-screen bg-white font-inter">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Quick Input</h1>
        <p className="mt-2 text-sm text-neutral-500">Enter to upload</p>

        <form
          onSubmit={submit}
          className="mt-6 rounded-2xl border border-neutral-200 p-4 shadow-sm"
        >
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-800">
                이름
              </label>
              <input
                ref={contactRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 text-sm outline-none focus:border-neutral-400 px-4 py-4"
                placeholder=""
                inputMode="text"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-800">
                Email or Phone
              </label>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 text-sm outline-none focus:border-neutral-400 px-4 py-4"
                placeholder="e.g. hello@company.com or 010-1234-5678"
                inputMode="email"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-800">
                URL
              </label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 text-sm outline-none focus:border-neutral-400 px-4 py-4"
                placeholder="https://..."
                autoComplete="off"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-800">
                기타 정보 (혹시 있으시면)
              </label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 text-sm outline-none focus:border-neutral-400 px-4 py-4"
                placeholder="기타 정보"
                autoComplete="off"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                업로드 (Enter)
              </button>

              <button
                type="button"
                onClick={() => fetchRecent(localId)}
                className="text-sm text-neutral-600 hover:text-neutral-900"
              >
                Refresh
              </button>
            </div>
          </div>
        </form>

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">최근 입력 (50개)</h2>
          </div>

          <div className="mt-3 divide-y divide-neutral-200 rounded-2xl border border-neutral-200">
            {recent.length === 0 ? (
              <div className="p-4 text-sm text-neutral-500">아직 없음</div>
            ) : (
              recent.map((r, index) => (
                <div key={index} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex flex-row w-full justify-between items-center">
                      <div className="flex flex-col gap-1">
                        <div className="truncate text-sm font-medium text-black">
                          {r.name} - {r.email}
                        </div>
                        <div className="mt-1 truncate text-xs text-neutral-600">
                          {r.url ? (
                            r.url
                          ) : (
                            <span className="text-neutral-400">(no url)</span>
                          )}
                        </div>
                        <div className="mt-1 truncate text-xs text-neutral-600">
                          {r.text ? (
                            r.text
                          ) : (
                            <span className="text-neutral-400">(no note)</span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => deleteRow(r)}
                        className="mt-2 shrink-0 rounded-md bg-neutral-100 px-2 py-1 text-xs text-red-500 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
