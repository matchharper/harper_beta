import { readFile } from "node:fs/promises";
import { setup, owner, role } from "./testSupport";
export const rec = "77777777-7777-4777-8777-777777777777";
export async function setupDaily(beforeMigration?: (db: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  const db = await setup();
  await db.exec(`
    alter table company_workspace add column company_name text,add column published_name text;
    update company_roles set source_type='internal';
    alter table talent_opportunity_delivery add column id uuid primary key default gen_random_uuid(),add column discovery_run_id uuid,add column channel text,add column payload jsonb default '{}',add column updated_at timestamptz,add column error_message text;
    alter table talent_messages add column conversation_id uuid;
    create table career_email_messages(id uuid primary key,talent_id uuid,talent_message_id bigint,direction text,mail_type text,status text,from_email text,to_email text,subject text,body_text text,occurred_at timestamptz,metadata jsonb);
    create function record_company_followup_event_v1(uuid,text,jsonb) returns void language sql as $$select$$;
    create function commit_internal_process_closure_notice_v1(p_metadata jsonb,p_recommendation_id uuid,p_talent_id uuid,p_text text,p_user_id text) returns void language plpgsql as $$begin
      insert into public.talent_progress(talent_id,recommendation_id,kind,metadata) values(p_talent_id,p_recommendation_id,'internal_process_stopped_notified',p_metadata);
      update public.talent_opportunity_recommendation set saved_stage='closed' where id=p_recommendation_id;
    end$$;
    create table talent_opportunity_recommendation(id uuid primary key,talent_id uuid,role_id uuid,feedback text,saved_stage text,processed_stage text,kind text,created_at timestamptz default now());
    create table talent_progress(id uuid primary key default gen_random_uuid(),talent_id uuid,role_id uuid,recommendation_id uuid,kind text,metadata jsonb,text text,user_id text,created_at timestamptz default now());
    create table talent_opportunity_matching_review(id uuid primary key default gen_random_uuid(),talent_id uuid,opportunity_id uuid,decision text,closed_at timestamptz,recommendation_id uuid,discovery_run_id uuid,not_before timestamptz default now());
    create table meeting_schedules(id uuid primary key default gen_random_uuid(),talent_id uuid,status text,version bigint,confirmed_start_at timestamptz,source_refs jsonb default '{}');
    alter table company_talent_followups add column status text default 'pending',add column due_at timestamptz,add column delivery_run_id uuid,add column source_kind text,add column source_id uuid,add column updated_at timestamptz;
    create function company_followup_source_v1(text,uuid) returns jsonb language sql as $$select '{"active":true,"originalSentAt":"2029-12-01"}'::jsonb$$;
    insert into talent_opportunity_recommendation values('${rec}','${owner}','${role}','like','accepted','pending_connection','worker',now());
  `);
  if (beforeMigration) await beforeMigration(db);
  await db.exec(
    await readFile(
      "supabase/migrations/20261104153622_career_daily_processing.sql",
      "utf8"
    )
  );
  await db.exec(await readFile("supabase/migrations/20261104165800_career_explicit_schedule_pause.sql", "utf8"));
  return db;
}
