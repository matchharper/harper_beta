"""Explicit read-only source capture. Never used by the runtime launcher."""
import os
from pathlib import Path
import subprocess
import re
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT.parent / "harper_worker"
from dotenv import load_dotenv
for path in (WORKER / "worker.env", ROOT / ".env.local", ROOT / ".vercel/.env.local-slack"):
    load_dotenv(path, override=False)
if not (os.environ.get("OPPORTUNITY_DATABASE_URL") or os.environ.get("DATABASE_URL")):
    host = os.environ.get("COMPANY_MATCHING_DB_ENV_SSH_HOST", "")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,252}", host):
        raise SystemExit("No read-only schema source configured")
    result = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", host,
        "set -a; . /home/ec2-user/worker.env >/dev/null 2>&1; printf '%s' \"${OPPORTUNITY_DATABASE_URL:-${DATABASE_URL:-}}\""],
        capture_output=True, text=True, check=True, timeout=15)
    os.environ["OPPORTUNITY_DATABASE_URL"] = result.stdout.strip()
url = urlparse(os.environ.get("OPPORTUNITY_DATABASE_URL") or os.environ.get("DATABASE_URL") or "")
if not url.hostname:
    raise SystemExit("No read-only schema source configured")
target = ROOT / ".local/full-stack/private/public-schema.dump"
target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
os.umask(0o077)
env = {"PATH": os.environ["PATH"], "PGHOST": url.hostname, "PGPORT": str(url.port or 5432),
       "PGUSER": unquote(url.username or ""), "PGPASSWORD": unquote(url.password or ""),
       "PGDATABASE": url.path.lstrip("/"), "PGSSLMODE": "require",
       "PGOPTIONS": "-c default_transaction_read_only=on"}
temporary = target.with_suffix(".tmp")
subprocess.run(["pg_dump", "--schema-only", "--schema=public", "--no-owner", "--format=custom", "--file", str(temporary)], env=env, check=True, timeout=180)
temporary.replace(target)
print("Captured schema only; no production data or writes.")
