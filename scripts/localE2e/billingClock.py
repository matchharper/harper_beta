"""Stripe clock assertions against the isolated local DB. Never changes production.

Stripe's clock does not move PostgreSQL time. Assertions temporarily substitute
the SQL wall clock inside a transaction and ALWAYS roll back function definitions
and simulated debits. The invoice/period facts come from real Stripe webhooks.
"""
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from urllib.parse import urlparse
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

payload = json.load(sys.stdin)
url = os.environ["DATABASE_URL"]
assert urlparse(url).hostname in ("localhost", "127.0.0.1")
assert os.environ.get("HARPER_LOCAL_E2E") == "1"
conn = psycopg.connect(url, row_factory=dict_row)
cur = conn.cursor()
cur.execute("select id from local_e2e.environment")
assert cur.fetchall() == [{"id": "harper-local-e2e"}]
cur.execute("select to_regclass('cron.job') cron")
if cur.fetchone()["cron"]:
    cur.execute("select count(*) n from cron.job")
    assert cur.fetchone()["n"] == 0
workspace = payload["workspace"]
command = payload["command"]

def scalar(sql, args=()):
    cur.execute(sql, args)
    return next(iter(cur.fetchone().values()))

def summary():
    return scalar("select public.workspace_billing_summary_v2(%s)", (workspace,))

def at(value):
    cur.execute("select set_config('harper_billing_test.now',%s,true)", (value,))

try:
    if command == "seed":
        cur.execute("insert into company_workspace(company_workspace_id,company_name,is_internal,billing_started_at,billing_free_anchor_at,stripe_customer_id) values (%s,%s,true,now(),%s,%s)",
                    (workspace,"Billing clock · " + payload["name"],payload["at"],payload["customer"]))
        conn.commit()
        print(json.dumps({"seeded": True}))
    elif command == "inspect":
        cur.execute("select stripe_subscription_id,status,current_period_end,cancel_at,ended_at,id from company_workspace_slots where company_workspace_id=%s", (workspace,))
        slots = cur.fetchall()
        cur.execute("select p.id,p.slot_id,p.stripe_invoice_id,p.starts_at,p.ends_at,p.remaining,p.confirmed_at from company_workspace_credit_periods p where p.company_workspace_id=%s and p.slot_id is not null order by p.starts_at", (workspace,))
        print(json.dumps({"slots": slots,"periods": cur.fetchall()}, default=str))
    elif command == "concurrency":
        assert scalar("select company_name from company_workspace where company_workspace_id=%s", (workspace,)).startswith("Billing clock · ")
        role = str(uuid4())
        cur.execute("select p.id,p.remaining from company_workspace_credit_periods p join company_workspace_slots a on a.id=p.slot_id where p.company_workspace_id=%s and p.starts_at<=now() and p.ends_at>now() and workspace_billing_slot_active_v1(a,now()) order by p.ends_at", (workspace,))
        periods = cur.fetchall()
        assert periods, "A current paid period is required"
        try:
            cur.execute("insert into company_roles(role_id,company_workspace_id,name,source_type,status,information) values (%s,%s,'Billing concurrency fixture','internal','active',%s)", (role,workspace,Jsonb({"testOnly":True,"testFixture":"stripe-billing-concurrency"})))
            scalar("select workspace_billing_summary_v2(%s)", (workspace,))
            assigned_period = scalar("select p.id from company_workspace_credit_periods p join company_workspace_slots a on a.id=p.slot_id where a.assigned_role_id=%s and p.starts_at<=now() and p.ends_at>now() and p.confirmed_at<=now() order by p.ends_at limit 1", (role,))
            assert assigned_period
            cur.execute("update company_workspace_credit_periods set remaining=1 where id=%s", (assigned_period,))
            cur.execute("select id,remaining from company_workspace_credit_periods where company_workspace_id=%s and slot_id is null",(workspace,))
            shared_periods = cur.fetchall()
            cur.execute("update company_workspace_credit_periods set remaining=0 where company_workspace_id=%s and slot_id is null",(workspace,))
            conn.commit()
            barrier = Barrier(2)
            def debit(_):
                try:
                    with psycopg.connect(url) as other:
                        barrier.wait(timeout=10)
                        other.execute("select workspace_billing_debit_v1(%s,'intro_request',%s,%s,gen_random_uuid(),gen_random_uuid(),'{}',true)",(workspace,str(uuid4()),role))
                    return "charged"
                except psycopg.Error as exc:
                    if "workspace_credits_exhausted" in str(exc):
                        return "blocked"
                    raise
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(debit,range(2)))
            assert sorted(results)==["blocked","charged"],results
            assert scalar("select count(*) from company_workspace_credit_events where role_id=%s",(role,))==1
            assert scalar("select remaining from company_workspace_credit_periods where id=%s",(assigned_period,))==0
            for period in periods:
                if period["id"] != assigned_period:
                    assert scalar("select remaining from company_workspace_credit_periods where id=%s", (period["id"],)) == period["remaining"], "Other slots must not fund the blocked request"
            print(json.dumps({"pass":True,"name":"Two simultaneous requests compete for one slot credit; other slots unchanged","results":results}))
        finally:
            conn.rollback()
            cur.execute("delete from company_workspace_credit_events where role_id=%s",(role,))
            cur.execute("update company_roles set status='paused' where role_id=%s",(role,))
            cur.execute("delete from company_roles where role_id=%s",(role,))
            for period in periods + locals().get("shared_periods", []):
                cur.execute("update company_workspace_credit_periods set remaining=%s where id=%s",(period["remaining"],period["id"]))
            conn.commit()
    elif command == "assert":
        # Rewrite only this transaction's copy of production billing functions.
        # No clock override is shipped to the application or committed to the DB.
        cur.execute("select pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'workspace_billing_%'")
        definitions = cur.fetchall()
        for row in definitions:
            definition = row["definition"]
            if "clock_timestamp()" in definition:
                cur.execute(definition.replace("clock_timestamp()", "current_setting('harper_billing_test.now')::timestamptz"))
        at(payload["at"])
        before = summary()
        assert before["balance"] == payload["balance"], ("balance",before,payload)
        assert before["capacity"] == payload["capacity"], ("capacity",before,payload)
        if "model" in payload:
            assert before["model"] == payload["model"], ("model",before)
        role = str(uuid4())
        cur.execute("insert into company_roles(role_id,company_workspace_id,name,source_type,status,information) values (%s,%s,'Billing clock fixture','internal','active',%s)",
                    (role,workspace,Jsonb({"testOnly": True,"testFixture":"stripe-billing-clock"})))
        for i in range(payload.get("spend", 0)):
            scalar("select public.workspace_billing_debit_v1(%s,'intro_request',%s,%s,gen_random_uuid(),gen_random_uuid(),'{}',true)", (workspace,str(uuid4()),role))
        after = summary()
        assert after["balance"] == before["balance"] - payload.get("spend",0)
        if payload.get("exhausted"):
            cur.execute("savepoint exhausted")
            try:
                scalar("select public.workspace_billing_debit_v1(%s,'intro_request',%s,%s,gen_random_uuid(),gen_random_uuid(),'{}',true)",(workspace,str(uuid4()),role))
                raise AssertionError("Expected credits_exhausted")
            except psycopg.Error as exc:
                assert "workspace_credits_exhausted" in str(exc)
                cur.execute("rollback to savepoint exhausted")
        if payload.get("nextAt"):
            at(payload["nextAt"])
            after = summary()
            assert after["balance"] == payload["nextBalance"], ("nextBalance",after,payload)
        # Same function bodies / privileges must be restored before returning.
        conn.rollback()
        print(json.dumps({"pass":True,"name":payload["name"],"balance":before["balance"],"afterBalance":after["balance"],"capacity":before["capacity"],"model":before["model"],"transactionRolledBack":True}))
    else:
        raise ValueError("Unknown command")
finally:
    conn.rollback()
    conn.close()
