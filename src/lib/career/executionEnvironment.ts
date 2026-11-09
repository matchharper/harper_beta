import { createHash } from "node:crypto";
import { hostname } from "node:os";

/** A transport ownership boundary, not a model-selected routing hint. */
export function careerExecutionEnvironment(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === "development") return `development:${createHash("sha256").update(`${hostname()}:${process.cwd()}`).digest("hex").slice(0,20)}`;
  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview") return `preview:${env.VERCEL_PROJECT_ID ?? "harper"}:${env.VERCEL_GIT_COMMIT_REF ?? env.VERCEL_DEPLOYMENT_ID ?? env.VERCEL_URL ?? hostname()}`;
  return "production";
}
export function ownsCareerExecution(environment: unknown) {
  return (typeof environment === "string" ? environment : "production") === careerExecutionEnvironment();
}
