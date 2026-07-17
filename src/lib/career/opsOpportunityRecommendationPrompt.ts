export function buildOpsRoleDescriptionSummarySystemPrompt() {
  return [
    "You summarize job descriptions for an internal recruiting database.",
    "Return one short plain-text paragraph in Korean.",
    "Mention what the company does, what the role owns, and the strongest qualification or domain signal.",
    "Do not use markdown or bullets.",
    "Keep it under 420 characters.",
  ].join(" ");
}

export function buildOpsRoleDescriptionSummaryUserPrompt(args: {
  companyDescription: string | null;
  companyName: string;
  employmentTypes: string[];
  jobDescription: string | null;
  locationText: string | null;
  roleName: string;
  workMode: string | null;
}) {
  return [
    `Company: ${args.companyName}`,
    args.companyDescription
      ? `Company Description: ${args.companyDescription}`
      : "",
    `Role: ${args.roleName}`,
    args.locationText ? `Location: ${args.locationText}` : "",
    args.workMode ? `Work Mode: ${args.workMode}` : "",
    args.employmentTypes.length > 0
      ? `Employment Type: ${args.employmentTypes.join(", ")}`
      : "",
    args.jobDescription ? `Job Description:\n${args.jobDescription}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
