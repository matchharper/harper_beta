import { getCareerDevSqlClient } from "./devSqlClient";

/**
 * Developer-only persona test histories. Each run is a test account
 * (`talent_test_accounts`) that played a public profile through first signup.
 */

// Deployed builds never serve personas; a dev server may point at any DB.
export function isDevPersonaEnabled() {
  return process.env.NODE_ENV !== "production";
}

// Only the isolated local stack lets a signed-out browser open personas.
export function allowsSignedOutPersonaAccess() {
  return process.env.HARPER_LOCAL_E2E === "1";
}

export type DevPersonaRun = {
  id: string;
  personaKey: string;
  personaName: string;
  linkedinUrl: string;
  talentUserId: string;
  label: string;
  hasReport: boolean;
  createdAt: string;
};

export type DevPersona = {
  key: string;
  name: string;
  linkedinUrl: string;
  runs: DevPersonaRun[];
};

export type DevPersonaListResponse = {
  personas: DevPersona[];
  currentRunId: string | null;
};

export type DevPersonaCurrentResponse = {
  current: {
    id: string;
    personaName: string;
    label: string;
    reportMarkdown: string;
    updatedAt: string;
  } | null;
};

type RunRow = {
  id: string;
  persona_key: string;
  persona_name: string;
  linkedin_url: string;
  talent_user_id: string;
  label: string;
  has_report: boolean;
  created_at: Date;
};

export async function listDevPersonaRuns(): Promise<DevPersona[]> {
  const sql = getCareerDevSqlClient();
  const rows = await sql<RunRow[]>`
    select id, persona_key, persona_name, linkedin_url, talent_user_id, label,
      length(report_markdown) > 0 as has_report, created_at
    from public.career_persona_test_runs
    order by persona_key, created_at desc`;
  const personas = new Map<string, DevPersona>();
  for (const row of rows) {
    const persona = personas.get(row.persona_key) ?? {
      key: row.persona_key,
      name: row.persona_name,
      linkedinUrl: row.linkedin_url,
      runs: [],
    };
    persona.runs.push({
      id: row.id,
      personaKey: row.persona_key,
      personaName: row.persona_name,
      linkedinUrl: row.linkedin_url,
      talentUserId: row.talent_user_id,
      label: row.label,
      hasReport: row.has_report,
      createdAt: row.created_at.toISOString(),
    });
    personas.set(row.persona_key, persona);
  }
  // Personas whose latest run is newest come first.
  return [...personas.values()].sort((a, b) =>
    b.runs[0].createdAt.localeCompare(a.runs[0].createdAt)
  );
}

export async function fetchDevPersonaRunForUser(
  userId: string
): Promise<DevPersonaCurrentResponse["current"]> {
  const sql = getCareerDevSqlClient();
  const [row] = await sql<
    {
      id: string;
      persona_name: string;
      label: string;
      report_markdown: string;
      updated_at: Date;
    }[]
  >`
    select id, persona_name, label, report_markdown, updated_at
    from public.career_persona_test_runs
    where talent_user_id = ${userId}::uuid`;
  if (!row) return null;
  return {
    id: row.id,
    personaName: row.persona_name,
    label: row.label,
    reportMarkdown: row.report_markdown,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function fetchDevPersonaRunTarget(runId: string) {
  const sql = getCareerDevSqlClient();
  const [row] = await sql<{ talent_user_id: string; email: string | null }[]>`
    select r.talent_user_id, u.email
    from public.career_persona_test_runs r
    join public.talent_test_accounts t on t.user_id = r.talent_user_id
    join auth.users u on u.id = r.talent_user_id
    where r.id = ${runId}::uuid`;
  return row ?? null;
}
