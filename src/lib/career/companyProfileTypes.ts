/** Company facts shown on a Career opportunity and on the company page. Safe to import in the browser. */

export type CompanyProfileHeadcountMonth = {
  /** YYYY-MM */
  month: string;
  members: number;
  hires: number | null;
  leaves: number | null;
};

export type CompanyProfileOrganization = {
  companyDbId: number | null;
  count: number;
  logoUrl: string | null;
  /** The talent worked or studied here. */
  mine: boolean;
  name: string;
};

export type CompanyProfileFundingRound = {
  /** YYYY-MM */
  date: string;
  stage: string;
};

export type CompanyProfileInvestor = {
  logoUrl: string | null;
  name: string;
  round: string | null;
};

export type CompanyProfileFunding = {
  investors: CompanyProfileInvestor[];
  lastRound: {
    amount: string | null;
    /** YYYY-MM */
    date: string | null;
    stage: string | null;
  } | null;
  rounds: CompanyProfileFundingRound[];
  total: string | null;
};

export type CompanyProfilePeople = {
  averageYears: number | null;
  currentCount: number;
  departedCount: number;
  engineerShare: number | null;
  firstJobCount: number;
  next: CompanyProfileOrganization[];
  nextFounded: number;
  nextOther: number;
  previous: CompanyProfileOrganization[];
  previousOther: number;
  profileCount: number;
  schools: CompanyProfileOrganization[];
};

export type CompanyProfileLocation = {
  count: number;
  name: string;
};

/** What the company's LinkedIn page reports about everyone who lists it (harvestapi). */
export type CompanyProfileLinkedIn = {
  employeeCount: number | null;
  locations: CompanyProfileLocation[];
  schools: CompanyProfileOrganization[];
};

export type CompanyProfile = {
  companyDbId: number;
  funding: CompanyProfileFunding | null;
  headcount: CompanyProfileHeadcountMonth[];
  hiring: { active: number; recent: number };
  linkedin: CompanyProfileLinkedIn | null;
  people: CompanyProfilePeople | null;
};

/** The months the headcount line and numbers are drawn from: at least six months, ten or more people last month. */
export function getReliableHeadcount(months: readonly CompanyProfileHeadcountMonth[]) {
  const last = months.at(-1);
  if (months.length < 6 || !last || last.members < 10) return null;
  const first = months[0];
  const hires = months.slice(1).map((month) => month.hires);
  const leaves = months.slice(1).map((month) => month.leaves);
  const sum = (values: Array<number | null>) =>
    values.some((value) => value === null)
      ? null
      : values.reduce<number>((total, value) => total + (value ?? 0), 0);
  return {
    current: last.members,
    change: last.members - first.members,
    changeRate:
      first.members > 0 ? (last.members - first.members) / first.members : null,
    firstMonth: first.month,
    hires: sum(hires),
    lastMonth: last.month,
    leaves: sum(leaves),
    monthCount: months.length,
  };
}

/** Drops a month 50% above or below both neighbours (a one-month filing glitch such as 3, 52, 5). */
export function smoothHeadcountMonths(
  months: readonly CompanyProfileHeadcountMonth[]
) {
  return months.filter((month, index) => {
    const prev = months[index - 1];
    const next = months[index + 1];
    if (!prev || !next) return true;
    const spike = (neighbour: number) =>
      neighbour > 0 &&
      (month.members > neighbour * 1.5 || month.members < neighbour * 0.5);
    return !(spike(prev.members) && spike(next.members));
  });
}
