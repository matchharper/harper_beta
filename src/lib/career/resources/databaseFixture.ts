import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { vector } from "@electric-sql/pglite-pgvector";

export const careerFixtureUserA = "00000000-0000-4000-a000-000000000001";
export const careerFixtureUserB = "00000000-0000-4000-a000-000000000002";

/** In-memory fixture for the Career SQL boundaries used by tests and model evaluations. */
export async function createCareerResourceFixture(beforeCompanyDatas?: (db: PGlite) => Promise<void>) {
  const db = new PGlite({ extensions: { vector, pg_trgm } });
  try {
    await db.exec(`create extension vector; create extension pg_trgm;
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
    create table company_db(id bigint generated always as identity primary key,name text,description text,short_description text,specialities text,location text,website_url text,linkedin_url text,linkedin_company_id bigint,founded_year integer,employee_count_range text);
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
    create table official_jobs(id uuid primary key,is_published boolean,role_id uuid,company_name text,company_website_url text);
    create table company_internal_roles(role_id uuid primary key,is_anonymous boolean);
    create table company_workspace(company_workspace_id uuid primary key default gen_random_uuid(),company_name text not null,published_name text,
      company_db_id bigint,career_url text,homepage_url text,linkedin_url text,logo_url text,external_roles_enabled boolean,is_internal boolean,has_career_page boolean,is_scrape_original boolean,
      company_description text,created_at timestamptz default clock_timestamp());
    create table company_data(company_workspace_id uuid primary key references company_workspace(company_workspace_id), total_funding_raised text,
      estimated_average_salary text,last_funding_stage text,search_query text,source_payload jsonb,searched_at timestamptz);
    create table company_user_workspace(company_workspace_id uuid);
    create table company_workspace_teams(company_workspace_id uuid);
    create table company_workspace_invitations(company_workspace_id uuid);
    create table company_roles(role_id uuid primary key default gen_random_uuid(),company_workspace_id uuid,name text,description text,
      external_jd_url text,source_type text,source_provider text,source_job_id text,information jsonb,is_expired boolean,expires_at timestamptz,
      posted_at timestamptz,expired_at timestamptz,description_summary text,title_embedding vector(1536),title_embedding_text text,seniority_level text,country_code text,
      salary_min numeric,salary_max numeric,salary_currency text,salary_period text,salary_is_predicted boolean default false,location_text text,salary_range text,status text,summary jsonb,type text[],work_mode text,updated_at timestamptz default now());
    create function read_career_internal_role_v1(uuid,uuid) returns jsonb language sql as 'select null::jsonb';
    create function current_talent_recommendation_id_v1(uuid) returns uuid language sql as 'select $1';
    insert into talent_users(user_id) values ('${careerFixtureUserA}'),('${careerFixtureUserB}');`);
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
    const importSql = await readFile("supabase/migrations/20261111082523_career_suggest_immediate_recommendation.sql", "utf8");
    await db.exec(importSql.slice(importSql.indexOf("CREATE OR REPLACE FUNCTION"), importSql.indexOf("$function$;") + "$function$;".length));
    await beforeCompanyDatas?.(db);
    await db.exec(await readFile("supabase/migrations/20261117122500_career_company_workspace_marker.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261117122700_career_company_unique_home.sql", "utf8"));
    await db.exec(await readFile(
      "supabase/migrations/20261117123000_career_public_company_datas.sql", "utf8"
    ));
    await db.exec(await readFile("supabase/migrations/20261117123300_career_company_resource_details.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261117123500_career_company_tool_writers.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261117124000_career_company_data_integrity.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261117124500_career_company_topic_evidence.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261117160000_career_company_workspace_hub.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261117201000_career_company_workspace_refs.sql", "utf8"));
    // Only the company functions this schema has; the migration also replaces
    // list and run functions whose tables this fixture does not create.
    const unflagged = await readFile("supabase/migrations/20261118110000_career_stop_using_external_roles_enabled.sql", "utf8");
    for (const name of ["career_index_public_job_v1", "career_write_company_datum_v1", "career_company_workspaces_for_directory_v1"]) {
      const start = unflagged.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
      await db.exec(unflagged.slice(start, unflagged.indexOf("$function$;", start) + "$function$;".length));
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
