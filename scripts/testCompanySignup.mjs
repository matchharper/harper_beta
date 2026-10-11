// Uses only the existing isolated local stack; never connects to production.
import { stackEnv, root } from "./localE2e/env.mjs";
import { execFileSync } from "node:child_process";
const { env } = stackEnv();
execFileSync(
  `${root}/.local/full-stack/venv/bin/python`,
  [`${root}/scripts/localE2e/companySignup.py`],
  { env, stdio: "inherit", cwd: root }
);
