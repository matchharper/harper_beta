import type { ExternalCandidateView } from "@/lib/org/agent/externalSourcing";
import type { OrgBoardItem, OrgBoardProfileLabel } from "@/lib/org/server";
import type { OrgTalentProfileContentProps } from "./OrgTalentProfile";

// External people are not Harper members: these adapters only reshape the company-safe
// projection from GET /api/org/external-candidates for the shared card and profile body.
// No action, contact detail or member identity is invented.

function yearMonth(value: string | null) {
  const match = value?.match(/^(\d{4})(?:-(\d{2}))?/);
  if (!match) return null;
  return match[2] ? `${match[1]}.${match[2]}` : match[1];
}

/** Same period text as member cards: '2021.03 - 현재'. */
function period(start: string | null, end: string | null) {
  const from = yearMonth(start);
  const to = yearMonth(end);
  if (from && to) return `${from} - ${to}`;
  if (from) return `${from} - 현재`;
  return to ? `- ${to}` : null;
}

function criteriaEvaluations(person: ExternalCandidateView) {
  return person.criteria.map((item) => ({ name: item.name, fitness: item.fitness, content: item.content }));
}

/** Send Intro: an address was found and nothing was requested yet. Pass applies to every shown person. */
export function externalCandidateCanSendIntro(person: ExternalCandidateView) {
  return !person.intro && !person.companyDecision && person.contact === "found";
}

/** No request and no address: no buttons, the card says the email was not found. */
export function externalCandidateWithoutEmail(person: ExternalCandidateView) {
  return !person.intro && person.contact !== "found";
}

export function externalBoardItem(person: ExternalCandidateView, roleId: string): OrgBoardItem {
  const id = `external:${person.id}`;
  // Every shown person uses the decision card of a suggested member: Pass always, Send Intro only when
  // externalCandidateCanSendIntro (the card hides it otherwise).
  const recentCompanies = person.experiences.flatMap((item): OrgBoardProfileLabel[] => {
    const label = item.company ?? item.role;
    return label ? [{ label, detail: item.role, logoUrl: null, period: period(item.start, item.end) }] : [];
  });
  const recentSchools = person.educations.flatMap((item): OrgBoardProfileLabel[] =>
    item.school ? [{ label: item.school, detail: item.degree, logoUrl: null, period: period(item.start, item.end) }] : []);
  return {
    capabilities: { contactCandidate: false, moveStage: false, pass: false, requestIntro: false, scheduleInterview: false, viewResume: false },
    companyIntro: { id, status: "ready", candidateSentAt: null, companyAppeal: null, nextStageId: null, requestedAt: null, selectionReason: "" },
    criteriaEvaluations: criteriaEvaluations(person),
    createdAt: person.shownAt,
    fitReasons: [],
    fitSummary: null,
    processClosureNoticeUnresolved: false,
    recommendationId: id,
    recommendedAt: person.shownAt,
    roleId,
    roleName: null,
    source: "company_intro",
    stage: "company_intro",
    stageTag: null,
    talent: {
      email: null, headline: person.headline, location: person.location, name: person.name,
      profilePicture: null, recentCompanies, recentSchools, userId: id,
    },
    talentId: id,
    upcomingMeeting: null,
    updatedAt: person.shownAt,
  };
}

export function externalProfileDetail(person: ExternalCandidateView): OrgTalentProfileContentProps["detail"] {
  const evaluations = criteriaEvaluations(person);
  const links = [...new Set([person.linkedinUrl, ...person.evidence.map((item) => item.url)].filter((link): link is string => Boolean(link)))];
  return {
    talent: {
      userId: `external:${person.id}`, name: person.name, bio: null, email: null, profilePicture: null,
      headline: person.headline ?? ([person.experiences[0]?.role, person.currentCompany].filter(Boolean).join(" at ") || null),
    },
    profile: {
      bio: null,
      location: person.location,
      experiences: person.experiences.map((item) => ({
        companyName: item.company, role: item.role, startDate: item.start, endDate: item.end,
        description: null, companyLogo: null, companyLocation: null, employmentType: null, memo: null,
      })),
      educations: person.educations.map((item) => ({
        school: item.school, degree: item.degree, field: null, startDate: item.start, endDate: item.end,
        description: null, memo: null, url: null,
      })),
      extras: [],
      documents: [],
      registeredLinks: links,
    },
    profileMarkdown: "",
    resume: { fileName: null, hasStorageFile: false, links: [] },
    criteriaEvaluations: evaluations,
    companyPresentation: { tldr: person.reason, harperNote: "", finalFit: null, criteriaEvaluations: evaluations },
  };
}
