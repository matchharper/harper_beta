import postgres from "postgres";
import { saveTimedCareerCheckpoint } from "../src/lib/career/devTimedCheckpoint.server";

async function main() {
  const [id, email, time] = process.argv.slice(2);
  const databaseUrl = process.env.CAREER_CHECKPOINT_RECOVERY_DATABASE_URL;
  if (!id || !email || !time || !databaseUrl) {
    throw new Error("Specify the account UUID, email and UTC ISO recovery time, and set CAREER_CHECKPOINT_RECOVERY_DATABASE_URL.");
  }
  const source = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 10 });
  try {
    const saved = await saveTimedCareerCheckpoint({ id, email }, source, time);
    console.log(saved);
  } finally {
    await source.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
