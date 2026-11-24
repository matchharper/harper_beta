import "server-only";

import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

// 배포 후 실험중인 지표에서 팀원이 화면에서 바꾸는 변화별 상태(ops_tracked_changes). 변화의 정의는 OPS_TRACKED_CHANGES에 있다.
// data는 JSON이다. 지금은 endedAt(추적 종료 시각)만 쓰고, 새 상태는 칼럼 대신 data에 필드로 더한다.

type Data = { endedAt?: string | null } & Record<string, unknown>;
type Row = { data: Data | null; key: string; updated_at?: string };

type QueryResult<T> = PromiseLike<{ data: T; error: { message?: string } | null }>;
type Table = {
  select: (columns: string) => QueryResult<Row[] | null> & {
    eq: (column: string, value: string) => { maybeSingle: () => QueryResult<Row | null> };
  };
  upsert: (values: Row) => QueryResult<null>;
};

function table() {
  const admin = getTalentSupabaseAdmin() as unknown as { from: (name: string) => Table };
  return admin.from("ops_tracked_changes");
}

export type OpsTrackedChangeState = { endedAt: string | null; key: string };

export async function listOpsTrackedChangeStates(): Promise<OpsTrackedChangeState[]> {
  const { data, error } = await table().select("key, data");
  if (error) throw new Error(`추적 상태를 읽지 못했습니다: ${error.message ?? "unknown"}`);
  return (data ?? []).map((row) => ({ endedAt: row.data?.endedAt ?? null, key: row.key }));
}

/** Ends or resumes tracking one change, keeping any other fields already in its data. */
export async function setOpsTrackedChangeEnded(args: { ended: boolean; key: string }) {
  const current = await table().select("key, data").eq("key", args.key).maybeSingle();
  if (current.error) throw new Error(`추적 상태를 읽지 못했습니다: ${current.error.message ?? "unknown"}`);
  const now = new Date().toISOString();
  const { error } = await table().upsert({
    data: { ...(current.data?.data ?? {}), endedAt: args.ended ? now : null },
    key: args.key,
    updated_at: now,
  });
  if (error) throw new Error(`추적 상태를 저장하지 못했습니다: ${error.message ?? "unknown"}`);
}
