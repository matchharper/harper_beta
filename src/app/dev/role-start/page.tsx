import { notFound } from "next/navigation";
import { buildCandidateDigestEmail } from "@/lib/companyFirstSearch/candidateDigestEmail";
import RoleStartPreview from "./RoleStartPreview";
import { createFixtures, WORKSPACE_ID } from "./fixtures";

export const metadata = {
  title: "Harper · 채용 시작 프리뷰",
  robots: { index: false, follow: false },
};

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  const { role, response } = createFixtures();
  const candidates = response.session!.firstCandidates;
  const webUrl = (id: string) => `https://example.invalid/preview/${id}`;
  const email = buildCandidateDigestEmail({
    locale: "ko",
    recipientName: "김지수",
    roleNames: [role.name],
    workspaceId: WORKSPACE_ID,
    sections: [
      {
        kind: "accepted_connection",
        parts: [
          {
            candidateId: candidates[0].talentId,
            text: `**[${candidates[0].name}](${webUrl(candidates[0].talentId)})**\n\n${candidates[0].verdict!.tldr}`,
          },
        ],
      },
      {
        kind: "company_first",
        parts: candidates
          .slice(1)
          .map((candidate) => ({
            candidateId: candidate.talentId,
            text: `**[${candidate.name}](${webUrl(candidate.talentId)})**\n\n${candidate.verdict!.tldr}`,
          })),
      },
    ],
    candidates: candidates.map((candidate) => ({
      id: candidate.talentId,
      webUrl: webUrl(candidate.talentId),
      criteria: candidate.verdict!.criteria.map((item) => ({
        name: item.name,
        fitness: item.fitness,
      })),
      actionUrls: {
        accept_connection: "#preview-accept",
        reject_connection: "#preview-reject",
        request_intro: "#preview-intro",
        pass: "#preview-pass",
      },
    })),
  });
  return (
    <RoleStartPreview email={{ subject: email.subject, html: email.html }} />
  );
}
