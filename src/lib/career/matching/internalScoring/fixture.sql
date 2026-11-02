-- Isolated local database only. Publication uses the actual migration function.
CREATE TABLE talent_users(user_id uuid PRIMARY KEY, deleted_at timestamptz);
CREATE TABLE talent_conversations(id uuid PRIMARY KEY, user_id uuid);
CREATE TABLE talent_setting(user_id uuid PRIMARY KEY,is_onboarding_done boolean,profile_visibility text,get_internal_recommendation boolean,blocked_companies text[]);
CREATE TABLE talent_profiles(id uuid PRIMARY KEY,talent_id uuid);
CREATE TABLE talent_profile_revisions(profile_id uuid,revision bigint,snapshot jsonb);
CREATE TABLE talent_experiences(talent_id uuid);
CREATE TABLE talent_educations(talent_id uuid);
CREATE TABLE talent_behavior_contexts(talent_id uuid,context_text text,context_version bigint);
CREATE TABLE talent_contexts(talent_id uuid,collection text,label text,content text,revision bigint,ref text,created_at timestamptz,updated_at timestamptz,deleted_at timestamptz);
CREATE TABLE company_workspace(company_workspace_id uuid PRIMARY KEY,company_name text,published_name text,company_description text,brief text,pitch text,company_db_id uuid);
CREATE TABLE company_roles(role_id uuid PRIMARY KEY,company_workspace_id uuid,name text,description text,location_text text,country_code text,work_mode text,type text[],seniority_level text,salary_range text,salary_min numeric,salary_max numeric,salary_currency text,salary_period text,source_type text,status text,is_expired boolean,expires_at timestamptz,information jsonb);
CREATE TABLE company_internal_roles(role_id uuid,request text,criteria jsonb,team_id uuid,memory text);
CREATE TABLE company_memory_entries(id uuid,company_workspace_id uuid,scope text,label text,content text,revision bigint,updated_at timestamptz,deleted_at timestamptz,role_id uuid,team_id uuid);
CREATE TABLE company_memories(id uuid,company_workspace_id uuid,role_id uuid,content text,updated_at timestamptz,created_at timestamptz);
CREATE TABLE opportunity_discovery_run(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),talent_id uuid,conversation_id uuid,trigger text,run_mode text,status text,dedupe_key text UNIQUE,trigger_payload jsonb,coverage jsonb NOT NULL DEFAULT '{}',lease_token uuid,lease_heartbeat_at timestamptz,started_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),completed_at timestamptz,last_progress_at timestamptz,error_message text);
CREATE TABLE company_role_candidate_evaluations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_workspace_id uuid,role_id uuid,talent_id uuid,run_id uuid,discovery_run_id uuid,brief_version text,stage int,input_fingerprint text,assessment jsonb,input_contract_version text,source_profile_id uuid,source_profile_revision bigint,source_material_id uuid,evidence_scope text,evaluated_at timestamptz DEFAULT now());
CREATE TABLE talent_opportunity_recommendation(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),talent_id uuid,role_id uuid,opportunity_type text,kind text,evidence jsonb,fit_reasons jsonb,preference_fit jsonb,tradeoffs jsonb,discovery_run_id uuid,created_at timestamptz DEFAULT now(),feedback text,saved_stage text);
CREATE TABLE talent_opportunity_tag(talent_id uuid,opportunity_id uuid,tag text);
CREATE TABLE talent_progress(talent_id uuid,role_id uuid,recommendation_id uuid,user_id uuid,kind text,text text,metadata jsonb,open_to_company boolean);
CREATE FUNCTION role_matching_slot_type_v1(uuid,timestamptz) RETURNS text LANGUAGE sql AS $$ SELECT 'free'::text $$;
CREATE FUNCTION company_role_search_brief_version_v1(id uuid) RETURNS text LANGUAGE sql AS $$ SELECT md5(request) FROM company_internal_roles WHERE role_id=id $$;
CREATE FUNCTION company_role_search_brief_snapshot_v1(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION read_talent_profile_v1(tid uuid,pid uuid,rev bigint) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('profileId',p.id,'revision',v.revision,'isDefault',true,'snapshot',v.snapshot)
 FROM talent_profiles p JOIN talent_profile_revisions v ON v.profile_id=p.id WHERE p.id=pid AND p.talent_id=tid AND v.revision=rev $$;
