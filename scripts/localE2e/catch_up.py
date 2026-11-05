"""Bring an older local E2E database up to the repo's migrations. Local only.

Usage: .local/full-stack/venv/bin/python scripts/localE2e/catch_up.py [--since YYYYMMDD] [--dry-run]

Each migration from --since (default: 3 days before the schema snapshot) that the
local history does not list runs in its own transaction, in filename order:
- applies cleanly: recorded in local_e2e.migrations like `pnpm local:e2e migrate`;
- fails because its objects already exist: it came with the snapshot; left alone;
- fails for another reason: retried after the others, then reported.
Cron schedules are skipped (the local DB never runs them).

An older file applied now can replace a function or view that a newer file, already
present, defined. Those are put back to their definitions from before this run.
"""
import argparse
import datetime as dt
import hashlib
import re
import sys
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[2]
PRIVATE = ROOT / ".local/full-stack/private"
DEFAULT_DSN = "postgresql://postgres:postgres@127.0.0.1:55432/postgres"
# Errors that mean "this file's objects are already here".
PRESENT = {"42P07", "42710", "42701", "42723", "42P06", "23505"}


def split_sql(text):
    """Top-level statements, respecting quotes, comments and dollar quotes."""
    out, buf, i, n = [], [], 0, len(text)
    while i < n:
        c = text[i]
        if c == "-" and text.startswith("--", i):
            j = text.find("\n", i)
            j = n if j < 0 else j
            buf.append(text[i:j]); i = j; continue
        if c == "/" and text.startswith("/*", i):
            depth, j = 1, i + 2
            while j < n and depth:
                if text.startswith("/*", j): depth += 1; j += 2
                elif text.startswith("*/", j): depth -= 1; j += 2
                else: j += 1
            buf.append(text[i:j]); i = j; continue
        if c in ("'", '"'):
            escape = c == "'" and i > 0 and text[i - 1] in "eE" and (i < 2 or not (text[i - 2].isalnum() or text[i - 2] == "_"))
            j = i + 1
            while j < n:
                if escape and text[j] == "\\": j += 2; continue
                if text[j] == c:
                    if j + 1 < n and text[j + 1] == c: j += 2; continue
                    break
                j += 1
            buf.append(text[i:j + 1]); i = j + 1; continue
        if c == "$":
            m = re.match(r"\$([A-Za-z_][A-Za-z0-9_]*)?\$", text[i:])
            if m and not (i > 0 and (text[i - 1].isalnum() or text[i - 1] == "_")):
                tag = m.group(0)
                j = text.find(tag, i + len(tag))
                j = n if j < 0 else j + len(tag)
                buf.append(text[i:j]); i = j; continue
        if c == ";":
            out.append("".join(buf)); buf = []; i += 1; continue
        buf.append(c); i += 1
    out.append("".join(buf))
    return [s for s in out if re.sub(r"--[^\n]*|/\*.*?\*/", "", s, flags=re.S).strip()]


def code(stmt):
    return re.sub(r"--[^\n]*|/\*.*?\*/", " ", stmt, flags=re.S).strip()


def prepared(stmt):
    """None to skip; otherwise the statement to run inside a transaction."""
    body = code(stmt).lower()
    if re.fullmatch(r"(begin|commit|start transaction|end)( (work|transaction))?", body):
        return None
    if re.match(r"select\b", body) and re.search(r"\bcron\s*\.\s*(schedule|unschedule|alter_job)\b", body):
        return None
    return re.sub(r"(?i)\bconcurrently\b", "", stmt)


NAME = r'(?:public\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?'
FUNC_RE = re.compile(r"(?is)^create\s+(?:or\s+replace\s+)?(?:function|procedure)\s+" + NAME + r"\s*\(")
VIEW_RE = re.compile(r"(?is)^create\s+(?:or\s+replace\s+)?view\s+" + NAME + r"\b")
DROP_FUNC_RE = re.compile(r"(?is)^drop\s+(?:function|procedure)\s+(?:if\s+exists\s+)?" + NAME)


def defined(statements):
    funcs, views = set(), set()
    for s in statements:
        body = code(s)
        if m := FUNC_RE.match(body) or DROP_FUNC_RE.match(body): funcs.add(m.group(1).lower())
        if m := VIEW_RE.match(body): views.add(m.group(1).lower())
    return funcs, views


def snapshot(cur):
    cur.execute("""select p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
                   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.prokind in ('f','p')
                     and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')""")
    funcs = {}
    for name, args, definition in cur.fetchall():
        funcs.setdefault(name, {})[args] = definition
    cur.execute("select viewname, definition from pg_views where schemaname='public'")
    return funcs, dict(cur.fetchall())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--dsn", default=DEFAULT_DSN)
    ap.add_argument("--migrations", default=str(ROOT / "supabase/migrations"))
    a = ap.parse_args()
    if not re.match(r"postgresql://[^@]+@(127\.0\.0\.1|localhost)[:/]", a.dsn):
        raise SystemExit("Local databases only")
    dump = PRIVATE / "public-schema.dump"
    since = a.since or (
        (dt.datetime.fromtimestamp(dump.stat().st_mtime, dt.timezone.utc) - dt.timedelta(days=3)).strftime("%Y%m%d")
        if dump.exists() else "20261001")
    files = sorted(p for p in Path(a.migrations).glob("*.sql"))
    texts = {p.name: p.read_text() for p in files}
    statements = {name: split_sql(text) for name, text in texts.items()}

    conn = psycopg.connect(a.dsn)
    cur = conn.cursor()
    cur.execute("select id from local_e2e.environment")
    if cur.fetchall() != [("harper-local-e2e",)]:
        raise SystemExit("Local database marker missing")
    cur.execute("create table if not exists local_e2e.migrations(name text primary key,sha256 text not null,applied_at timestamptz not null default now())")
    cur.execute("select name from local_e2e.migrations")
    history = {r[0] for r in cur.fetchall()}
    before_funcs, before_views = snapshot(cur)
    conn.commit()

    todo = [p.name for p in files if p.name[:8] >= since and p.name not in history]
    taken = dt.datetime.fromtimestamp(dump.stat().st_mtime, dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC") if dump.exists() else "unknown"
    print(f"Schema snapshot taken {taken}; checking files from {since}: {len(todo)} not in local history")
    applied, present, failed = [], [], {}
    for attempt in range(3):
        pending = [n for n in todo if n not in applied and n not in present]
        if not pending:
            break
        progress = False
        for name in pending:
            try:
                for stmt in statements[name]:
                    if (run := prepared(stmt)) is not None:
                        cur.execute(run)
                if a.dry_run:
                    conn.rollback()
                else:
                    cur.execute("insert into local_e2e.migrations(name,sha256) values (%s,%s) on conflict (name) do nothing",
                                (name, hashlib.sha256(texts[name].encode()).hexdigest()))
                    conn.commit()
                applied.append(name); failed.pop(name, None); progress = True
            except psycopg.Error as error:
                conn.rollback()
                if error.sqlstate in PRESENT:
                    present.append(name); failed.pop(name, None)
                else:
                    failed[name] = str(error).splitlines()[0]
        if not progress:
            break

    # Put back functions and views whose newest definition was already present.
    restored, restore_failed = [], []
    if applied and not a.dry_run:
        latest = {}
        for name in sorted(texts):
            funcs, views = defined(statements[name])
            for f in funcs: latest[("f", f)] = name
            for v in views: latest[("v", v)] = name
        touched = set()
        for name in applied:
            funcs, views = defined(statements[name])
            touched |= {("f", f) for f in funcs} | {("v", v) for v in views}
        after_funcs, after_views = snapshot(cur)
        conn.commit()
        for kind, obj in sorted(touched):
            if latest.get((kind, obj)) in applied:
                continue
            try:
                if kind == "f":
                    old, new = before_funcs.get(obj, {}), after_funcs.get(obj, {})
                    if old == new:
                        continue
                    for args in new:
                        if args not in old:
                            cur.execute(f'drop function public."{obj}"({args})')
                    for args, definition in old.items():
                        if new.get(args) != definition:
                            try:
                                cur.execute("savepoint r"); cur.execute(definition); cur.execute("release savepoint r")
                            except psycopg.errors.InvalidFunctionDefinition:
                                cur.execute("rollback to savepoint r")
                                cur.execute(f'drop function public."{obj}"({args})'); cur.execute(definition)
                else:
                    if obj not in before_views or before_views[obj] == after_views.get(obj):
                        continue
                    cur.execute(f'create or replace view public."{obj}" as {before_views[obj]}')
                conn.commit(); restored.append(obj)
            except psycopg.Error as error:
                conn.rollback(); restore_failed.append(f"{obj}: {str(error).splitlines()[0]}")
    cur.execute("notify pgrst, 'reload schema'"); conn.commit()

    print(f"{'Would apply' if a.dry_run else 'Applied'} {len(applied)}:", *applied, sep="\n  ")
    print(f"Already in the snapshot: {len(present)}")
    if restored: print("Restored to their newer definitions:", ", ".join(restored))
    for item in restore_failed: print("Could not restore", item)
    for name, message in failed.items(): print(f"FAILED {name}: {message}")
    sys.exit(1 if failed or restore_failed else 0)


if __name__ == "__main__":
    main()
