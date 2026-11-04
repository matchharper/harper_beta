import { useState } from "react";
import { History, Loader2 } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerT } from "@/i18n/useCareerT";
import type { StoredProfile } from "@/lib/career/profiles/store";

type Summary = {
  id: string;
  title: string;
  current_revision: number;
  is_default: boolean;
  is_archived: boolean;
};
type Detail = StoredProfile & {
  history: Array<{ revision: number; created_at: string }>;
};
export default function CareerProfileVersions() {
  const t = useCareerT(),
    { fetchWithAuth } = useCareerApi();
  const [open, setOpen] = useState(false),
    [profiles, setProfiles] = useState<Summary[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = async (url: string, init?: RequestInit) => {
    const response = await fetchWithAuth(url, init),
      body = await response.json();
    if (!response.ok) throw new Error(body.error);
    return body;
  };
  const read = async (profileId: string, revision?: number) =>
    setDetail(
      await request(
        `/api/talent/profiles?${new URLSearchParams({ profileId, ...(revision ? { revision: String(revision) } : {}) })}`
      )
    );
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("career.profile.versions.failed", "프로필을 불러오지 못했어요.")
      );
    } finally {
      setBusy(false);
    }
  };
  const listAll = async () => {
    const items: Summary[] = [];
    let cursor: string | null = null;
    do {
      const page = await request(
        `/api/talent/profiles${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`
      );
      items.push(...page.profiles);
      cursor = page.nextCursor;
    } while (cursor);
    return items;
  };
  const load = async () => {
    const result = { profiles: await listAll() };
    setProfiles(result.profiles);
    const first =
      result.profiles.find((p: Summary) => p.is_default) ?? result.profiles[0];
    if (first) await read(first.id);
  };
  const change = async (action: string) => {
    if (!detail) return;
    await run(async () => {
      const saved = await request("/api/talent/profiles", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          action,
          profileId: detail.profileId,
          expectedRevision: detail.revision,
          ...(action === "copy"
            ? {
                title: `${detail.title} · ${t("career.profile.versions.copy_suffix", "복사본")}`,
              }
            : {}),
        }),
      });
      const list = await listAll();
      setProfiles(list);
      await read(saved.profileId);
      if (action === "set_default")
        window.dispatchEvent(
          new CustomEvent("career-profile-updated", { detail: saved.snapshot })
        );
    });
  };
  const current = profiles.find((p) => p.id === detail?.profileId),
    isLatest = current?.current_revision === detail?.revision;
  return (
    <>
      <MuteButton
        size="sm"
        variant="transparent"
        onClick={() => {
          setOpen(true);
          void run(load);
        }}
      >
        <History className="size-4" />
        {t("career.profile.versions.title", "프로필 버전")}
      </MuteButton>
      <TalentCareerModal
        open={open}
        onClose={() => setOpen(false)}
        title={t("career.profile.versions.title", "프로필 버전")}
        panelClassName="max-w-3xl"
      >
        <div className="space-y-5 p-5" aria-busy={busy}>
          <div className="flex flex-wrap gap-2">
            <Select
              value={detail?.profileId ?? null}
              onValueChange={(value) => {
                if (value) void run(() => read(String(value)));
              }}
            >
              <SelectTrigger
                aria-label={t("career.profile.versions.choose", "프로필 선택")}
                className="min-w-44 flex-1"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.title}
                    {profile.is_default
                      ? ` · ${t("career.profile.versions.default", "기본")}`
                      : ""}
                    {profile.is_archived
                      ? ` · ${t("career.profile.versions.archived", "보관됨")}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={detail ? String(detail.revision) : null}
              onValueChange={(value) => {
                if (value && detail)
                  void run(() => read(detail.profileId, Number(value)));
              }}
            >
              <SelectTrigger
                aria-label={t("career.profile.versions.history", "변경 이력")}
                className="w-auto min-w-32"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {detail?.history.map((row) => (
                  <SelectItem key={row.revision} value={String(row.revision)}>
                    v{row.revision} ·{" "}
                    {new Date(row.created_at).toLocaleDateString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? (
            <p role="alert" className="text-critical">
              {error}
            </p>
          ) : null}
          {busy ? <Loader2 className="size-5 animate-spin" /> : null}
          {detail ? (
            <>
              <div className="flex flex-wrap gap-2">
                <MuteButton
                  size="sm"
                  disabled={busy}
                  onClick={() => void change("copy")}
                >
                  {t("career.profile.versions.copy", "이 버전 복사")}
                </MuteButton>
                {!detail.isDefault && isLatest ? (
                  <MuteButton
                    size="sm"
                    disabled={busy}
                    onClick={() => void change("set_default")}
                  >
                    {t(
                      "career.profile.versions.make_default",
                      "기본 프로필로 사용"
                    )}
                  </MuteButton>
                ) : null}
                {!detail.isDefault && isLatest ? (
                  <MuteButton
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void change(detail.isArchived ? "restore" : "archive")
                    }
                  >
                    {detail.isArchived
                      ? t("career.profile.versions.restore", "복원")
                      : t("career.profile.versions.archive", "보관")}
                  </MuteButton>
                ) : null}
              </div>
              <article className="space-y-5 text-sm text-neutral-primary">
                <div>
                  <h3 className="font-semibold">
                    {detail.snapshot.talentUser?.name}
                  </h3>
                  <p>{detail.snapshot.talentUser?.headline}</p>
                  <p className="mt-2 whitespace-pre-wrap">
                    {detail.snapshot.talentUser?.bio}
                  </p>
                </div>
                {detail.snapshot.talentExperiences.map((row, i) => (
                  <div key={row.id ?? i}>
                    <p className="font-medium">
                      {row.company_name} · {row.role}
                    </p>
                    <p className="text-neutral-muted">
                      {row.start_date} — {row.end_date}
                    </p>
                    <p className="whitespace-pre-wrap">{row.description}</p>
                  </div>
                ))}
                {detail.snapshot.talentEducations.map((row, i) => (
                  <div key={row.id ?? i}>
                    <p className="font-medium">
                      {row.school} · {row.degree}
                    </p>
                    <p className="text-neutral-muted">
                      {row.start_date} — {row.end_date}
                    </p>
                    <p className="whitespace-pre-wrap">{row.description}</p>
                  </div>
                ))}
                {detail.snapshot.talentExtras.map((row, i) => (
                  <div key={row.id ?? i}>
                    <p className="font-medium">
                      {row.title} {row.date}
                    </p>
                    <p className="whitespace-pre-wrap">{row.description}</p>
                  </div>
                ))}
              </article>
            </>
          ) : null}
        </div>
      </TalentCareerModal>
    </>
  );
}
