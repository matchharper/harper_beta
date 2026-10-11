import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import type { AutoIntroToCompanyCandidateDossiers } from "@/lib/ops/autoIntroToCompanyNotifications";

dotenv.config({ path: ".env.local", quiet: true });
type Group = AutoIntroToCompanyCandidateDossiers["groups"][number];
const hash = (data: string) => createHash("sha256").update(data).digest("hex");
async function main() {
  const registry = path.resolve("docs/evaluation/company-candidate-introduction");
  const fixtureText = await fs.readFile(path.join(registry, "presentation-cases-v1.json"), "utf8");
  const dataset = JSON.parse(fixtureText);
  const runId = `presentation-${new Date().toISOString().replaceAll(":", "-")}`;
  const destination = path.join(registry, "runs", runId);
  await fs.mkdir(destination, { recursive: true, mode: 0o700 });
  const { generateAutoIntroWorkspaceMessage } = await import("@/lib/ops/autoIntroToCompanyLlm");
  const { buildAutoIntroLlmInput } = await import("@/lib/ops/autoIntroToCompanyLlmPrompt");
  const sourcePaths = ["src/lib/ops/autoIntroToCompanyLlm.ts", "src/lib/ops/autoIntroToCompanyLlmPrompt.ts", "src/lib/ops/autoIntroToCompanyNotifications.ts", "src/lib/ops/autoIntroToCompanyPromptContext.ts", "src/lib/companyFirstSearch/presentation.ts"];
  const runtimeHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async file => [file, hash(await fs.readFile(file, "utf8"))])));
  const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], {encoding:"utf8"}).trim();
  const dirtyDiffHash = hash(execFileSync("git", ["diff", "--", ...sourcePaths], {encoding:"utf8"}));
  const results = [];
  for (const item of dataset.cases) {
    const group: Group = {
      candidateCount: 1, companyName: "Synthetic billing product", workspaceId: "synthetic-workspace",
      workspaceLocale: item.locale, slackConnected: false,
      companyContext: { companyName: "Synthetic billing product", companyInformation: "B2B billing software for small businesses. Synthetic evaluation; no web research is useful.", employeeCount: null, hiringRequest: null, location: item.locale === "ko" ? "South Korea" : "United States", specialities: null, workspaceMemory: null },
      roles: [{ roleId: "synthetic-role", roleTitle: item.roleName, candidateCount: 1, candidates: [{
        name: "Synthetic candidate", talentId: "synthetic-talent", reasonMode: "author", storedCompanyCriteriaEvaluations: null, storedReevaluationCriteria: null, storedReason: null,
        professionalProfile: { bio: item.experience, currentLocation: null, location: null, headline: item.headline, educations: [], extras: null, insights: null, resumeLinks: [], engagementTypes: [],
          experiences: [{company_name: "Synthetic prior employer",company_link:null,company_location:null,role:item.headline,employment_type:null,start_date:"2020-01-01",end_date:null,months:null,description:item.experience,memo:null}] },
      }] }],
      workspaceRoles: [{ roleId:"synthetic-role", name:item.roleName, description:item.description, descriptionSummary:null, criteria:item.criteria, employmentTypes:[],location:null,memory:null,request:null,salaryRange:null,seniority:null,workMode:null }],
    };
    const traces: unknown[] = [];
    const started = Date.now();
    try {
      const output = await generateAutoIntroWorkspaceMessage(group, { logUsage:false, source:"synthetic_matching_presentation_eval", onTrace:event=>{traces.push(event);} });
      const report = output.message.roles[0]?.candidates[0]?.companyPresentation;
      const passed = Boolean(report) && Object.entries(item.expectedFitness).every(([name, allowed]) =>
        (allowed as string[]).includes(report!.criteriaEvaluations.find(row=>row.name===name)?.fitness ?? ""));
      results.push({caseId:item.id,passed,elapsedMs:Date.now()-started,model:output.model,promptHash:hash(JSON.stringify(buildAutoIntroLlmInput(group)))});
      await fs.writeFile(path.join(destination, `${item.id}.json`),JSON.stringify({group,output,traces},null,2),{mode:0o600,flag:"wx"});
    } catch(error) {
      results.push({caseId:item.id,passed:false,error:String(error),elapsedMs:Date.now()-started});
      await fs.writeFile(path.join(destination, `${item.id}.json`),JSON.stringify({traces,error:String(error)},null,2),{mode:0o600,flag:"wx"});
    }
  }
  const manifest={task:"company-candidate-introduction",datasetVersion:dataset.version,runId,createdAt:new Date().toISOString(),fixtureHash:hash(fixtureText),sourceRevision,dirtyDiffHash,runtimeHashes,productionWrites:false,delivery:false,qualitativeReview:"pending",results};
  await fs.writeFile(path.join(destination,"manifest.json"),JSON.stringify(manifest,null,2),{mode:0o600,flag:"wx"});
  process.stdout.write(JSON.stringify({runId,results})+"\n");
  if(results.some(item=>!item.passed)) process.exitCode=1;
}
main().catch(error=>{process.stderr.write(String(error)+"\n");process.exitCode=1;});
