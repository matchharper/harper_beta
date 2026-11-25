import type { TransactionSql } from "postgres";
import { getCompanyLeadershipClient } from "@/lib/career/companyLeadership";
import {
  getDisplayableCompanyLogoUrl,
  getHarperSupabaseStorageImageUrl,
} from "@/lib/imageUrl";
import {
  findSchool,
  getFaviconUrlForWebsite,
  getSchoolKey,
  getSchoolLogoUrl,
} from "@/lib/career/schoolDisplay";
import type {
  CompanyProfile,
  CompanyProfileFunding,
  CompanyProfileHeadcountMonth,
  CompanyProfileLinkedIn,
  CompanyProfileOrganization,
  CompanyProfilePeople,
} from "@/lib/career/companyProfileTypes";

const STATEMENT_TIMEOUT_MS = 15000;
/** Big companies are read from their most recent members so the page stays fast. */
const MEMBER_LIMIT = 800;
const TOP_ORGANIZATIONS = 7;
const TOP_SCHOOLS = 6;
const TOP_LOCATIONS = 6;
const MIN_PEOPLE_PROFILES = 20;
const NPS_LABEL = "국민연금 가입 현황";

type OrgRow = {
  company_db_id: number | null;
  linkedin_company_id: string | null;
  logo: string | null;
  n: number;
  name: string | null;
  website_url: string | null;
};

const cleanText = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

const normalizeName = (value: unknown) =>
  cleanText(value)
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s.,()]/g, "");

function resolveLogo(logo: string | null, website: string | null) {
  return (
    getHarperSupabaseStorageImageUrl(logo) ??
    getDisplayableCompanyLogoUrl(logo) ??
    getFaviconUrlForWebsite(website)
  );
}

/** Reads the 국민연금 markdown table: | 월 | 가입자수 | 입사 | 퇴사 | ... */
export function parseNpsHeadcount(
  content: string
): CompanyProfileHeadcountMonth[] {
  const toNumber = (cell: string | undefined) => {
    const text = String(cell ?? "").replace(/[,\s]/g, "");
    if (!text || text === "-") return null;
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  };
  const months: CompanyProfileHeadcountMonth[] = [];
  for (const line of content.split(/\r?\n/)) {
    const cells = line.split("|").map((cell) => cell.trim());
    const month = cells[1];
    if (!/^\d{4}-\d{2}$/.test(month ?? "")) continue;
    const members = toNumber(cells[2]);
    if (members === null) continue;
    months.push({
      month,
      members,
      hires: toNumber(cells[3]),
      leaves: toNumber(cells[4]),
    });
  }
  return months.sort((a, b) => a.month.localeCompare(b.month));
}

const UNKNOWN_FUNDING = /^(unknown|n\/a|none|미확인|알 수 없음|없음|-)\.?$/i;
const usableFunding = (value: unknown, maxLength: number) => {
  const text = cleanText(value).replace(/\.$/, "");
  if (!text || UNKNOWN_FUNDING.test(text) || /unknown|미확인/i.test(text)) {
    return null;
  }
  return text.length <= maxLength ? text : null;
};

/** "2026년 9월 · Series B · US$31.8M" is how the research step writes the last round. */
function parseLastRound(description: unknown, stage: unknown) {
  const text = cleanText(description);
  const match = text.match(
    /^(\d{4})년\s*(\d{1,2})월\s*·\s*([^·]+?)\s*·\s*(.+)$/
  );
  if (match) {
    return {
      amount: usableFunding(match[4], 24),
      date: `${match[1]}-${match[2].padStart(2, "0")}`,
      stage: usableFunding(match[3], 32),
    };
  }
  const fallbackStage = usableFunding(stage, 32);
  return fallbackStage
    ? { amount: null, date: null, stage: fallbackStage }
    : null;
}

const ROUND_HEADLINE =
  /^((?:Pre[- ]?Seed|Seed|Angel|Venture|Corporate)(?: Round)?|Series [A-Z]\d?)\s+-\s+/i;

function parseCrunchbaseRounds(crunchbase: unknown) {
  const events = (crunchbase as { timeline?: { recent_events?: unknown } })
    ?.timeline?.recent_events;
  if (!Array.isArray(events)) return [];
  const seen = new Set<string>();
  const rounds: { date: string; stage: string }[] = [];
  for (const event of events) {
    const record = event as { date?: unknown; headline?: unknown };
    const headline = cleanText(record.headline);
    const date = cleanText(record.date).slice(0, 7);
    const match = headline.match(ROUND_HEADLINE);
    if (!match || !/^\d{4}-\d{2}$/.test(date)) continue;
    const stage = match[1]
      .replace(/ Round$/i, "")
      .replace(/^Pre[- ]?Seed$/i, "Pre-Seed");
    const key = `${date}:${stage}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rounds.push({ date, stage });
  }
  return rounds.sort((a, b) => a.date.localeCompare(b.date));
}

/** "FuturePlay(Seed Round), TIPS Program(Grant)" and "A, B, and C" both become names. */
function parseInvestorNames(...values: unknown[]) {
  const names: { name: string; round: string | null }[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = cleanText(value).replace(/\.$/, "");
    if (!text || UNKNOWN_FUNDING.test(text)) continue;
    for (const part of text.split(/,|;|\s+and\s+|\s+&\s+|·/)) {
      const match = part
        .trim()
        .replace(/^and\s+/i, "")
        .match(/^(.+?)\s*(?:\(([^)]*)\))?$/);
      const name = cleanText(match?.[1]);
      const round = cleanText(match?.[2]) || null;
      if (!name || name.length > 60 || /grant|정부|program/i.test(round ?? ""))
        continue;
      const key = normalizeName(name);
      if (seen.has(key)) continue;
      seen.add(key);
      names.push({ name, round });
    }
  }
  return names.slice(0, 8);
}

type TalentBackground = {
  companyKeys: Set<string>;
  linkedinCompanyIds: Set<string>;
  schoolKeys: Set<string>;
};

function toOrganizations(
  rows: OrgRow[],
  mine: (row: OrgRow) => boolean
): CompanyProfileOrganization[] {
  return rows.map((row) => ({
    companyDbId: row.company_db_id === null ? null : Number(row.company_db_id),
    count: Number(row.n),
    logoUrl: resolveLogo(row.logo, row.website_url),
    mine: mine(row),
    name: cleanText(row.name),
  }));
}

export async function fetchCompanyProfile(args: {
  companyDbId: number;
  talentId: string | null;
}): Promise<CompanyProfile> {
  const db = getCompanyLeadershipClient();
  const companyDbId = args.companyDbId;

  return db.begin(async (tx) => {
    await tx.unsafe(
      `set local statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`
    );

    const [companyRow] = await tx<
      {
        crunchbase_information: unknown;
        employee_count: number | null;
        investors: string | null;
        last_funding_round_description: string | null;
        last_funding_stage: string | null;
        main_investors: string | null;
        nps: string | null;
        people_stats: unknown;
        total_funding_raised: string | null;
        active_roles: number;
        recent_roles: number;
      }[]
    >`
      WITH workspaces AS MATERIALIZED (
        SELECT company_workspace_id FROM public.company_workspace
        WHERE company_db_id = ${companyDbId}::bigint
      )
      SELECT
        cd.crunchbase_information,
        CASE WHEN jsonb_typeof(cd.harvestapi_information->'employeeCount') = 'number'
          THEN (cd.harvestapi_information->>'employeeCount')::float END AS employee_count,
        cd.harvestapi_information->'peopleStats' AS people_stats,
        cd.investors,
        fund.total_funding_raised,
        fund.main_investors,
        fund.last_funding_stage,
        fund.last_funding_round_description,
        (
          SELECT d.content FROM public.company_datas d
          WHERE d.company_workspace_id IN (SELECT company_workspace_id FROM workspaces)
            AND d.label = ${NPS_LABEL}
          ORDER BY d.checked_at DESC NULLS LAST, d.updated_at DESC
          LIMIT 1
        ) AS nps,
        (
          SELECT count(*)::int FROM public.company_roles r
          WHERE r.company_workspace_id IN (SELECT company_workspace_id FROM workspaces)
            AND r.status = 'active' AND r.is_expired IS NOT TRUE
            AND (r.expires_at IS NULL OR r.expires_at >= now())
        ) AS active_roles,
        (
          SELECT count(*)::int FROM public.company_roles r
          WHERE r.company_workspace_id IN (SELECT company_workspace_id FROM workspaces)
            AND r.status = 'active' AND r.is_expired IS NOT TRUE
            AND (r.expires_at IS NULL OR r.expires_at >= now())
            AND COALESCE(r.posted_at, r.created_at) >= now() - interval '14 days'
        ) AS recent_roles
      FROM public.company_db cd
      LEFT JOIN LATERAL (
        SELECT cdata.* FROM public.company_data cdata
        WHERE cdata.company_workspace_id IN (SELECT company_workspace_id FROM workspaces)
          AND COALESCE(cdata.confidence, 0) >= 70
        ORDER BY cdata.updated_at DESC NULLS LAST
        LIMIT 1
      ) fund ON TRUE
      WHERE cd.id = ${companyDbId}::bigint
    `;

    if (!companyRow) {
      return {
        companyDbId,
        funding: null,
        headcount: [],
        hiring: { active: 0, recent: 0 },
        linkedin: null,
        people: null,
      };
    }

    const talent = args.talentId
      ? await loadTalentBackground(tx, args.talentId)
      : null;
    const people = await loadPeople(tx, companyDbId, talent);
    const employeeCount = Number(companyRow.employee_count) || 0;
    const funding = await buildFunding(tx, companyRow);

    return {
      companyDbId,
      funding,
      headcount: companyRow.nps ? parseNpsHeadcount(companyRow.nps) : [],
      hiring: {
        active: Number(companyRow.active_roles ?? 0),
        recent: Number(companyRow.recent_roles ?? 0),
      },
      linkedin: readLinkedInPeopleStats(
        employeeCount,
        companyRow.people_stats,
        talent
      ),
      people,
    };
  });
}

/** Locations and schools from the company's LinkedIn People tab, as harvestapi stored them. */
function readLinkedInPeopleStats(
  employeeCount: number,
  peopleStats: unknown,
  talent: TalentBackground | null
): CompanyProfileLinkedIn | null {
  const groups = Array.isArray(peopleStats) ? peopleStats : [];
  const stat = (title: string) => {
    const group = groups.find(
      (item) => item && typeof item === "object" && item.statTitle === title
    );
    const values: unknown[] = Array.isArray(group?.values) ? group.values : [];
    return values.flatMap((value) => {
      const row = value as { count?: unknown; title?: unknown };
      const name = cleanText(row?.title);
      const count = Number(row?.count);
      return name && Number.isFinite(count) && count > 0
        ? [{ count, name }]
        : [];
    });
  };

  const locations = stat("Locations").slice(0, TOP_LOCATIONS);
  const schoolCounts = new Map<string, { count: number; name: string }>();
  for (const row of stat("School")) {
    const key = getSchoolKey(row.name) || normalizeName(row.name);
    const current = schoolCounts.get(key);
    schoolCounts.set(key, {
      count: (current?.count ?? 0) + row.count,
      name: current?.name ?? findSchool(row.name)?.en ?? row.name,
    });
  }
  const schools = Array.from(schoolCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, TOP_SCHOOLS)
    .map(([key, school]) => ({
      companyDbId: null,
      count: school.count,
      logoUrl: getSchoolLogoUrl(school.name),
      mine: Boolean(talent?.schoolKeys.has(key)),
      name: school.name,
    }));

  if (!employeeCount && locations.length === 0 && schools.length === 0) {
    return null;
  }
  return { employeeCount: employeeCount || null, locations, schools };
}

type Tx = TransactionSql;

async function loadTalentBackground(
  tx: Tx,
  talentId: string
): Promise<TalentBackground> {
  const [experiences, educations] = await Promise.all([
    tx<{ company_id: string | null; company_name: string | null }[]>`
      SELECT company_id::text AS company_id, company_name
      FROM public.talent_experiences WHERE talent_id = ${talentId}::uuid
    `,
    tx<{ school: string | null }[]>`
      SELECT school FROM public.talent_educations WHERE talent_id = ${talentId}::uuid
    `,
  ]);
  return {
    companyKeys: new Set(
      experiences.map((row) => normalizeName(row.company_name)).filter(Boolean)
    ),
    linkedinCompanyIds: new Set(
      experiences
        .map((row) => cleanText(row.company_id))
        .filter((id) => /^\d+$/.test(id))
    ),
    schoolKeys: new Set(
      educations.map((row) => getSchoolKey(row.school)).filter(Boolean)
    ),
  };
}

async function buildFunding(
  tx: Tx,
  row: {
    crunchbase_information: unknown;
    investors: string | null;
    last_funding_round_description: string | null;
    last_funding_stage: string | null;
    main_investors: string | null;
    total_funding_raised: string | null;
  }
): Promise<CompanyProfileFunding | null> {
  const total = usableFunding(row.total_funding_raised, 24);
  const lastRound = parseLastRound(
    row.last_funding_round_description,
    row.last_funding_stage
  );
  const rounds = parseCrunchbaseRounds(row.crunchbase_information);
  const investorNames = parseInvestorNames(row.main_investors, row.investors);
  if (
    !total &&
    !lastRound &&
    rounds.length === 0 &&
    investorNames.length === 0
  ) {
    return null;
  }

  const keys = investorNames.map((investor) =>
    investor.name.toLocaleLowerCase("en-US")
  );
  const logoRows = keys.length
    ? await tx<
        { key: string; logo: string | null; website_url: string | null }[]
      >`
        SELECT DISTINCT ON (lower(btrim(name))) lower(btrim(name)) AS key, logo, website_url
        FROM public.company_db
        WHERE lower(btrim(name)) = ANY(${keys}::text[])
        ORDER BY lower(btrim(name)), (logo IS NULL), id
      `
    : [];
  const logoByKey = new Map(
    logoRows.map((logoRow) => [
      logoRow.key,
      resolveLogo(logoRow.logo, logoRow.website_url),
    ])
  );

  // The last round from research is newer and has the amount; Crunchbase fills the earlier ones.
  if (lastRound?.date && lastRound.stage) {
    const index = rounds.findIndex(
      (round) => round.stage.toLowerCase() === lastRound.stage?.toLowerCase()
    );
    if (index >= 0) rounds.splice(index, 1);
    rounds.push({ date: lastRound.date, stage: lastRound.stage });
    rounds.sort((a, b) => a.date.localeCompare(b.date));
  }

  return {
    investors: investorNames.map((investor) => ({
      logoUrl: logoByKey.get(investor.name.toLocaleLowerCase("en-US")) ?? null,
      name: investor.name,
      round: investor.round,
    })),
    lastRound,
    rounds,
    total,
  };
}

async function loadPeople(
  tx: Tx,
  companyDbId: number,
  talent: TalentBackground | null
): Promise<CompanyProfilePeople | null> {
  // One member set for every number on the page: the most recent people at this company.
  const memberSql = tx`
    SELECT e.candid_id,
      min(e.start_date) AS joined_at,
      bool_or(e.end_date IS NULL OR e.end_date >= current_date) AS is_current,
      max(e.end_date) AS left_at,
      string_agg(e.role, ' | ') AS roles
    FROM public.experience_user e
    WHERE e.company_id = ${companyDbId}::bigint AND e.candid_id IS NOT NULL
    GROUP BY e.candid_id
    ORDER BY max(COALESCE(e.end_date, current_date)) DESC, min(e.start_date) DESC NULLS LAST
    LIMIT ${MEMBER_LIMIT}
  `;
  const [summary] = await tx<
    {
      average_months: number | null;
      current_count: number;
      departed_count: number;
      engineer_count: number;
      profile_count: number;
    }[]
  >`
    WITH members AS MATERIALIZED (${memberSql})
    SELECT
      count(*)::int AS profile_count,
      count(*) FILTER (WHERE is_current)::int AS current_count,
      count(*) FILTER (WHERE NOT is_current)::int AS departed_count,
      count(*) FILTER (WHERE is_current
        AND roles ~* '(engineer|developer|개발|(^|[^[:alpha:]])ml([^[:alpha:]]|$)|data scien|machine learning|software|devops|backend|frontend|엔지니어)')::int AS engineer_count,
      (SELECT avg(c.total_exp_months)::float FROM members m2 JOIN public.candid c ON c.id = m2.candid_id
        WHERE m2.is_current AND c.total_exp_months > 0) AS average_months
    FROM members
  `;

  if (!summary || Number(summary.profile_count) < MIN_PEOPLE_PROFILES)
    return null;

  type FlowRow = OrgRow & { founder: boolean };
  const [previousRows, nextRows, schoolRows] = await Promise.all([
    tx<OrgRow[]>`
      WITH members AS MATERIALIZED (${memberSql})
      SELECT c.id AS company_db_id, c.name, c.logo, c.website_url,
        c.linkedin_company_id::text AS linkedin_company_id, count(*)::int AS n
      FROM members m
      LEFT JOIN LATERAL (
        SELECT x.company_id FROM public.experience_user x
        JOIN public.company_db c2 ON c2.id = x.company_id
        WHERE x.candid_id = m.candid_id AND x.company_id <> ${companyDbId}::bigint
          AND x.start_date < m.joined_at
          AND c2.name !~* '(university|college|대학교|school|academy|institute of technology)'
        ORDER BY x.start_date DESC LIMIT 1
      ) p ON TRUE
      LEFT JOIN public.company_db c ON c.id = p.company_id
      WHERE m.is_current
      GROUP BY c.id
      ORDER BY count(*) DESC
    `,
    tx<FlowRow[]>`
      WITH members AS MATERIALIZED (${memberSql})
      SELECT c.id AS company_db_id, c.name, c.logo, c.website_url,
        c.linkedin_company_id::text AS linkedin_company_id,
        COALESCE(n.founder, FALSE) AS founder, count(*)::int AS n
      FROM members m
      JOIN LATERAL (
        SELECT x.company_id,
          x.role ~* '(^|[^[:alpha:]])(co[-[:space:]]*)?founders?([^[:alpha:]]|$)|창업|대표' AS founder
        FROM public.experience_user x
        WHERE x.candid_id = m.candid_id AND x.company_id IS DISTINCT FROM ${companyDbId}::bigint
          AND x.start_date >= m.left_at - interval '1 month'
        ORDER BY x.start_date ASC LIMIT 1
      ) n ON TRUE
      LEFT JOIN public.company_db c ON c.id = n.company_id
      WHERE NOT m.is_current
      GROUP BY c.id, COALESCE(n.founder, FALSE)
      ORDER BY count(*) DESC
    `,
    tx<{ school: string; n: number }[]>`
      WITH members AS MATERIALIZED (${memberSql})
      SELECT ed.school, count(DISTINCT ed.candid_id)::int AS n
      FROM members m JOIN public.edu_user ed ON ed.candid_id = m.candid_id
      WHERE ed.school IS NOT NULL AND btrim(ed.school) <> ''
      GROUP BY ed.school
      ORDER BY n DESC
      LIMIT 40
    `,
  ]);

  const isMineCompany = (row: OrgRow) =>
    Boolean(
      talent &&
      ((row.linkedin_company_id &&
        talent.linkedinCompanyIds.has(row.linkedin_company_id)) ||
        talent.companyKeys.has(normalizeName(row.name)))
    );
  const rank = (rows: OrgRow[]) => {
    const known = rows.filter(
      (row) => row.company_db_id !== null && cleanText(row.name)
    );
    // Every place gets its name while they fit; past that, places with one
    // person fold into "그 외" first, then the smallest beyond the top 7.
    const top =
      known.length <= TOP_ORGANIZATIONS
        ? known
        : known
            .filter((row) => Number(row.n) >= 2)
            .slice(0, TOP_ORGANIZATIONS);
    const total = known.reduce((sum, row) => sum + Number(row.n), 0);
    const shown = top.reduce((sum, row) => sum + Number(row.n), 0);
    return { other: total - shown, top: toOrganizations(top, isMineCompany) };
  };
  const previous = rank(previousRows);
  const next = rank(nextRows.filter((row) => !row.founder));

  const schoolCounts = new Map<string, { count: number; name: string }>();
  for (const row of schoolRows) {
    const key = getSchoolKey(row.school);
    if (!key) continue;
    const current = schoolCounts.get(key);
    const name = findSchool(row.school)?.en ?? cleanText(row.school);
    schoolCounts.set(key, {
      count: (current?.count ?? 0) + Number(row.n),
      name: current?.name ?? name,
    });
  }
  const schools = Array.from(schoolCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, TOP_SCHOOLS)
    .map(([key, school]) => ({
      companyDbId: null,
      count: school.count,
      logoUrl: getSchoolLogoUrl(school.name),
      mine: Boolean(talent?.schoolKeys.has(key)),
      name: school.name,
    }));

  const currentCount = Number(summary.current_count);
  return {
    averageYears:
      summary.average_months && summary.average_months > 0
        ? Math.round((summary.average_months / 12) * 10) / 10
        : null,
    currentCount,
    departedCount: Number(summary.departed_count),
    engineerShare:
      currentCount > 0 ? Number(summary.engineer_count) / currentCount : null,
    firstJobCount: previousRows
      .filter((row) => row.company_db_id === null)
      .reduce((sum, row) => sum + Number(row.n), 0),
    next: next.top,
    nextFounded: nextRows
      .filter((row) => row.founder)
      .reduce((sum, row) => sum + Number(row.n), 0),
    nextOther: next.other,
    previous: previous.top,
    previousOther: previous.other,
    profileCount: Number(summary.profile_count),
    schools,
  };
}
