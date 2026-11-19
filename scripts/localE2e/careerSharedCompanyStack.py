"""Run the shared-company model test against a disposable copy of the local Supabase schema."""

import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import argparse
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen
from time import monotonic, sleep
from uuid import uuid4


def main():
    options = argparse.ArgumentParser(description=__doc__)
    options.add_argument("--browser", action="store_true", help="Submit two independent requests through the Career website")
    options.add_argument("--natural", action="store_true", help="Use the browser's ordinary questions when testing the model directly")
    args = options.parse_args()
    root = Path(__file__).resolve().parents[2]
    os.chdir(root)
    runtime = root / ".local/full-stack"
    socket = f"unix://{Path.home()}/.colima/harper-e2e/docker.sock"
    docker = ["docker", "--host", socket]
    sql = docker + ["exec", "-i", "supabase_db_harper-local-e2e"]
    name = f"company_e2e_{uuid4().hex}"
    status = subprocess.check_output(
        ["node_modules/.bin/supabase", "status", "--workdir", str(runtime), "--output", "json"],
        env={**os.environ, "DOCKER_HOST": socket, "DOCKER_CONFIG": str(runtime / "docker")},
        stderr=subprocess.DEVNULL,
    )
    key = json.loads(status)["SERVICE_ROLE_KEY"]
    rest = json.loads(subprocess.check_output(docker + ["inspect", "supabase_rest_harper-local-e2e"]))[0]
    subprocess.run(sql + ["createdb", "-U", "supabase_admin", "--template=template0", name], check=True)
    started = False
    try:
        schema = subprocess.check_output(sql + [
            "pg_dump", "-U", "supabase_admin", "-d", "postgres", "--schema-only", "--no-publications", "--no-subscriptions", "-Fc",
        ])
        subprocess.run(sql + ["pg_restore", "-U", "supabase_admin", "--exit-on-error", "--single-transaction", "-d", name],
                       input=schema, check=True)
        psql = sql + ["psql", "-U", "postgres", "-d", name, "-Atq", "-v", "ON_ERROR_STOP=1"]
        # The workspace-hub migration removes objects the earlier indicators look for,
        # so once it is installed the earlier steps are complete.
        hub = "to_regprocedure('public.career_company_home_v1(uuid)')"
        hub_installed = subprocess.check_output(psql + ["-c", f"select {hub} is not null"], text=True).strip() == "t"
        for filename, indicator in [] if hub_installed else [
            ("20261117122500_career_company_workspace_marker.sql", "to_regprocedure('public.career_company_url_key_v1(text)')"),
            ("20261117122700_career_company_unique_home.sql", "to_regclass('public.company_public_data_home')"),
            ("20261117123000_career_public_company_datas.sql", "to_regclass('public.company_datas')"),
            ("20261117123300_career_company_resource_details.sql", "to_regclass('public.career_company_summary_leases')"),
            ("20261117123500_career_company_tool_writers.sql", "to_regprocedure('public.career_write_employer_datum_v1(uuid,jsonb,text,text,jsonb,jsonb,uuid)')"),
            ("20261117124000_career_company_data_integrity.sql", "to_regprocedure('public.career_require_public_company_home_v1()')"),
            ("20261117124500_career_company_topic_evidence.sql", "to_regprocedure('public.career_read_company_topic_evidence_v1(bigint[],text,integer,integer,boolean)')"),
            ("20261117160000_career_company_workspace_hub.sql", hub),
        ]:
            installed = subprocess.check_output(psql + ["-c", f"select {indicator} is not null"], text=True).strip()
            if installed != "t":
                migration = root / "supabase/migrations" / filename
                subprocess.run(psql + ["--single-transaction", "-f", "-"], input=migration.read_text(), text=True, check=True)
        subprocess.run(psql, input="create function public.company_research_testing_database() returns text language sql stable as $$ select current_database()::text $$;", text=True, check=True)
        env = dict(item.split("=", 1) for item in rest["Config"]["Env"] if item.startswith("PGRST_"))
        connection = urlsplit(env["PGRST_DB_URI"])
        assert connection.hostname == "supabase_db_harper-local-e2e", "Expected the local Supabase DB container"
        env["PGRST_DB_URI"] = urlunsplit(connection._replace(path="/" + name))
        with tempfile.NamedTemporaryFile("w") as config:
            for k, v in env.items():
                config.write(f"{k}={v}\n")
            config.flush()
            subprocess.run(docker + ["run", "-d", "--name", name, "--network", "supabase_network_harper-local-e2e",
                           "--publish", "127.0.0.1::3000", "--env-file", config.name, rest["Config"]["Image"]],
                           check=True, stdout=subprocess.DEVNULL)
        started = True
        address = subprocess.check_output(docker + ["port", name, "3000/tcp"], text=True).strip()
        assert re.fullmatch(r"127\.0\.0\.1:\d+", address)
        local = "http://" + address
        deadline = monotonic() + 60
        while True:
            try:
                check = Request(local + "/rpc/company_research_testing_database", headers={"Authorization": f"Bearer {key}"})
                with urlopen(check, timeout=5) as response:
                    assert json.load(response) == name
                    break
            except OSError:
                if monotonic() >= deadline:
                    raise
                sleep(0.25)
        run_env = {**os.environ, "HARPER_COMPANY_E2E_REST": local, "HARPER_COMPANY_E2E_DB": name}
        if args.browser:
            command = ["node", "scripts/localE2e/careerSharedCompanyBrowser.mjs"]
        else:
            command = ["pnpm", "exec", "tsx", "--tsconfig", "scripts/tsconfig.json", "scripts/localE2e/careerSharedCompanyResearch.mts"]
            if args.natural:
                command.append("--natural")
            run_env.update(NODE_OPTIONS="--conditions=react-server", NODE_PATH="./node_modules/next/dist/compiled",
                           HARPER_COMPANY_E2E_TOKEN=key)
        subprocess.run(command, env=run_env, check=True)
    finally:
        if started:
            subprocess.run(docker + ["rm", "-f", name], check=True, stdout=subprocess.DEVNULL)
        subprocess.run(sql + ["dropdb", "-U", "supabase_admin", "--force", name], check=True)


if __name__ == "__main__":
    main()
