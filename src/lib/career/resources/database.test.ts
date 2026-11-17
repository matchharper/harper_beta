import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const a = "00000000-0000-4000-a000-000000000001",
  b = "00000000-0000-4000-a000-000000000002";
test(
  "resource migration: shared evidence, owner boundaries, immutable selections and revision conflicts",
  { timeout: 60000 },
  async (t) => {
    const db = new PGlite({ extensions: { vector } });
    try {
      await db.exec(`create extension vector;
      create role anon; create role authenticated; create role service_role;
      create table talent_users(user_id uuid primary key,deleted_at timestamptz);
      create table talent_integrations(talent_id uuid,provider text,status text,composio_connected_account_id text,career_mail_sync jsonb,primary key(talent_id,provider));
      create table talent_setting(user_id uuid primary key,status text,get_external_recommendation boolean);
      create table talent_agent_schedules(id uuid primary key default gen_random_uuid(),talent_id uuid,conversation_id uuid,title text,instruction text,
        target_refs jsonb default '{}',status text default 'active',directive_revision bigint default 1);
      create table opportunity_discovery_run(id uuid primary key default gen_random_uuid(),talent_id uuid,conversation_id uuid,trigger text,run_mode text,
        status text,dedupe_key text unique,trigger_payload jsonb default '{}',updated_at timestamptz default now());
      create table talent_opportunity_recommendation(id uuid primary key,talent_id uuid,role_id uuid,saved_stage text,fit_summary text,recommended_at timestamptz default now(),rank integer,updated_at timestamptz default now());
      create table talent_external_operations(id uuid primary key default gen_random_uuid(),parent_id uuid references talent_external_operations(id),user_id uuid,conversation_id uuid,idempotency_key text,unique(user_id,kind,idempotency_key),created_at timestamptz default now(),kind text,status text default 'reserved',revision bigint default 1,
        request jsonb default '{}',result jsonb default '{}',provider_refs jsonb default '{}',updated_at timestamptz default now());
      create table documents(id bigint generated always as identity primary key,url text,title text,markdown text,excerpt text,created_at timestamptz default now());
      create table company_db(id bigint generated always as identity primary key,name text,description text,short_description text,specialities text,location text,website_url text,linkedin_url text,founded_year integer,employee_count_range text);
      create table talent_documents(id uuid primary key,talent_id uuid,is_deleted boolean default false,file_name text,description text,extracted_text text,kind text default 'document',revision bigint default 1,updated_at timestamptz default now());
      create table talent_contexts(id bigint primary key,talent_id uuid,deleted_at timestamptz);
      create table talent_conversations(id uuid primary key,user_id uuid);
      create table talent_messages(id bigint generated always as identity primary key,user_id uuid,conversation_id uuid,role text,content text,message_type text,payload jsonb,is_mobile boolean,created_at timestamptz default now());
      create table talent_profiles(id uuid primary key,talent_id uuid);
      create table talent_profile_revisions(profile_id uuid,snapshot jsonb);
      create table talent_role_materials(id uuid,documents jsonb);
      create table career_action_items(id uuid,action jsonb);
      create table talent_opportunity_matching_review(id uuid,talent_id uuid,opportunity_id uuid);
      create function career_internal_selection_available_v1(uuid,uuid) returns boolean language sql as 'select false';
      create table official_jobs(id uuid primary key,is_published boolean);
      create table company_workspace(company_workspace_id uuid primary key default gen_random_uuid(),company_name text,published_name text,
        company_db_id bigint,career_url text,logo_url text,external_roles_enabled boolean,is_internal boolean,has_career_page boolean,is_scrape_original boolean);
      create table company_roles(role_id uuid primary key default gen_random_uuid(),company_workspace_id uuid,name text,description text,
        external_jd_url text,source_type text,source_provider text,source_job_id text,information jsonb,is_expired boolean,expires_at timestamptz,
        posted_at timestamptz,expired_at timestamptz,description_summary text,title_embedding vector(1536),title_embedding_text text,seniority_level text,country_code text,
        salary_min numeric,salary_max numeric,salary_currency text,salary_period text,salary_is_predicted boolean default false,location_text text,salary_range text,status text,summary jsonb,type text[],work_mode text,updated_at timestamptz default now());
      create function read_career_internal_role_v1(uuid,uuid) returns jsonb language sql as 'select null::jsonb';
      create function current_talent_recommendation_id_v1(uuid) returns uuid language sql as 'select $1';
      insert into talent_users(user_id) values ('${a}'),('${b}');`);
      await db.exec(
        await readFile(
          "supabase/migrations/20261113105340_career_resources_and_opportunities.sql",
          "utf8"
        )
      );
      await db.exec(
        await readFile(
          "supabase/migrations/20261113111611_career_public_directory_import.sql",
          "utf8"
        )
      );
      await db.exec(
        await readFile(
          "supabase/migrations/20261113112306_career_resource_index_workers.sql",
          "utf8"
        )
      );
      await db.exec(
        await readFile(
          "supabase/migrations/20261113153813_career_discovery_delivery.sql",
          "utf8"
        )
      );
      const admissionSql = await readFile(
        "supabase/migrations/20261104033157_career_conversation_stop.sql",
        "utf8"
      );
      await db.exec(
        admissionSql.slice(
          0,
          admissionSql.indexOf(
            "create or replace function public.admit_career_message"
          )
        )
      );
      await db.exec(
        await readFile(
          "supabase/migrations/20261113154219_career_resource_interactions.sql",
          "utf8"
        )
      );
      await db.exec(
        await readFile(
          "supabase/migrations/20261113162900_career_source_continuity.sql",
          "utf8"
        )
      );
      await db.exec(
        await readFile(
          "supabase/migrations/20261113164300_career_resource_privacy.sql",
          "utf8"
        )
      );
      await db.exec(
        await readFile(
          "supabase/migrations/20261113173100_career_selected_resource_search.sql",
          "utf8"
        )
      );
      await db.exec(
        await readFile(
          "supabase/migrations/20261113174900_career_resource_retention.sql",
          "utf8"
        )
      );
      await db.exec(
        await readFile(
          "supabase/migrations/20261113182700_career_cache_write_boundaries.sql",
          "utf8"
        )
      );
      await db.exec(
        await readFile(
          "supabase/migrations/20261113182800_career_resource_lifecycle_and_order.sql",
          "utf8"
        )
      );
      await db.exec(await readFile(
        "supabase/migrations/20261116062600_career_company_evidence.sql", "utf8"
      ));
      await db.exec(await readFile(
        "supabase/migrations/20261116081510_career_search_receipts.sql", "utf8"
      ));
      await db.exec(await readFile(
        "supabase/migrations/20261116090432_career_private_opportunity_progress.sql", "utf8"
      ));
      await db.exec(await readFile(
        "supabase/migrations/20261117010000_career_complete_source_cache.sql", "utf8"
      ));
      const capture = async (body: string, hash: string) =>
        (
          await db.query<{
            result: { documentId: number; observationId: string };
          }>(
            "select career_capture_public_source_v1($1,$2,$3,$4,$5,$6::jsonb) result",
            [
              "public:https://example.org/hiring",
              "https://example.org/hiring",
              "New team",
              body,
              hash,
              JSON.stringify({
                scope: "public",
                provider: "exa_search",
                contract: "fixture",
              }),
            ]
          )
        ).rows[0].result;
      const source = await capture(
        "We are hiring platform engineers in Seoul.",
        "v1"
      );
      await t.test(
        "a late metadata hit cannot downgrade a full public body",
        async () => {
          await db.query(
            "select career_capture_public_source_v1($1,$2,$3,$4,$5,$6::jsonb)",
            [
              "public:https://example.org/hiring",
              "https://example.org/hiring",
              "Snippet",
              "Only metadata",
              "metadata",
              JSON.stringify({
                scope: "public",
                provider: "exa_search",
                contract: "exa-search-metadata-v1",
              }),
            ]
          );
          const row = (
            await db.query<{ markdown: string }>(
              "select markdown from documents where id=$1",
              [source.documentId]
            )
          ).rows[0];
          assert.equal(
            row.markdown,
            "We are hiring platform engineers in Seoul."
          );
        }
      );
      await t.test(
        "same public body has one observation; another user can discover it without the URL",
        async () => {
          const again = await capture(
            "We are hiring platform engineers in Seoul.",
            "v1"
          );
          assert.equal(again.documentId, source.documentId);
          assert.equal(again.observationId, source.observationId);
          assert.equal(
            (await db.query("select * from career_public_observations")).rows
              .length,
            1
          );
          const found = await db.query<{ title: string }>(
            "select * from career_search_resources_v1($1,'public_resources','platform',0,50)",
            [b]
          );
          assert.equal(found.rows[0].title, "New team");
          const updated = await capture("Hiring has closed.", "v2");
          assert.equal(updated.documentId, source.documentId);
          assert.notEqual(updated.observationId, source.observationId);
          assert.equal(
            (
              await db.query<{ content: string }>(
                "select content from career_public_observations where id=$1",
                [source.observationId]
              )
            ).rows[0].content,
            "We are hiring platform engineers in Seoul."
          );
        }
      );
      const document = "00000000-0000-4000-a000-000000000011";
      await db.query(
        "insert into talent_documents(id,talent_id,file_name,extracted_text) values($1,$2,'Evidence','Private project outcome')",
        [document, a]
      );
      await t.test(
        "private exact IDs, search and materialized selections reject a different owner",
        async () => {
          const ref = JSON.stringify({ kind: "document", id: document });
          assert.equal(
            (
              await db.query<{ ok: boolean }>(
                "select career_resource_available_v1($1,$2::jsonb) ok",
                [b, ref]
              )
            ).rows[0].ok,
            false
          );
          assert.equal(
            (
              await db.query(
                "select * from career_search_resources_v1($1,'documents','Private',0,50)",
                [b]
              )
            ).rows.length,
            0
          );
          await assert.rejects(
            db.query(
              "select career_publish_result_set_v1($1,$2,0,'Private','{}',$3::jsonb)",
              [
                b,
                crypto.randomUUID(),
                JSON.stringify([{ ref: JSON.parse(ref) }]),
              ]
            ),
            /Source unavailable/
          );
          const grants = await db.query<{ allowed: boolean }>(
            "select has_table_privilege('authenticated','career_result_items','select') allowed"
          );
          assert.equal(grants.rows[0].allowed, false);
        }
      );
      const setId = crypto.randomUUID(),
        itemIds = Array.from({ length: 500 }, () => crypto.randomUUID());
      await db.query(
        "select career_publish_result_set_v1($1,$2,0,'Market',$3::jsonb,$4::jsonb)",
        [
          a,
          setId,
          JSON.stringify({ fields: ["number", "country"] }),
          JSON.stringify(
            itemIds.map((itemId, i) => ({
              itemId,
              ref: { kind: "document", id: document },
              projection: { number: i, country: i % 2 ? "US" : "KR" },
            }))
          ),
        ]
      );
      await t.test(
        "all 500 members page exactly; selection excludes items and sorts typed facts",
        async () => {
          const all: string[] = [];
          for (let offset = 0; offset < 500; offset += 73) {
            const page = await db.query<{ item_id: string }>(
              "select * from career_read_result_items_v1($1,$2,1,'{}', $3,73)",
              [a, setId, offset]
            );
            all.push(...page.rows.map((row) => row.item_id));
          }
          assert.deepEqual(all, itemIds);
          const selected = await db.query<{
            projection: { number: number };
            total_count: number;
          }>(
            "select * from career_read_result_items_v1($1,$2,1,$3::jsonb,0,501)",
            [
              a,
              setId,
              JSON.stringify({
                where: [{ field: "country", op: "eq", value: "US" }],
                excludeItemIds: [itemIds[499]],
                orderBy: [{ field: "number", direction: "desc" }],
              }),
            ]
          );
          assert.equal(selected.rows.length, 249);
          assert.equal(selected.rows[0].projection.number, 497);
          await assert.rejects(
            db.query(
              "select * from career_read_result_items_v1($1,$2,1,'{}',0,10)",
              [b, setId]
            ),
            /Set unavailable/
          );
          await assert.rejects(
            db.query(
              "select career_publish_result_set_v1($1,$2,0,'Changed','{}','[]')",
              [a, setId]
            ),
            /revision conflict/
          );
        }
      );
      await t.test(
        "source deletion suppresses cached private projections",
        async () => {
          await db.query(
            "update talent_documents set is_deleted=true where id=$1",
            [document]
          );
          const page = await db.query<{ projection: unknown }>(
            "select * from career_read_result_items_v1($1,$2,1,'{}',0,1)",
            [a, setId]
          );
          assert.deepEqual(page.rows[0].projection, {});
        }
      );
      await t.test(
        "published opportunities enforce owner, CAS and alias acyclicity",
        async () => {
          const one = crypto.randomUUID(),
            two = crypto.randomUUID(),
            patch = JSON.stringify({
              title: "Platform team",
              primary_ref: { kind: "observation", id: source.observationId },
            });
          await db.query(
            "select career_write_opportunity_v1($1,$2,0,$3::jsonb)",
            [a, one, patch]
          );
          await db.query(
            "select career_write_opportunity_v1($1,$2,0,$3::jsonb)",
            [a, two, patch]
          );
          await assert.rejects(
            db.query("select career_write_opportunity_v1($1,$2,1,'{}')", [
              b,
              one,
            ]),
            /unavailable/
          );
          await db.query(
            "select career_write_opportunity_v1($1,$2,1,'{\"display_order\":4}','user')",
            [a, one]
          );
          await assert.rejects(
            db.query("select career_write_opportunity_v1($1,$2,1,'{}')", [
              a,
              one,
            ]),
            /revision conflict/
          );
          await db.query(
            "select career_write_opportunity_v1($1,$2,2,'{\"display_order\":1}')",
            [a, one]
          );
          assert.equal(
            (
              await db.query<{ display_order: string }>(
                "select display_order from career_opportunities where id=$1",
                [one]
              )
            ).rows[0].display_order,
            "4"
          );
          await db.query("select career_merge_opportunities_v1($1,$2,$3,3,1)", [
            a,
            one,
            two,
          ]);
          await assert.rejects(
            db.query("select career_merge_opportunities_v1($1,$2,$3,2,4)", [
              a,
              two,
              one,
            ]),
            /cycle/
          );
        }
      );
      await t.test(
        "resource operation lease excludes duplicate delivery and stale completion",
        async () => {
          const id = crypto.randomUUID(),
            lease = crypto.randomUUID();
          await db.query(
            "insert into talent_external_operations(id,user_id,kind,request) values($1,$2,'resource_evaluation','{\"execution_environment\":\"test\"}')",
            [id, a]
          );
          const claim = async (user: string, revision: number) =>
            (
              await db.query<{ result: { revision: number } | null }>(
                "select career_claim_resource_operation_v1($1,$2,$3,'test',$4) result",
                [user, id, revision, lease]
              )
            ).rows[0].result;
          assert.equal(await claim(b, 1), null);
          assert.equal((await claim(a, 1))?.revision, 2);
          assert.equal(await claim(a, 1), null);
          assert.equal(await claim(a, 2), null);
          await db.query(
            "update talent_external_operations set provider_refs='{}' where id=$1",
            [id]
          );
          assert.equal((await claim(a, 2))?.revision, 3);
          assert.equal(
            (
              await db.query(
                "update talent_external_operations set status='completed' where id=$1 and revision=2 returning id",
                [id]
              )
            ).rows.length,
            0
          );
        }
      );
      await t.test(
        "public promotion rebuilds provenance, preserves personal progress and a disabled directory",
        async () => {
          const workspace = crypto.randomUUID(),
            role = crypto.randomUUID(),
            recommendation = crypto.randomUUID();
          await db.query(
            "insert into company_workspace(company_workspace_id,company_name,is_internal,external_roles_enabled) values($1,'Example',false,false)",
            [workspace]
          );
          await db.query(
            "insert into company_roles(role_id,company_workspace_id,name,source_type,source_provider,external_jd_url,information) values($1,$2,'Old private title','external','user_submitted','https://example.org/hiring',$3::jsonb)",
            [
              role,
              workspace,
              JSON.stringify({
                submittedTalentIds: [a],
                privateNote: "Private negotiations",
                jobLinkImport: { privateContext: "secret" },
              }),
            ]
          );
          await db.query(
            "insert into talent_opportunity_recommendation(id,talent_id,role_id,saved_stage) values($1,$2,$3,'applied')",
            [recommendation, a, role]
          );
          const payload = {
            canonicalUrl: "https://example.org/hiring",
            companyName: "Example",
            title: "Platform engineer",
            description: "Public original description",
            extractedBy: "greenhouse_api",
            provider: "greenhouse",
            userSubmittedSourceJobId: "example-job-1",
            employmentTypes: ["full_time"],
          };
          const indexed = (
            await db.query<{
              result: { roleId: string; searchEnabled: boolean };
            }>(
              "select career_index_public_job_v1($1,$2,$3::jsonb,'{}',$4) result",
              [role, workspace, JSON.stringify(payload), source.observationId]
            )
          ).rows[0].result;
          assert.equal(indexed.roleId, role);
          assert.equal(indexed.searchEnabled, false);
          const stored = (
            await db.query<{
              information: Record<string, unknown>;
              source_provider: string;
            }>(
              "select information,source_provider from company_roles where role_id=$1",
              [role]
            )
          ).rows[0];
          assert.equal(stored.source_provider, "career_public_discovery");
          assert.deepEqual(Object.keys(stored.information), [
            "publicDiscovery",
          ]);
          assert.equal(
            (
              await db.query<{ saved_stage: string }>(
                "select saved_stage from talent_opportunity_recommendation where id=$1",
                [recommendation]
              )
            ).rows[0].saved_stage,
            "applied"
          );
          assert.equal(
            (
              await db.query(
                "select * from talent_opportunity_recommendation where role_id=$1",
                [role]
              )
            ).rows.length,
            1
          );
          // An explicit merge binds the eventual Role to the original company-level
          // opportunity; it does not create a second progress record.
          const general = crypto.randomUUID();
          await db.query(
            "select career_write_opportunity_v1($1,$2,0,$3::jsonb)",
            [
              a,
              general,
              JSON.stringify({
                title: "Operating opportunity",
                primary_ref: { kind: "observation", id: source.observationId },
              }),
            ]
          );
          const wrapped = (
            await db.query<{ id: string }>(
              "select career_wrap_legacy_opportunity_v1($1,$2) id",
              [a, recommendation]
            )
          ).rows[0].id;
          await db.query("select career_merge_opportunities_v1($1,$2,$3,1,1)", [
            a,
            wrapped,
            general,
          ]);
          await db.query(
            'select career_write_opportunity_v1($1,$2,2,\'{"body":"Latest personal reasoning"}\')',
            [a, general]
          );
          assert.equal(
            (
              await db.query<{ id: string }>(
                "select career_wrap_legacy_opportunity_v1($1,$2) id",
                [a, recommendation]
              )
            ).rows[0].id,
            general
          );
          assert.equal(
            (
              await db.query<{ merged_into_id: string }>(
                "select merged_into_id from career_opportunities where id=$1",
                [wrapped]
              )
            ).rows[0].merged_into_id,
            general
          );
          assert.equal(
            (
              await db.query<{ saved_stage: string }>(
                "select saved_stage from talent_opportunity_recommendation where id=$1",
                [recommendation]
              )
            ).rows[0].saved_stage,
            "applied"
          );
        }
      );
      await t.test(
        "a company is discoverable to another user through its public source body",
        async () => {
          const company = (
            await db.query<{ result: { companyId: number; revision: number } }>(
              "select career_upsert_public_company_v1(null,0,$1::jsonb,$2::jsonb) result",
              [
                JSON.stringify({
                  name: "Example",
                  website_url: "https://example.org",
                  description: "A company",
                }),
                JSON.stringify([
                  { kind: "observation", id: source.observationId },
                ]),
              ]
            )
          ).rows[0].result;
          assert.equal(
            (
              await db.query(
                "select * from career_search_resources_v1($1,'companies','platform',0,50)",
                [b]
              )
            ).rows.length,
            0
          );
          const latest = await capture(
            "A new platform team is opening in Singapore.",
            "v3"
          );
          const linked = (
            await db.query<{ about_refs: unknown[] }>(
              "select about_refs from career_public_observations where id=$1",
              [latest.observationId]
            )
          ).rows[0];
          assert.ok(
            linked.about_refs.some(
              (ref) => (ref as { id: string }).id === String(company.companyId)
            )
          );
          const found = await db.query<{ ref: { id: string } }>(
            "select * from career_search_resources_v1($1,'companies','platform',0,50)",
            [b]
          );
          assert.equal(found.rows[0].ref.id, String(company.companyId));
          await assert.rejects(
            db.query(
              "select career_upsert_public_company_v1($1,0,'{}',$2::jsonb)",
              [
                company.companyId,
                JSON.stringify([
                  { kind: "observation", id: source.observationId },
                ]),
              ]
            ),
            /revision conflict/
          );
        }
      );
      await t.test(
        "index chunks cannot publish after a concurrent source correction",
        async () => {
          const company = (
            await db.query<{ id: number; public_facts_revision: number }>(
              "insert into company_db(name,description) values('Index fixture','Old facts') returning id,public_facts_revision"
            )
          ).rows[0];
          const lease = crypto.randomUUID(),
            vector = JSON.stringify([1, ...Array(1535).fill(0)]);
          assert.ok(
            (
              await db.query<{ h: unknown }>(
                "select career_claim_resource_source_v1('public',null,'company',$1,$2,$3) h",
                [
                  String(company.id),
                  String(company.public_facts_revision),
                  lease,
                ]
              )
            ).rows[0].h
          );
          await db.query(
            "select career_write_resource_chunk_v1('public',null,'company',$1,$2,$3,'tokens:0:2','Old facts',$4::vector,'fixture')",
            [
              String(company.id),
              String(company.public_facts_revision),
              lease,
              vector,
            ]
          );
          await db.query(
            "update company_db set description='Corrected facts' where id=$1",
            [company.id]
          );
          assert.equal(
            (
              await db.query<{ ok: boolean }>(
                "select career_finish_resource_source_v1('public',null,'company',$1,$2,$3,1,true) ok",
                [
                  String(company.id),
                  String(company.public_facts_revision),
                  lease,
                ]
              )
            ).rows[0].ok,
            false
          );
          assert.equal(
            (
              await db.query(
                "select * from career_resource_neighbors_v1($1,'company',$2::vector,0,10)",
                [a, vector]
              )
            ).rows.length,
            0
          );
          await db.query(
            "select career_claim_resource_source_v1('public',null,'company',$1,'2',$2)",
            [String(company.id), lease]
          );
          await db.query(
            "select career_write_resource_chunk_v1('public',null,'company',$1,'2',$2,'tokens:0:2','Corrected facts',$3::vector,'fixture')",
            [String(company.id), lease, vector]
          );
          assert.equal(
            (
              await db.query<{ ok: boolean }>(
                "select career_finish_resource_source_v1('public',null,'company',$1,'2',$2,1,true) ok",
                [String(company.id), lease]
              )
            ).rows[0].ok,
            true
          );
          assert.equal(
            (
              await db.query(
                "select * from career_resource_neighbors_v1($1,'company',$2::vector,0,10)",
                [b, vector]
              )
            ).rows.length,
            1
          );
        }
      );
      await t.test(
        "a public change reaches only active delegated inboxes and is invalidated by pause",
        async () => {
          const schedule = crypto.randomUUID(),
            paused = crypto.randomUUID(),
            company = (
              await db.query<{ id: number }>(
                "insert into company_db(name,description) values('Routing fixture','Hiring platform engineers') returning id"
              )
            ).rows[0].id;
          const config = JSON.stringify({
            discovery: {
              delivery_mode: "on_change",
              queries: ["platform"],
              context_refs: [],
              source_refs: [],
            },
          });
          await db.query(
            "insert into talent_agent_schedules(id,talent_id,title,instruction,target_refs) values($1,$2,'Market','Find relevant teams',$3::jsonb)",
            [schedule, b, config]
          );
          await db.query(
            "insert into talent_agent_schedules(id,talent_id,title,instruction,target_refs,status) values($1,$2,'Paused','Do not run',$3::jsonb,'paused')",
            [paused, a, config]
          );
          const lease = crypto.randomUUID(),
            vector = JSON.stringify([1, ...Array(1535).fill(0)]);
          await db.query(
            "select career_claim_resource_source_v1('public',null,'company',$1,'1',$2)",
            [String(company), lease]
          );
          await db.query(
            "select career_write_resource_chunk_v1('public',null,'company',$1,'1',$2,'tokens:0:3','Hiring platform engineers',$3::vector,'fixture')",
            [String(company), lease, vector]
          );
          await db.query(
            "select career_finish_resource_source_v1('public',null,'company',$1,'1',$2,1,true)",
            [String(company), lease]
          );
          await db.query(
            "select career_claim_resource_source_v1('public',null,'company',$1,'1',$2)",
            [String(company), lease]
          );
          await db.query(
            "select career_dispatch_public_source_v1('company',$1,'1',$2,1)",
            [String(company), lease]
          );
          const inbox = await db.query<{
            user_id: string;
            request: { event: Record<string, unknown> };
          }>(
            "select user_id,request from talent_external_operations where kind='public_discovery_event'"
          );
          assert.equal(inbox.rows.length, 1);
          assert.equal(inbox.rows[0].user_id, b);
          const run = (
            await db.query<{ id: string }>(
              "select career_admit_discovery_events_v1($1) id",
              [b]
            )
          ).rows[0].id;
          assert.ok(run);
          assert.equal(
            (
              await db.query(
                "select * from opportunity_discovery_run where id=$1",
                [run]
              )
            ).rows.length,
            1
          );
          assert.equal(
            (
              await db.query<{ id: string | null }>(
                "select career_admit_discovery_events_v1($1) id",
                [b]
              )
            ).rows[0].id,
            null
          );
          await db.query(
            "update talent_agent_schedules set status='paused',directive_revision=directive_revision+1 where id=$1",
            [schedule]
          );
          assert.equal(
            (
              await db.query<{ ok: boolean }>(
                "select career_discovery_event_current_v1($1,$2::jsonb) ok",
                [b, JSON.stringify(inbox.rows[0].request.event)]
              )
            ).rows[0].ok,
            false
          );
          assert.equal(
            (
              await db.query(
                "select * from career_resource_index where resource_kind='discovery_request' and resource_id=$1",
                [schedule]
              )
            ).rows.length,
            0
          );
        }
      );
      await t.test(
        "a new discovery request backfills every lexical/exact match across pages without embeddings",
        async () => {
          const ids: string[] = [];
          for (let i = 0; i < 51; i++) {
            const company = (
              await db.query<{ id: number }>(
                "insert into company_db(name,description) values($1,$2) returning id",
                [`Backfill ${i}`, i === 50 ? "Exact target" : "backfillprobe"]
              )
            ).rows[0].id;
            ids.push(String(company));
            await db.query(
              "update career_resource_index set index_state='ready' where resource_kind='company' and resource_id=$1",
              [String(company)]
            );
            await db.query(
              "insert into career_resource_index(scope,resource_kind,resource_id,source_revision,chunk_key,index_state,body) values('public','company',$1,'1','body','ready',$2)",
              [String(company), i === 50 ? "Exact target" : "backfillprobe"]
            );
          }
          const schedule = crypto.randomUUID(),
            lease = crypto.randomUUID();
          await db.query(
            "insert into talent_agent_schedules(id,talent_id,title,instruction,target_refs) values($1,$2,'Existing market','Find relevant teams',$3::jsonb)",
            [
              schedule,
              b,
              JSON.stringify({
                discovery: {
                  delivery_mode: "on_change",
                  queries: ["backfillprobe"],
                  context_refs: [],
                  source_refs: [{ kind: "company", id: ids[50] }],
                },
              }),
            ]
          );
          await db.query(
            "update career_resource_index set index_state='ready' where resource_kind='discovery_request' and resource_id=$1",
            [schedule]
          );
          const revision = (
            await db.query<{ source_revision: string }>(
              "select source_revision from career_resource_index where resource_kind='discovery_request' and resource_id=$1",
              [schedule]
            )
          ).rows[0].source_revision;
          for (let page = 0; page < 2; page++) {
            await db.query(
              "select career_claim_resource_source_v1('private',$1,'discovery_request',$2,$3,$4)",
              [b, schedule, revision, lease]
            );
            assert.equal(
              (
                await db.query<{ ok: boolean }>(
                  "select career_backfill_discovery_request_v1($1,$2,$3,$4) ok",
                  [b, schedule, revision, lease]
                )
              ).rows[0].ok,
              true
            );
            const state = (
              await db.query<{ dispatch_state: { complete: boolean } }>(
                "select dispatch_state from career_resource_index where resource_kind='discovery_request' and resource_id=$1",
                [schedule]
              )
            ).rows[0].dispatch_state;
            assert.equal(state.complete, page === 1);
          }
          const events = (
            await db.query<{
              request: { event: { resourceRefs: Array<{ id: string }> } };
            }>(
              "select request from talent_external_operations where kind='public_discovery_event' and request->'event'->>'sourceId'=$1",
              [schedule]
            )
          ).rows;
          assert.equal(events.length, 51);
          assert.deepEqual(
            new Set(events.map((row) => row.request.event.resourceRefs[0].id)),
            new Set(ids)
          );
          await db.query(
            "select career_claim_resource_source_v1('private',$1,'discovery_request',$2,$3,$4)",
            [b, schedule, revision, lease]
          );
          await db.query(
            "select career_backfill_discovery_request_v1($1,$2,$3,$4)",
            [b, schedule, revision, lease]
          );
          assert.equal(
            (
              await db.query(
                "select id from talent_external_operations where kind='public_discovery_event' and request->'event'->>'sourceId'=$1",
                [schedule]
              )
            ).rows.length,
            51
          );
        }
      );
      await t.test(
        "view actions use the stored request, freeze the selection and replay one admission",
        async () => {
          const view = crypto.randomUUID(),
            conversation = crypto.randomUUID(),
            request = crypto.randomUUID();
          await db.query("insert into talent_conversations values($1,$2)", [
            conversation,
            a,
          ]);
          await db.query(
            "insert into career_views(id,talent_id,title,definition) values($1,$2,'Compare',$3::jsonb)",
            [
              view,
              a,
              JSON.stringify({
                blocks: [
                  {
                    id: "targets",
                    type: "collection",
                    selection: { setId, revision: 1 },
                    layout: "table",
                    action: {
                      id: "prepare",
                      label: "Prepare",
                      request: "Prepare the selected opportunities.",
                    },
                  },
                ],
              }),
            ]
          );
          const frozen = crypto.randomUUID();
          await db.query(
            "select career_publish_result_set_v1($1,$2,0,'Selected','{}',$3::jsonb)",
            [
              a,
              frozen,
              JSON.stringify([
                { ref: { kind: "observation", id: source.observationId } },
              ]),
            ]
          );
          const args = [
            a,
            conversation,
            request,
            "view",
            view,
            1,
            "prepare",
            JSON.stringify({ setId: frozen, revision: 1 }),
            "Keep my latest constraints.",
            "{}",
          ];
          const sql =
            "select career_resource_interaction_v1($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb) result";
          await assert.rejects(
            db.query(sql, [
              ...args.slice(0, 7),
              JSON.stringify({ setId, revision: 1 }),
              ...args.slice(8),
            ]),
            /Selection source unavailable/
          );
          const first = (
            await db.query<{
              result: {
                id: number;
                content: string;
                payload: Record<string, unknown>;
              };
            }>(sql, args)
          ).rows[0].result;
          assert.equal(
            first.content,
            "Prepare the selected opportunities.\n\nKeep my latest constraints."
          );
          await db.query("update career_views set revision=2 where id=$1", [
            view,
          ]);
          assert.equal(
            (await db.query<{ result: { id: number } }>(sql, args)).rows[0]
              .result.id,
            first.id
          );
          assert.equal(
            (await db.query("select * from talent_messages")).rows.length,
            1
          );
          await assert.rejects(
            db.query(sql, [
              a,
              conversation,
              crypto.randomUUID(),
              "view",
              view,
              1,
              "prepare",
              null,
              "",
              "{}",
            ]),
            /revision conflict/
          );
          await assert.rejects(
            db.query(sql, [
              b,
              conversation,
              crypto.randomUUID(),
              "view",
              view,
              2,
              "prepare",
              null,
              "",
              "{}",
            ]),
            /unavailable/
          );
        }
      );
      await t.test(
        "deleting a private source purges transitive calculations and collection summaries, preserving independent public evidence",
        async () => {
          const doc = crypto.randomUUID(),
            one = crypto.randomUUID(),
            two = crypto.randomUUID(),
            set = crypto.randomUUID(),
            view = crypto.randomUUID();
          await db.query(
            "insert into talent_documents(id,talent_id,file_name,extracted_text) values($1,$2,'Private','Private negotiation')",
            [doc, a]
          );
          await db.query(
            "insert into talent_external_operations(id,user_id,kind,status,request,result) values($1,$2,'resource_item','completed',$3::jsonb,'{\"private_text\":\"Private negotiation\"}')",
            [
              one,
              a,
              JSON.stringify({
                sourceRefs: [{ kind: "document", id: doc }],
                inputSnapshot: "Private negotiation",
              }),
            ]
          );
          await db.query(
            "insert into talent_external_operations(id,user_id,kind,status,request,result) values($1,$2,'resource_item','completed',$3::jsonb,'{\"private_text\":\"Derived negotiation\"}')",
            [
              two,
              a,
              JSON.stringify({ sourceRefs: [{ kind: "operation", id: one }] }),
            ]
          );
          await db.query(
            "select career_publish_result_set_v1($1,$2,0,'Negotiation','{}',$3::jsonb)",
            [
              a,
              set,
              JSON.stringify([
                {
                  ref: { kind: "observation", id: source.observationId },
                  evaluationRef: { kind: "operation", id: two },
                  projection: { private: "Negotiation" },
                },
              ]),
            ]
          );
          await db.query(
            "insert into career_views(id,talent_id,title,description,definition) values($1,$2,'Private summary','Private description',$3::jsonb)",
            [
              view,
              a,
              JSON.stringify({
                blocks: [
                  {
                    id: "summary",
                    type: "narrative",
                    markdown: "Negotiation summary",
                    sourceRefs: [],
                  },
                  {
                    id: "table",
                    type: "collection",
                    selection: { setId: set, revision: 1 },
                    layout: "table",
                  },
                ],
              }),
            ]
          );
          await db.query(
            "update talent_documents set is_deleted=true where id=$1",
            [doc]
          );
          await assert.rejects(
            db.query(
              'update talent_external_operations set request=$2::jsonb,result=\'{"private_text":"Stale restored copy"}\' where id=$1',
              [
                one,
                JSON.stringify({ sourceRefs: [{ kind: "document", id: doc }] }),
              ]
            ),
            /Source unavailable/
          );
          await assert.rejects(
            db.query(
              "insert into career_views(talent_id,title,definition) values($1,'Wrong owner',$2::jsonb)",
              [
                b,
                JSON.stringify({
                  blocks: [
                    {
                      id: "private",
                      type: "collection",
                      selection: { setId: set, revision: 1 },
                      layout: "table",
                    },
                  ],
                }),
              ]
            ),
            /View set unavailable/
          );
          const cached = (
            await db.query<{ request: unknown; result: unknown }>(
              "select request,result from talent_external_operations where id in ($1,$2)",
              [one, two]
            )
          ).rows;
          assert.equal(cached.length, 2);
          assert.ok(
            cached.every((row) => !JSON.stringify(row).includes("negotiation"))
          );
          assert.equal(
            (
              await db.query<{ ok: boolean }>(
                "select career_resource_available_v1($1,$2::jsonb) ok",
                [a, JSON.stringify({ kind: "operation", id: two })]
              )
            ).rows[0].ok,
            false
          );
          const rendered = (
            await db.query<{
              title: string;
              definition: { blocks: Array<{ markdown?: string }> };
            }>("select title,definition from career_views where id=$1", [view])
          ).rows[0];
          assert.equal(rendered.title, "");
          assert.equal(rendered.definition.blocks[0].markdown, "");
          assert.equal(
            (
              await db.query<{ ok: boolean }>(
                "select career_resource_available_v1($1,$2::jsonb) ok",
                [
                  b,
                  JSON.stringify({
                    kind: "observation",
                    id: source.observationId,
                  }),
                ]
              )
            ).rows[0].ok,
            true
          );
        }
      );
      await t.test(
        "retention keeps a child used by an archived view after its first parent expires",
        async () => {
          const child = crypto.randomUUID(),
            parent = crypto.randomUUID(),
            garbage = crypto.randomUUID(),
            keep = crypto.randomUUID(),
            discard = crypto.randomUUID();
          for (const id of [child, parent, garbage])
            await db.query(
              "insert into talent_external_operations(id,user_id,kind,status,created_at) values($1,$2,'resource_item','completed',now()-interval '40 days')",
              [id, a]
            );
          await db.query(
            "update talent_external_operations set result=$2::jsonb where id=$1",
            [
              parent,
              JSON.stringify({ childRef: { kind: "operation", id: child } }),
            ]
          );
          for (const id of [keep, discard])
            await db.query(
              "select career_publish_result_set_v1($1,$2,0,'Cache','{}',$3::jsonb)",
              [
                a,
                id,
                JSON.stringify([
                  {
                    ref: { kind: "observation", id: source.observationId },
                    evaluationRef: { kind: "operation", id: child },
                  },
                ]),
              ]
            );
          await db.query(
            "update career_result_sets set created_at=now()-interval '40 days' where id in ($1,$2)",
            [keep, discard]
          );
          await db.query(
            "insert into career_views(talent_id,title,definition,archived_at) values($1,'Archived comparison',$2::jsonb,now())",
            [
              a,
              JSON.stringify({
                blocks: [
                  {
                    id: "kept",
                    type: "collection",
                    selection: { setId: keep, revision: 1 },
                    layout: "table",
                  },
                ],
              }),
            ]
          );
          const retired = (
            await db.query<{ result: { operations: number; sets: number } }>(
              "select career_retire_resource_cache_v1(now()-interval '30 days') result"
            )
          ).rows[0].result;
          assert.ok(retired.operations >= 2);
          assert.ok(retired.sets >= 1);
          assert.equal(
            (
              await db.query(
                "select id from talent_external_operations where id=$1",
                [child]
              )
            ).rows.length,
            1
          );
          assert.equal(
            (
              await db.query(
                "select id from talent_external_operations where id in ($1,$2)",
                [parent, garbage]
              )
            ).rows.length,
            0
          );
          assert.equal(
            (
              await db.query("select id from career_result_sets where id=$1", [
                keep,
              ])
            ).rows.length,
            1
          );
          assert.equal(
            (
              await db.query("select id from career_result_sets where id=$1", [
                discard,
              ])
            ).rows.length,
            0
          );
        }
      );
      await t.test(
        "manual order handles tied positions and rejects stale or foreign writes",
        async () => {
          const ids = [
            crypto.randomUUID(),
            crypto.randomUUID(),
            crypto.randomUUID(),
          ].sort();
          for (const id of ids)
            await db.query(
              "insert into career_views(id,talent_id,title,definition,archived_at) values($1,$2,'Order','{\"blocks\":[]}',now())",
              [id, b]
            );
          await assert.rejects(
            db.query("select career_move_resource_v1($1,'view',$2,1,'up')", [
              a,
              ids[1],
            ]),
            /unavailable/
          );
          await db.query(
            "select career_move_resource_v1($1,'view',$2,1,'up')",
            [b, ids[1]]
          );
          const sorted = await db.query<{ id: string; order_source: string }>(
            "select id,order_source from career_views where talent_id=$1 order by display_order,id",
            [b]
          );
          assert.deepEqual(
            sorted.rows.map((row) => row.id),
            [ids[1], ids[0], ids[2]]
          );
          assert.ok(sorted.rows.every((row) => row.order_source === "user"));
          await assert.rejects(
            db.query("select career_move_resource_v1($1,'view',$2,1,'down')", [
              b,
              ids[1],
            ]),
            /revision conflict/
          );
        }
      );
      await t.test(
        "hard-deleted profiles and messages cannot survive through operation copies",
        async () => {
          const profile = crypto.randomUUID();
          await db.query("insert into talent_profiles values($1,$2)", [
            profile,
            a,
          ]);
          const message = (
            await db.query<{ id: number }>(
              "insert into talent_messages(user_id,content) values($1,'Private') returning id",
              [a]
            )
          ).rows[0].id;
          for (const [kind, id] of [
            ["profile", profile],
            ["message", String(message)],
          ]) {
            const op = crypto.randomUUID();
            await db.query(
              "insert into talent_external_operations(id,user_id,kind,request,result) values($1,$2,'resource_item',$3::jsonb,'{\"body\":\"Private copy\"}')",
              [op, a, JSON.stringify({ sourceRefs: [{ kind, id }] })]
            );
            await db.query(
              kind === "profile"
                ? "delete from talent_profiles where id=$1"
                : "delete from talent_messages where id=$1",
              [id]
            );
            const purged = (
              await db.query<{ result: unknown }>(
                "select result from talent_external_operations where id=$1",
                [op]
              )
            ).rows[0];
            assert.deepEqual(purged.result, { source_unavailable: true });
          }
        }
      );
      await t.test(
        "account closure removes private index and fences delayed writes without deleting shared public sources",
        async () => {
          await db.query(
            "update talent_users set deleted_at=now() where user_id=$1",
            [b]
          );
          await db.query(
            "insert into career_resource_index(scope,owner_id,resource_kind,resource_id,source_revision,chunk_key) values('private',$1,'document','late','1','@source')",
            [b]
          );
          await db.query("select career_backfill_resource_headers_v1(500)");
          assert.equal(
            (
              await db.query(
                "select resource_id from career_resource_index where owner_id=$1",
                [b]
              )
            ).rows.length,
            0
          );
          assert.ok(
            (
              await db.query(
                "select resource_id from career_resource_index where scope='public'"
              )
            ).rows.length > 0
          );
          assert.equal(
            (
              await db.query<{ ok: boolean }>(
                "select career_resource_available_v1($1,$2::jsonb) ok",
                [
                  a,
                  JSON.stringify({
                    kind: "web_resource",
                    id: String(source.documentId),
                  }),
                ]
              )
            ).rows[0].ok,
            true
          );
        }
      );
      await t.test(
        "revoked public provenance clears only attributed directory facts and rejects stale copies",
        async () => {
          const url = "https://revoked.example/jobs/one";
          const observation = (
            await db.query<{ result: { observationId: string } }>(
              "select career_capture_public_source_v1($1,$2,'Revoked','Original public text','r1','{\"scope\":\"public\",\"contract\":\"fixture\"}') result",
              [`public:${url}`, url]
            )
          ).rows[0].result.observationId;
          const company = (
            await db.query<{ result: { companyId: number; revision: number } }>(
              "select career_upsert_public_company_v1(null,0,$1::jsonb,$2::jsonb) result",
              [
                JSON.stringify({
                  name: "Revoked company",
                  website_url: "https://revoked.example",
                  description: "Original public description",
                }),
                JSON.stringify([{ kind: "observation", id: observation }]),
              ]
            )
          ).rows[0].result;
          await db.query(
            "update company_db set short_description='Independent directory fact' where id=$1",
            [company.companyId]
          );
          const role = (
            await db.query<{ result: { roleId: string } }>(
              "select career_index_public_job_v1(null,null,$1::jsonb,'{}',$2) result",
              [
                JSON.stringify({
                  canonicalUrl: url,
                  companyName: "Revoked company",
                  title: "Engineer",
                  description: "Original role text",
                  extractedBy: "public_job_page",
                  userSubmittedSourceJobId: url,
                }),
                observation,
              ]
            )
          ).rows[0].result.roleId;
          await db.query(
            "update career_public_observations set deleted_at=now() where id=$1",
            [observation]
          );
          const row = (
            await db.query<{
              name: string;
              description: null;
              short_description: string;
            }>(
              "select name,description,short_description from company_db where id=$1",
              [company.companyId]
            )
          ).rows[0];
          assert.equal(row.name, "");
          assert.equal(row.description, null);
          assert.equal(row.short_description, "Independent directory fact");
          assert.equal(
            (
              await db.query<{ ok: boolean }>(
                "select career_resource_available_v1($1,$2::jsonb) ok",
                [a, JSON.stringify({ kind: "role", id: role })]
              )
            ).rows[0].ok,
            false
          );
          await assert.rejects(
            db.query(
              "insert into talent_external_operations(user_id,kind,request,result) values($1,'resource_item',$2::jsonb,'{\"copy\":\"Old description\"}')",
              [
                a,
                JSON.stringify({
                  sourceRefs: [
                    {
                      kind: "company",
                      id: String(company.companyId),
                      revision: String(company.revision),
                    },
                  ],
                }),
              ]
            ),
            /Source unavailable/
          );
        }
      );
      await t.test(
        "actual resource processor reuses completed children, retries partial failures and preserves immutable earlier results",
        async (testContext) => {
          process.env.OPENAI_API_KEY = "fixture-no-network";
          process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture";
          process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture";
          const { resourcePgliteTransport } =
            await import("../../../../scripts/evaluation/resourcePgliteTransport");
          const { processResourceOperation } = await import("./operations");
          const { careerExecutionEnvironment } =
            await import("../executionEnvironment");
          const admin = resourcePgliteTransport(db),
            refs = [
              { kind: "observation", id: source.observationId },
              { kind: "web_resource", id: String(source.documentId) },
            ];
          let calls = 0;
          const receipts: Array<{ meta: Record<string, unknown> }> = [];
          testContext.mock.method(
            globalThis,
            "fetch",
            async (input: RequestInfo | URL, init?: RequestInit) => {
              const url =
                typeof input === "string"
                  ? input
                  : input instanceof URL
                    ? input.href
                    : input.url;
              if (url.endsWith("/v1/decisions")) {
                calls++;
                return Response.json(
                  calls === 2
                    ? { answers: [] }
                    : {
                        answers: [
                          { name: "q0", type: "predicate", probability: 0.7 },
                        ],
                        usage: { input_tokens: 12 },
                        model: "fixture",
                      }
                );
              }
              if (url.startsWith("http://127.0.0.1:9/rest/v1/llm_logs")) {
                receipts.push(JSON.parse(String(init?.body)));
                return Response.json([]);
              }
              throw new Error(`Unexpected test network ${url}`);
            }
          );
          const create = async () => {
            const id = crypto.randomUUID();
            await db.query(
              "insert into talent_external_operations(id,user_id,kind,idempotency_key,request) values($1::uuid,$2,'resource_evaluation',$1::uuid::text,$3::jsonb)",
              [
                id,
                a,
                JSON.stringify({
                  selection: { refs },
                  contextRefs: [],
                  contextSnapshot: [],
                  knownSourceRefs: [],
                  criteria: [
                    {
                      name: "supported",
                      type: "predicate",
                      instructions: "Assess the supplied public evidence.",
                    },
                  ],
                  execution_environment: careerExecutionEnvironment(),
                }),
              ]
            );
            return id;
          };
          const first = await create();
          await processResourceOperation(
            { admin, userId: a },
            first,
            1,
            Date.now() + 120000
          );
          const one = (
            await db.query<{ status: string; result: any }>(
              "select status,result from talent_external_operations where id=$1",
              [first]
            )
          ).rows[0];
          assert.equal(one.status, "partial");
          assert.equal(one.result.completed, 1);
          assert.equal(one.result.failed, 1);
          assert.equal(calls, 2);
          const next = await create();
          await processResourceOperation(
            { admin, userId: a },
            next,
            1,
            Date.now() + 120000
          );
          const two = (
            await db.query<{ status: string; result: any }>(
              "select status,result from talent_external_operations where id=$1",
              [next]
            )
          ).rows[0];
          assert.equal(two.status, "completed");
          assert.equal(two.result.cacheHits, 1);
          assert.equal(two.result.completed, 2);
          assert.equal(calls, 3);
          assert.equal(receipts.length, 3);
          assert.equal(receipts[2].meta.parentOperationId, next);
          assert.equal(
            receipts[2].meta.careerOperationKind,
            "resource_evaluation"
          );
          assert.ok(receipts[2].meta.careerOperationId);
          const earlier = (
            await db.query<{ projection: { status: string } }>(
              "select projection from career_result_items where set_id=$1 and set_revision=$2 order by ordinal",
              [one.result.set.setId, one.result.set.revision]
            )
          ).rows;
          assert.deepEqual(
            earlier.map((item) => item.projection.status),
            ["completed", "failed"]
          );
        }
      );
      await t.test(
        "entrusted general opportunities stay in My Opportunities through aliases and completion without a synthetic save",
        async () => {
          const original = crypto.randomUUID(),
            canonical = crypto.randomUUID(),
            work = crypto.randomUUID();
          const patch = JSON.stringify({
            title: "Owned opportunity",
            primary_ref: {
              kind: "web_resource",
              id: String(source.documentId),
            },
          });
          for (const id of [original, canonical])
            await db.query(
              "select career_write_opportunity_v1($1,$2,0,$3::jsonb)",
              [a, id, patch]
            );
          await db.query(
            "insert into talent_external_operations(id,user_id,kind,status,request) values($1,$2,'delegated_work','waiting',$3::jsonb)",
            [
              work,
              a,
              JSON.stringify({
                resource_refs: [{ kind: "opportunity", id: original }],
                instruction: "Follow up on this opportunity",
              }),
            ]
          );
          await db.query("select career_merge_opportunities_v1($1,$2,$3,1,1)", [
            a,
            original,
            canonical,
          ]);
          assert.equal(
            (
              await db.query(
                "select * from career_opportunity_work_v1($1,$2,true)",
                [a, canonical]
              )
            ).rows.length,
            1
          );
          assert.equal(
            (
              await db.query(
                "select * from career_opportunity_work_v1($1,$2)",
                [b, canonical]
              )
            ).rows.length,
            0
          );
          for (const status of ["waiting", "completed"]) {
            await db.query(
              "update talent_external_operations set status=$2 where id=$1",
              [work, status]
            );
            const mine = (
              await db.query<{ id: string }>(
                "select * from career_list_opportunities_v1($1,true,false,0,500,true)",
                [a]
              )
            ).rows;
            assert.ok(mine.some((row) => row.id === canonical));
            assert.ok(!mine.some((row) => row.id === original));
          }
          assert.equal(
            (
              await db.query<{ saved_at: null }>(
                "select saved_at from career_opportunities where id=$1",
                [canonical]
              )
            ).rows[0].saved_at,
            null
          );
          assert.equal(
            (
              await db.query(
                "select * from career_opportunity_work_v1($1,$2,true)",
                [a, canonical]
              )
            ).rows.length,
            0
          );
        }
      );
      await t.test(
        "a second user can discover a public post and assess the linked company with only the relevant dated evidence",
        async () => {
          const { resourcePgliteTransport } =
            await import("../../../../scripts/evaluation/resourcePgliteTransport");
          const { capturePublicSource } = await import("./capture");
          const { readResource, formatResource } = await import("./read");
          const { buildResourceDecisionRequest } = await import("./evaluate");
          const { researchResource } = await import("./research");
          const { runWebSearch } = await import("@/lib/tools/webSearch");
          const { openUrlWithDocumentsCache } =
            await import("@/lib/talentOnboarding/openUrlTool");
          const { readOpportunity, writeOpportunity, listOpportunities, countUnboundOpportunities } =
            await import("../opportunities/store");
          const admin = resourcePgliteTransport(db);
          const markedA = { admin, userId: crypto.randomUUID() },
            markedB = { admin, userId: crypto.randomUUID() };
          await db.query("insert into talent_users(user_id) values ($1),($2)", [
            markedA.userId,
            markedB.userId,
          ]);
          const storePublic = (
            url: string,
            title: string,
            content: string,
            fetchedAt?: string
          ) =>
            capturePublicSource({
              admin,
              url,
              title,
              content,
              source: {
                provider: "exa_public_contents",
                contract: "public-contents",
                coverage: "Public page body.",
                publishedAt: "2026-10-08T00:00:00Z",
                fetchedAt,
              },
            });
          const url =
            "https://www.linkedin.com/posts/zephyr-team-activity-1234";
          const note =
            "Zephyr's Singapore team needs customer onboarding experience.";
          await assert.rejects(
            openUrlWithDocumentsCache({
              admin,
              url,
              exa: { getContents: async () => ({ results: [] }) } as never,
            }),
            /no text for the URL/
          );
          const readOnly = await openUrlWithDocumentsCache({
            admin,
            url,
            exa: {
              getContents: async () => ({
                results: [{ url, title: "Regional expansion", text: note }],
              }),
            } as never,
          });
          assert.equal(readOnly.sourceScope, "unclassified_not_shared");
          assert.equal(readOnly.documentId, null);
          const ownerMessage = (
            await db.query<{ id: number }>(
              "insert into talent_messages(user_id,role,content) values($1,'user',$2) returning id",
              [markedA.userId, `Keep this link for me: ${url}`]
            )
          ).rows[0];
          const messageRef = {
            kind: "message" as const,
            id: String(ownerMessage.id),
          };
          const privateLead = await writeOpportunity(markedA, {
            requestId: "original-link",
            patch: {
              title: "Saved link",
              primary_ref: messageRef,
              body: url,
            },
          });
          assert.match(
            (await readResource(markedA, privateLead.primary_ref)).body,
            /linkedin\.com\/posts/
          );
          assert.equal(
            (await readResource(markedB, privateLead.primary_ref)).status,
            "unavailable"
          );
          assert.equal(
            (await db.query("select id from documents where url=$1", [url]))
              .rows.length,
            0
          );
          const tracked = await writeOpportunity(markedA, {
            id: privateLead.id, requestId: "receipt", expectedRevision: privateLead.revision,
            patch: { application_stage: "applied", evidence_refs: [messageRef] },
          });
          assert.equal(tracked.application_stage, "applied");
          assert.equal(tracked.recommendation_id, null);
          const { recordSearchExecution, readSearchHistory } = await import("./searchHistory");
          const conversationId = crypto.randomUUID();
          await db.query("insert into talent_conversations(id,user_id) values($1,$2)", [conversationId, markedA.userId]);
          await recordSearchExecution("search_resources", {
            source: "companies", query: "consumer community", purpose: "Find a founding team", revisitWhen: "after launch",
          }, { ...markedA, conversationId, channel: "chat" }, { result: { items: [] } });
          const history = await readSearchHistory(markedA, { query: "launch" });
          assert.match(history.modelOutput, /returned 0/);
          assert.match(history.modelOutput, /Reason for the search: Find a founding team/);
          assert.match(history.modelOutput, /Revisit when: after launch/);
          assert.deepEqual((await readSearchHistory(markedB, { query: "launch" })).searches, []);
          const inProgress = await listOpportunities(markedA, { applicationShelf: "applied" });
          assert.deepEqual(inProgress.items.map(row => row.id), [tracked.id]);
          assert.equal((await countUnboundOpportunities(markedA)).applied, 1);
          const ended = await writeOpportunity(markedA, {
            id: tracked.id, requestId: "rejection", expectedRevision: tracked.revision,
            patch: { application_stage: "closed" },
          });
          assert.equal(ended.application_stage, "closed");
          assert.equal((await countUnboundOpportunities(markedA)).applied, 0);
          assert.deepEqual((await listOpportunities(markedA, { applicationShelf: "hidden" })).items.map(row => row.id), [ended.id]);
          assert.equal((await countUnboundOpportunities(markedB)).hidden, 0);
          await assert.rejects(writeOpportunity(markedA, {
            id: tracked.id, requestId: "stale", expectedRevision: tracked.revision,
            patch: { application_stage: "connected" },
          }));
          await assert.rejects(readOpportunity(markedB, tracked.id));
          const newShelf = await db.query<{ id: string }>(
            "select id from career_list_opportunities_v1($1,false,false,0,50,true)", [markedA.userId]
          );
          assert.ok(!newShelf.rows.some(row => row.id === tracked.id));
          const decisionMigration = await readFile(
            "supabase/migrations/20261111020000_candidate_decision_events.sql", "utf8"
          );
          const moveStage = decisionMigration.match(/CREATE OR REPLACE FUNCTION public\.move_talent_role_saved_stage_v1[\s\S]*?\$function\$;/i);
          assert.ok(moveStage);
          await db.exec(moveStage[0]);
          const roleId = crypto.randomUUID(), recommendationId = crypto.randomUUID();
          await db.query("insert into company_roles(role_id,name,source_type) values($1,'Regional team','external')", [roleId]);
          await db.query("insert into talent_opportunity_recommendation(id,talent_id,role_id,saved_stage) values($1,$2,$3,'offer')", [recommendationId, markedA.userId, roleId]);
          await assert.rejects(db.query("update career_opportunities set recommendation_id=$1 where id=$2", [recommendationId, ended.id]), /Reconcile/);
          await db.query("update talent_opportunity_recommendation set saved_stage=null where id=$1", [recommendationId]);
          await db.query("update career_opportunities set recommendation_id=$1 where id=$2", [recommendationId, ended.id]);
          const linked = await db.query("select o.application_stage,r.saved_stage from career_opportunities o join talent_opportunity_recommendation r on r.id=o.recommendation_id where o.id=$1", [ended.id]);
          assert.deepEqual(linked.rows, [{ application_stage: null, saved_stage: "closed" }]);
          const publicSearch = await runWebSearch({
            admin,
            query: "Zephyr regional expansion",
            // The search and page reader are independent provider responses.
            exa: {
              search: async () => ({
                results: [
                  {
                    url,
                    title: "Regional expansion",
                    text: note,
                    publishedDate: "2026-10-08T00:00:00Z",
                  },
                ],
              }),
            } as never,
            logging: {
              admin: {
                from: () => ({ insert: async () => ({ error: null }) }),
              } as never,
            },
          });
          const publicHit = publicSearch.results[0].resourceRef;
          assert.ok(publicHit);
          await recordSearchExecution("web_search", { query: publicSearch.query },
            { ...markedA, conversationId, channel: "chat" }, { result: publicSearch });
          const savedSearch = (await readSearchHistory(markedA, { query: publicSearch.query })).searches[0];
          const { formatLatestCareerSearch } = await import("./searchHistory");
          assert.ok(formatLatestCareerSearch(savedSearch).includes(`operation:${savedSearch.id}`));
          const savedRef = { kind: "operation" as const, id: savedSearch.id };
          const searchOutput = formatResource(await readResource(markedA, savedRef));
          assert.ok(searchOutput.includes(`web_resource:${publicHit.id} revision ${publicHit.revision} — Regional expansion — ${url}`));
          assert.equal((await readResource(markedB, savedRef)).status, "unavailable");
          const opened = await openUrlWithDocumentsCache({
            admin,
            url,
            exa: {
              getContents: async () => {
                throw Error("Freshly stored evidence is available.");
              },
            } as never,
          });
          assert.equal(opened.observationId, publicHit.revision);
          const branch = {
            documentId: opened.documentId,
            observationId: publicHit.revision,
          };
          const patent = await storePublic(
            "https://zephyr.example/patents",
            "Patents",
            "An unrelated battery patent was granted."
          );
          const refs = [branch, patent].map((s) => ({
            kind: "observation",
            id: s.observationId,
          }));
          const company = (
            await db.query<{ value: { companyId: number } }>(
              "select career_upsert_public_company_v1(null,0,$1::jsonb,$2::jsonb) value",
              [
                JSON.stringify({
                  name: "Zephyr",
                  website_url: "https://zephyr.example",
                  description: "Zephyr builds voice software.",
                }),
                JSON.stringify(refs),
              ]
            )
          ).rows[0].value;
          const companyRef = {
            kind: "company" as const,
            id: String(company.companyId),
          };
          const postRef = {
            kind: "web_resource" as const,
            id: String(branch.documentId),
            revision: branch.observationId,
          };
          const opportunityA = await writeOpportunity(markedA, {
            requestId: "zephyr-a",
            patch: {
              title: "Discuss operations",
              body: "Private plan for A",
              primary_ref: postRef,
              evidence_refs: [refs[0]],
            },
          });
          await assert.rejects(
            readOpportunity(markedB, opportunityA.id),
            /unavailable/i
          );
          const hits = await db.query<{ ref: { id: string } }>(
            "select ref from career_search_resources_v1($1,'public_resources','customer onboarding',0,50)",
            [markedB.userId]
          );
          assert.ok(hits.rows.some((hit) => hit.ref.id === postRef.id));
          const directory = await readResource(markedB, companyRef);
          assert.equal(directory.sourceRefs.length, 2);
          assert.match(directory.body, /source fetched: unknown/);
          assert.doesNotMatch(
            directory.body,
            /needs customer onboarding|patent was granted/
          );
          const selected = await readResource(markedB, companyRef, "Singapore");
          assert.deepEqual(selected.sourceRefs, [refs[0]]);
          assert.match(selected.body, /Published: 2026-10-08 09:00/);
          assert.match(selected.body, /source fetched: unknown/);
          const criteria = [
            {
              name: "local_team",
              type: "predicate" as const,
              instructions:
                "Does the public evidence establish a local customer team?",
            },
          ];
          const decision = buildResourceDecisionRequest({
            provider: "openai",
            resource: selected,
            context: [],
            criteria,
          });
          const modelInput =
            decision.input?.find((message) => message.role === "user")
              ?.content ?? "";
          assert.match(modelInput, /Singapore team needs customer onboarding/);
          assert.doesNotMatch(modelInput, /battery patent|Private plan for A/);
          const receipt = await researchResource(markedB, {
            resource: selected,
            questions: [],
            companyEvidenceQuery: "Singapore",
          });
          assert.deepEqual(receipt.searches, []);
          assert.deepEqual(receipt.pageReads, []);
          assert.deepEqual(receipt.failures, []);
          assert.deepEqual(receipt.sourceRefs, [selected.ref, refs[0]]);
          assert.match(
            receipt.modelOutput,
            /Singapore team needs customer onboarding/
          );
          assert.equal(
            (await readResource(markedB, companyRef, "unobserved")).sourceRefs
              .length,
            0
          );
          const opportunityB = await writeOpportunity(markedB, {
            requestId: "zephyr-b",
            patch: {
              title: "Explore customer adoption",
              primary_ref: companyRef,
              evidence_refs: [refs[0]],
            },
          });
          assert.notEqual(opportunityA.id, opportunityB.id);
          const personal = await readResource(markedB, {
            kind: "opportunity",
            id: opportunityB.id,
          });
          assert.deepEqual(personal.sourceRefs, [companyRef, refs[0]]);
          assert.doesNotMatch(formatResource(personal), /Private plan for A/);
          const fromSource = await readResource(
            markedB,
            personal.sourceRefs[1]
          );
          const personalRequest = buildResourceDecisionRequest({
            provider: "openai",
            resource: personal,
            context: [fromSource],
            criteria,
          });
          assert.match(
            personalRequest.input?.find((message) => message.role === "user")
              ?.content ?? "",
            /Zephyr's Singapore team needs customer onboarding/
          );
          let fetched = 0;
          const refreshed = await openUrlWithDocumentsCache({
            admin,
            url,
            maxAgeHours: 0,
            exa: {
              getContents: async (
                _urls: string[],
                options: { maxAgeHours?: number }
              ) => {
                assert.equal(options.maxAgeHours, 0);
                fetched++;
                return {
                  results: [
                    {
                      url,
                      title: "Team update",
                      text: "The Canadian team is now staffing these positions.",
                    },
                  ],
                  statuses: [{ id: url, status: "success", source: "crawled" }],
                };
              },
            } as never,
          });
          assert.equal(fetched, 1);
          assert.notEqual(refreshed.observationId, branch.observationId);
          assert.ok(refreshed.sourceFetchedAt);
          assert.match(refreshed.coverage, /successful crawl/);
          assert.equal(
            (await readResource(markedB, selected.ref, "Singapore")).status,
            "version_unavailable"
          );
          assert.equal(
            (await readResource(markedB, companyRef, "Singapore")).sourceRefs
              .length,
            0
          );
          assert.match(
            (await readResource(markedB, companyRef, "Canadian")).body,
            /now staffing/
          );
        }
      );
      await t.test("reading a complete source survives a later bounded search; each receipt keeps its own evidence", async () => {
        const { resourcePgliteTransport } = await import("../../../../scripts/evaluation/resourcePgliteTransport");
        const { runWebSearch } = await import("@/lib/tools/webSearch");
        const { openUrlWithDocumentsCache } = await import("@/lib/talentOnboarding/openUrlTool");
        const { readResource } = await import("./read");
        const admin = resourcePgliteTransport(db);
        const url = "https://research.example/opening";
        const readerId = crypto.randomUUID();
        await db.query("insert into talent_users(user_id) values ($1)", [readerId]);
        const tail = "Book a 30-minute conversation before applying.";
        const searchText = "x".repeat(15000);
        const fullBody = searchText + "\n" + tail;
        const search = (text: string) => runWebSearch({
          admin, query: "opening",
          exa: { search: async () => ({ results: [{ url, title: "Opening", text }] }) } as never,
          logging: { admin: { from: () => ({ insert: async () => ({ error: null }) }) } as never },
        });
        let fetches = 0;
        const reader = {
          getContents: async () => {
            fetches++;
            return { results: [{ url, text: fullBody }], statuses: [{ id: url, status: "success", source: "crawled" }] };
          },
        } as never;
        const initial = (await search(searchText)).results[0].resourceRef!;
        const read = await openUrlWithDocumentsCache({ admin, url, offset: searchText.length, exa: reader });
        assert.equal(read.markdown.trim(), tail);
        assert.equal(fetches, 1);
        assert.notEqual(read.observationId, initial.revision);

        const updatedPreview = "The search index now advertises an extended application deadline.";
        const later = (await search(updatedPreview)).results[0].resourceRef!;
        assert.equal(later.id, initial.id);
        assert.notEqual(later.revision, read.observationId);
        const reopened = await openUrlWithDocumentsCache({ admin, url, exa: reader });
        assert.equal(fetches, 1);
        assert.equal(reopened.cached, true);
        assert.equal(reopened.markdown, fullBody);
        assert.equal(reopened.observationId, read.observationId);
        assert.equal(Date.parse(reopened.sourceFetchedAt!), Date.parse(read.sourceFetchedAt!));
        assert.equal(Date.parse(reopened.lastSuccessfulCheckAt!), Date.parse(read.lastSuccessfulCheckAt!));
        const versioned = await readResource({ admin, userId: readerId }, later);
        assert.equal(versioned.body, updatedPreview);
        const changedPage = "Applications have closed.";
        const verified = await openUrlWithDocumentsCache({ admin, url, maxAgeHours: 0, exa: {
          async getContents() {
            return { results: [{ url, text: changedPage }], statuses: [{ id: url, status: "success", source: "crawled" }] };
          },
        } as never });
        assert.notEqual(verified.observationId, reopened.observationId);
        assert.equal(verified.markdown, changedPage);
        assert.equal((await readResource({ admin, userId: readerId }, later)).body, updatedPreview);
      });
      await t.test("a previously stored search text without a limit receipt upgrades on its first page read", async () => {
        const { resourcePgliteTransport } = await import("../../../../scripts/evaluation/resourcePgliteTransport");
        const { capturePublicSource } = await import("./capture");
        const { openUrlWithDocumentsCache } = await import("@/lib/talentOnboarding/openUrlTool");
        const admin = resourcePgliteTransport(db);
        const url = "https://research.example/legacy";
        await capturePublicSource({ admin, url, title: "Opening", content: "Previous search text",
          source: { provider: "exa_search", contract: "exa-search-text-v1" } });
        let fetches = 0;
        const exa = { getContents: async () => {
          fetches++;
          return { results: [{ url, text: "Verified page body" }] };
        } } as never;
        assert.equal((await openUrlWithDocumentsCache({ admin, url, exa })).markdown, "Verified page body");
        const reread = await openUrlWithDocumentsCache({ admin, url, exa });
        assert.equal(reread.cached, true);
        assert.equal(reread.markdown, "Verified page body");
        assert.equal(fetches, 1);
      });
    } finally {
      await db.close();
    }
  }
);
