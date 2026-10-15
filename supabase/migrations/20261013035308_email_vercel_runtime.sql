-- Request-scoped email processing. No rollout or data movement is performed by this migration.

ALTER TABLE public.email_reply_jobs ADD COLUMN IF NOT EXISTS worker_target text NOT NULL DEFAULT 'legacy', ADD COLUMN IF NOT EXISTS queue_dispatched_at timestamptz, ADD COLUMN IF NOT EXISTS queue_dispatch_error text;

ALTER TABLE public.contact_queue ADD COLUMN IF NOT EXISTS worker_target text NOT NULL DEFAULT 'legacy', ADD COLUMN IF NOT EXISTS queue_dispatched_at timestamptz, ADD COLUMN IF NOT EXISTS queue_dispatch_error text;

ALTER TABLE public.career_email_onboarding_leads ADD COLUMN IF NOT EXISTS worker_target text NOT NULL DEFAULT 'legacy', ADD COLUMN IF NOT EXISTS queue_dispatched_at timestamptz, ADD COLUMN IF NOT EXISTS queue_dispatch_error text;

CREATE OR REPLACE FUNCTION public.claim_contact_queue_jobs(worker_id text, batch_size integer DEFAULT 10, max_attempts integer DEFAULT 3, stale_after_seconds integer DEFAULT 600)
 RETURNS SETOF contact_queue
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with exhausted as (
    update public.contact_queue job
    set status = 'failed',
        locked_at = null,
        locked_by = null,
        last_error = coalesce(
          nullif(job.last_error, ''),
          'worker_stale_after_max_attempts'
        ),
        updated_at = timezone('utc', now())
    where job.worker_target = 'legacy' and job.status = 'processing'
      and job.attempts >= greatest(1, max_attempts)
      and coalesce(job.locked_at, job.updated_at, job.created_at)
        < timezone('utc', now())
          - make_interval(secs => greatest(60, stale_after_seconds))
    returning job.id
  ),
  picked as (
    select job.id
    from public.contact_queue job
    where job.worker_target = 'legacy' and job.attempts < greatest(1, max_attempts)
      and job.scheduled_at <= timezone('utc', now())
      and (
        job.status = 'queued'
        or (
          job.status = 'processing'
          and coalesce(job.locked_at, job.updated_at, job.created_at)
            < timezone('utc', now())
              - make_interval(secs => greatest(60, stale_after_seconds))
        )
      )
      and not exists (
        select 1 from exhausted where exhausted.id = job.id
      )
    order by job.scheduled_at asc, job.created_at asc
    for update of job skip locked
    limit greatest(1, least(batch_size, 50))
  )
  update public.contact_queue job
  set status = 'processing',
      attempts = job.attempts + 1,
      locked_at = timezone('utc', now()),
      locked_by = nullif(btrim(worker_id), ''),
      last_error = null,
      updated_at = timezone('utc', now())
  from picked
  where job.worker_target = 'legacy' and job.id = picked.id
  returning job.*;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_email_reply_jobs(worker_id text, batch_size integer DEFAULT 5, max_attempts integer DEFAULT 3, stale_after_seconds integer DEFAULT 600)
 RETURNS SETOF email_reply_jobs
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with picked as (
    select id
    from public.email_reply_jobs
    where worker_target = 'legacy' and attempts < greatest(1, max_attempts)
      and (
        status = 'queued'
        or (
          status = 'processing'
          and locked_at < timezone('utc', now()) - make_interval(secs => greatest(60, stale_after_seconds))
        )
      )
    order by created_at asc
    for update skip locked
    limit greatest(1, least(batch_size, 20))
  )
  update public.email_reply_jobs j
     set status = 'processing',
         attempts = attempts + 1,
         locked_at = timezone('utc', now()),
         locked_by = nullif(trim(worker_id), ''),
         last_error = null,
         updated_at = timezone('utc', now())
    from picked
   where j.id = picked.id
  returning j.*;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_career_email_onboarding_reviews(worker_id text, batch_size integer DEFAULT 5, max_attempts integer DEFAULT 3, stale_after_seconds integer DEFAULT 600)
 RETURNS SETOF career_email_onboarding_leads
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with picked as (
    select id
    from public.career_email_onboarding_leads
    where worker_target = 'legacy' and status = 'active'
      and step = 'profile_review_pending'
      and calendar_cta_sent_at is null
      and conversation_id is not null
      and talent_id is not null
      and profile_received_at is not null
      and review_attempts < greatest(1, max_attempts)
      and (
        review_locked_at is null
        or review_locked_at < timezone('utc', now()) - make_interval(secs => greatest(60, stale_after_seconds))
      )
    order by profile_received_at asc, created_at asc
    for update skip locked
    limit greatest(1, least(batch_size, 20))
  )
  update public.career_email_onboarding_leads l
     set review_attempts = review_attempts + 1,
         review_locked_at = timezone('utc', now()),
         review_locked_by = nullif(trim(worker_id), ''),
         last_error = null,
         updated_at = timezone('utc', now())
    from picked
   where l.id = picked.id
  returning l.*;
$function$
;

CREATE INDEX IF NOT EXISTS email_reply_jobs_runtime_dispatch ON public.email_reply_jobs(worker_target, status, created_at);
CREATE INDEX IF NOT EXISTS contact_queue_runtime_dispatch ON public.contact_queue(worker_target, status, scheduled_at);

-- Routing/lease metadata records ownership and dispatch facts, not model plans.
-- Legacy consumers are server workers too; these claims return private job rows.
REVOKE ALL ON FUNCTION public.claim_email_reply_jobs(text,integer,integer,integer), public.claim_career_email_onboarding_reviews(text,integer,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_reply_jobs(text,integer,integer,integer), public.claim_career_email_onboarding_reviews(text,integer,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.dispatch_email_runtime_jobs_v1(p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb := '[]'; rows jsonb;
BEGIN
  WITH picked AS (
    SELECT id FROM email_reply_jobs
    WHERE (status='queued' OR (worker_target='vercel_queue' AND status='processing' AND locked_at < now()-interval '10 minutes'))
      AND (queue_dispatched_at IS NULL OR queue_dispatched_at < now()-interval '2 minutes')
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limit,50))
  ), adopted AS (
    UPDATE email_reply_jobs j SET worker_target='vercel_queue',queue_dispatched_at=now(),queue_dispatch_error=null
    FROM picked p WHERE j.id=p.id RETURNING j.id
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('version',1,'kind','reply','jobId',id)),'[]') INTO rows FROM adopted;
  result := result || rows;
  WITH picked AS (
    SELECT id FROM contact_queue
    WHERE scheduled_at <= now() AND (status='queued' OR (worker_target='vercel_queue' AND status='processing' AND coalesce(locked_at,updated_at)<now()-interval '10 minutes'))
      AND (queue_dispatched_at IS NULL OR queue_dispatched_at < now()-interval '2 minutes')
    ORDER BY scheduled_at,created_at FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limit,50))
  ), adopted AS (
    UPDATE contact_queue j SET worker_target='vercel_queue',queue_dispatched_at=now(),queue_dispatch_error=null
    FROM picked p WHERE j.id=p.id RETURNING j.id
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('version',1,'kind','contact','jobId',id)),'[]') INTO rows FROM adopted;
  result := result || rows;
  WITH picked AS (
    SELECT id FROM career_email_onboarding_leads
    WHERE status='active' AND step='profile_review_pending' AND calendar_cta_sent_at IS NULL
      AND conversation_id IS NOT NULL AND talent_id IS NOT NULL AND profile_received_at IS NOT NULL
      AND (review_locked_at IS NULL OR (worker_target='vercel_queue' AND review_locked_at<now()-interval '10 minutes'))
      AND (queue_dispatched_at IS NULL OR queue_dispatched_at<now()-interval '2 minutes')
    ORDER BY profile_received_at FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limit,50))
  ), adopted AS (
    UPDATE career_email_onboarding_leads j SET worker_target='vercel_queue',queue_dispatched_at=now(),queue_dispatch_error=null
    FROM picked p WHERE j.id=p.id RETURNING j.id
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('version',1,'kind','onboarding_review','jobId',id)),'[]') INTO rows FROM adopted;
  RETURN result || rows;
END $$;

CREATE OR REPLACE FUNCTION public.claim_email_runtime_job_v1(p_kind text,p_id uuid,p_owner text,p_max_attempts integer DEFAULT 3,p_max_in_flight integer DEFAULT 4)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t text; j jsonb; attempts integer; locked timestamptz; v_status text; v_delivered boolean;
BEGIN
  t := CASE p_kind WHEN 'reply' THEN 'email_reply_jobs' WHEN 'contact' THEN 'contact_queue' WHEN 'onboarding_review' THEN 'career_email_onboarding_leads' ELSE NULL END;
  IF t IS NULL OR nullif(btrim(p_owner),'') IS NULL THEN RAISE EXCEPTION 'invalid_email_runtime_claim'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('harper:email-runtime:claim'));
  EXECUTE format('SELECT to_jsonb(j) FROM public.%I j WHERE id=$1 FOR UPDATE',t) INTO j USING p_id;
  IF j IS NULL THEN RETURN jsonb_build_object('state','missing'); END IF;
  IF j->>'worker_target' <> 'vercel_queue' THEN RETURN jsonb_build_object('state','other_runtime'); END IF;
  IF p_kind='onboarding_review' THEN
    IF j->>'status'<>'active' OR j->>'step'<>'profile_review_pending' OR j->>'calendar_cta_sent_at' IS NOT NULL THEN RETURN jsonb_build_object('state','terminal'); END IF;
    attempts := (j->>'review_attempts')::integer; locked := (j->>'review_locked_at')::timestamptz;
  ELSE
    v_status := j->>'status';
    IF v_status NOT IN ('queued','processing') THEN RETURN jsonb_build_object('state','terminal'); END IF;
    IF p_kind='contact' AND (j->>'scheduled_at')::timestamptz>now() THEN RETURN jsonb_build_object('state','not_due'); END IF;
    attempts := (j->>'attempts')::integer;
    locked := CASE WHEN v_status='processing' THEN (j->>'locked_at')::timestamptz ELSE NULL END;
  END IF;
  IF locked IS NOT NULL AND locked>now()-interval '10 minutes' THEN RETURN jsonb_build_object('state','busy'); END IF;
  IF p_kind IN ('reply','onboarding_review') AND j->>'conversation_id' IS NOT NULL AND (EXISTS (
    SELECT 1 FROM email_reply_jobs other WHERE other.id<>p_id AND other.conversation_id=(j->>'conversation_id')::uuid
      AND other.status='processing' AND (other.worker_target='legacy' OR other.locked_at>now()-interval '10 minutes')
  ) OR EXISTS (
    SELECT 1 FROM career_email_onboarding_leads other WHERE (p_kind<>'onboarding_review' OR other.id<>p_id)
      AND other.conversation_id=(j->>'conversation_id')::uuid AND other.status='active' AND other.step='profile_review_pending'
      AND other.review_locked_by IS NOT NULL AND (other.worker_target='legacy' OR other.review_locked_at>now()-interval '10 minutes')
  )) THEN RETURN jsonb_build_object('state','busy'); END IF;
  IF (
    (SELECT count(*) FROM email_reply_jobs WHERE worker_target='vercel_queue' AND status='processing' AND locked_at>now()-interval '10 minutes')
    + (SELECT count(*) FROM contact_queue WHERE worker_target='vercel_queue' AND status='processing' AND locked_at>now()-interval '10 minutes')
    + (SELECT count(*) FROM career_email_onboarding_leads WHERE worker_target='vercel_queue' AND status='active' AND step='profile_review_pending' AND review_locked_at>now()-interval '10 minutes')
  ) >= greatest(1,least(p_max_in_flight,100)) THEN RETURN jsonb_build_object('state','capacity'); END IF;
  v_delivered := nullif(j->>'resend_email_id','') IS NOT NULL OR nullif(j->'metadata'->>'reviewProviderId','') IS NOT NULL OR coalesce(j->'metadata'->'referralProviderIds','{}')<>'{}'::jsonb;
  IF attempts>=greatest(1,p_max_attempts) AND NOT v_delivered THEN
    EXECUTE format('UPDATE public.%I SET status=''failed'',last_error=''retry_budget_exhausted'',updated_at=now() WHERE id=$1',t) USING p_id;
    RETURN jsonb_build_object('state','exhausted');
  END IF;
  IF p_kind='onboarding_review' THEN
    UPDATE career_email_onboarding_leads SET review_attempts=review_attempts+CASE WHEN v_delivered THEN 0 ELSE 1 END,review_locked_at=now(),review_locked_by=p_owner,last_error=null,updated_at=now() WHERE id=p_id RETURNING to_jsonb(career_email_onboarding_leads) INTO j;
  ELSE
    EXECUTE format('UPDATE public.%I SET status=''processing'',attempts=attempts+$3,locked_at=now(),locked_by=$2,last_error=null,updated_at=now() WHERE id=$1 RETURNING to_jsonb(%I)',t,t) INTO j USING p_id,p_owner,CASE WHEN v_delivered THEN 0 ELSE 1 END;
  END IF;
  RETURN jsonb_build_object('state','claimed','job',j);
END $$;

CREATE OR REPLACE FUNCTION public.persist_email_runtime_message_v1(p_job_id uuid,p_owner text,p_talent_id uuid,p_conversation_id uuid,p_role text,p_content text,p_metadata jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j email_reply_jobs; m talent_messages; message_id bigint;
BEGIN
  SELECT * INTO j FROM email_reply_jobs WHERE id=p_job_id AND worker_target='vercel_queue' AND status='processing' AND locked_by=p_owner FOR UPDATE;
  IF j.id IS NULL THEN RAISE EXCEPTION 'email_runtime_lease_lost'; END IF;
  IF p_role NOT IN ('user','assistant') THEN RAISE EXCEPTION 'invalid_email_message_role'; END IF;
  PERFORM 1 FROM talent_conversations WHERE id=p_conversation_id AND user_id=p_talent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'email_conversation_not_owned'; END IF;
  IF p_role='user' AND EXISTS(SELECT 1 FROM email_reply_jobs WHERE id<>p_job_id AND status='processing' AND conversation_id=p_conversation_id AND (worker_target='legacy' OR locked_at>now()-interval '10 minutes')) THEN RAISE EXCEPTION 'email_conversation_busy'; END IF;
  IF p_role='user' AND EXISTS(SELECT 1 FROM career_email_onboarding_leads WHERE conversation_id=p_conversation_id AND status='active' AND step='profile_review_pending' AND review_locked_by IS NOT NULL AND (worker_target='legacy' OR review_locked_at>now()-interval '10 minutes')) THEN RAISE EXCEPTION 'email_conversation_busy'; END IF;
  IF j.talent_id IS NOT NULL AND j.talent_id<>p_talent_id THEN RAISE EXCEPTION 'email_talent_mismatch'; END IF;
  message_id := CASE WHEN p_role='user' THEN j.user_message_id ELSE j.assistant_message_id END;
  IF message_id IS NOT NULL THEN
    SELECT * INTO m FROM talent_messages WHERE id=message_id AND user_id=p_talent_id AND conversation_id=p_conversation_id AND role=p_role;
    IF m.id IS NULL THEN RAISE EXCEPTION 'email_saved_message_not_owned'; END IF;
  ELSE
    INSERT INTO talent_messages(conversation_id,user_id,role,content,message_type) VALUES(p_conversation_id,p_talent_id,p_role,p_content,'mail') RETURNING * INTO m;
  END IF;
  UPDATE email_reply_jobs SET talent_id=p_talent_id,conversation_id=p_conversation_id,
    user_message_id=CASE WHEN p_role='user' THEN m.id ELSE user_message_id END,
    assistant_message_id=CASE WHEN p_role='assistant' THEN m.id ELSE assistant_message_id END,
    metadata=metadata||coalesce(p_metadata,'{}'),updated_at=now() WHERE id=p_job_id;
  RETURN to_jsonb(m);
END $$;

REVOKE ALL ON FUNCTION public.dispatch_email_runtime_jobs_v1(integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_email_runtime_job_v1(text,uuid,text,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.persist_email_runtime_message_v1(uuid,text,uuid,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_email_runtime_jobs_v1(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_email_runtime_job_v1(text,uuid,text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.persist_email_runtime_message_v1(uuid,text,uuid,uuid,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_email_contact_delivery_v1(p_job_id uuid,p_owner text,p_provider_id text,p_delivery jsonb,p_copy jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j contact_queue; m talent_messages; v_conversation uuid; v_message bigint; v_metadata jsonb; v_round uuid;
BEGIN
  SELECT * INTO j FROM contact_queue WHERE id=p_job_id AND worker_target='vercel_queue' FOR UPDATE;
  IF j.id IS NULL OR j.resend_email_id IS DISTINCT FROM p_provider_id THEN RAISE EXCEPTION 'email_delivery_not_checkpointed'; END IF;
  IF j.status='sent' THEN RETURN jsonb_build_object('sent',true,'alreadyFinalized',true); END IF;
  IF j.locked_by IS DISTINCT FROM p_owner AND j.status<>'cancelled' THEN RAISE EXCEPTION 'email_runtime_lease_lost'; END IF;
  v_conversation := (p_copy->>'conversationId')::uuid;
  PERFORM 1 FROM talent_conversations WHERE id=v_conversation AND user_id=j.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'email_conversation_not_owned'; END IF;
  v_metadata := coalesce(p_copy->'metadata','{}') || jsonb_build_object('contactQueueId',j.id,'replyTo',p_delivery->>'replyTo','resendEmailId',p_provider_id);
  IF j.type NOT IN ('crm_broadcast','meeting_schedule_candidate_invitation') THEN
    v_message := coalesce(nullif(j.payload->>'runtimeMessageId','')::bigint,nullif(j.payload->'delivery'->>'talentMessageId','')::bigint);
    IF v_message IS NULL THEN
      INSERT INTO talent_messages(conversation_id,user_id,role,content,message_type) VALUES(v_conversation,j.user_id,'assistant',p_copy->>'body','mail') RETURNING id INTO v_message;
    ELSE
      PERFORM 1 FROM talent_messages WHERE id=v_message AND user_id=j.user_id AND conversation_id=v_conversation AND role='assistant';
      IF NOT FOUND THEN RAISE EXCEPTION 'email_saved_message_not_owned'; END IF;
    END IF;
    INSERT INTO career_email_messages(talent_id,talent_message_id,direction,mail_type,status,from_email,to_email,subject,body_text,metadata)
    VALUES(j.user_id,v_message,'outbound',p_copy->>'mailType','sent',p_delivery->>'from',p_delivery->>'to',p_delivery->>'subject',p_copy->>'body',v_metadata)
    ON CONFLICT(talent_message_id) WHERE talent_message_id IS NOT NULL DO UPDATE SET status='sent',metadata=excluded.metadata;
  ELSE
    INSERT INTO career_email_messages(id,talent_id,direction,mail_type,status,from_email,to_email,subject,body_text,metadata)
    VALUES(j.id,j.user_id,'outbound',p_copy->>'mailType','sent',p_delivery->>'from',p_delivery->>'to',p_delivery->>'subject',p_delivery->>'text',v_metadata)
    ON CONFLICT(id) DO UPDATE SET status='sent',metadata=excluded.metadata;
  END IF;
  UPDATE contact_queue SET status='sent',sent_at=coalesce(sent_at,now()),cancelled_at=null,locked_at=null,locked_by=null,last_error=null,
    payload=(CASE WHEN j.type='meeting_schedule_candidate_invitation' THEN jsonb_set(payload,'{body}',to_jsonb('[redacted after delivery]'::text),false) ELSE payload END)||jsonb_build_object('runtimeMessageId',v_message),updated_at=now() WHERE id=j.id;
  UPDATE talent_conversations SET updated_at=now() WHERE id=v_conversation AND user_id=j.user_id;
  IF j.type='company_request_candidate_delivery' THEN
    UPDATE company_talent_requests SET workflow_status='awaiting_talent',expires_at='infinity'::timestamptz WHERE id=j.company_talent_request_id AND talent_id=j.user_id AND workflow_status='queued';
  ELSIF j.type='meeting_schedule_candidate_invitation' THEN
    v_round := (j.payload->>'meetingScheduleRoundId')::uuid;
    UPDATE meeting_schedule_rounds SET status='sent',updated_at=now() WHERE id=v_round AND delivery_queue_id=j.id AND status='queued';
  END IF;
  RETURN jsonb_build_object('sent',true,'messageId',v_message);
END $$;
REVOKE ALL ON FUNCTION public.finalize_email_contact_delivery_v1(uuid,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_email_contact_delivery_v1(uuid,text,text,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.record_email_runtime_audit_v1(p_row jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF nullif(p_row->>'talent_message_id','') IS NOT NULL THEN
    INSERT INTO career_email_messages(id,talent_id,talent_message_id,inbound_event_id,reply_job_id,direction,mail_type,status,from_email,to_email,subject,body_text,occurred_at,metadata)
    VALUES((p_row->>'id')::uuid,(p_row->>'talent_id')::uuid,(p_row->>'talent_message_id')::bigint,(p_row->>'inbound_event_id')::uuid,(p_row->>'reply_job_id')::uuid,p_row->>'direction',p_row->>'mail_type',p_row->>'status',p_row->>'from_email',p_row->>'to_email',p_row->>'subject',p_row->>'body_text',coalesce((p_row->>'occurred_at')::timestamptz,now()),coalesce(p_row->'metadata','{}'))
    ON CONFLICT(talent_message_id) WHERE talent_message_id IS NOT NULL DO UPDATE SET body_text=excluded.body_text,mail_type=excluded.mail_type,status=excluded.status,metadata=excluded.metadata,subject=excluded.subject,to_email=excluded.to_email,from_email=excluded.from_email;
  ELSE
    INSERT INTO career_email_messages(id,talent_id,inbound_event_id,reply_job_id,direction,mail_type,status,from_email,to_email,subject,body_text,occurred_at,metadata)
    VALUES((p_row->>'id')::uuid,(p_row->>'talent_id')::uuid,(p_row->>'inbound_event_id')::uuid,(p_row->>'reply_job_id')::uuid,p_row->>'direction',p_row->>'mail_type',p_row->>'status',p_row->>'from_email',p_row->>'to_email',p_row->>'subject',p_row->>'body_text',coalesce((p_row->>'occurred_at')::timestamptz,now()),coalesce(p_row->'metadata','{}'))
    ON CONFLICT(id) DO UPDATE SET status=excluded.status,metadata=excluded.metadata;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.record_email_runtime_audit_v1(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_email_runtime_audit_v1(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_email_onboarding_review_v1(p_lead_id uuid,p_owner text,p_provider_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l career_email_onboarding_leads; d jsonb; v_body text; v_message bigint; v_ok boolean;
BEGIN
  SELECT * INTO l FROM career_email_onboarding_leads WHERE id=p_lead_id AND worker_target='vercel_queue' FOR UPDATE;
  IF l.id IS NULL OR l.review_locked_by IS DISTINCT FROM p_owner THEN RAISE EXCEPTION 'email_runtime_lease_lost'; END IF;
  IF l.metadata->>'reviewProviderId' IS DISTINCT FROM p_provider_id THEN RAISE EXCEPTION 'email_delivery_not_checkpointed'; END IF;
  d := l.metadata->'reviewDelivery'; v_body := l.metadata->>'reviewBody'; v_ok := coalesce((l.metadata->>'profileIngested')::boolean,false);
  PERFORM 1 FROM talent_conversations WHERE id=l.conversation_id AND user_id=l.talent_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'email_conversation_not_owned'; END IF;
  v_message := nullif(l.metadata->>'reviewMessageId','')::bigint;
  IF v_message IS NULL THEN
    INSERT INTO talent_messages(conversation_id,user_id,role,content,message_type) VALUES(l.conversation_id,l.talent_id,'assistant',v_body,'email_onboarding') RETURNING id INTO v_message;
  END IF;
  INSERT INTO career_email_messages(talent_id,talent_message_id,direction,mail_type,status,from_email,to_email,subject,body_text,metadata)
  VALUES(l.talent_id,v_message,'outbound',CASE WHEN v_ok THEN 'onboarding_review' ELSE 'onboarding_profile_ingestion_failed' END,'sent',d->>'from',d->>'to',d->>'subject',v_body,jsonb_build_object('replyTo',l.reply_alias,'resendEmailId',p_provider_id,'ingestionOk',v_ok))
  ON CONFLICT(talent_message_id) WHERE talent_message_id IS NOT NULL DO UPDATE SET status='sent',metadata=excluded.metadata;
  UPDATE career_email_onboarding_leads SET review_email_resend_id=p_provider_id,
    calendar_cta_sent_at=CASE WHEN v_ok THEN now() ELSE calendar_cta_sent_at END,
    profile_ingested_at=CASE WHEN v_ok THEN now() ELSE profile_ingested_at END,
    review_locked_at=null,review_locked_by=null,step=CASE WHEN v_ok THEN 'calendar_cta_sent' ELSE 'awaiting_profile' END,
    metadata=metadata||jsonb_build_object('reviewMessageId',v_message),updated_at=now() WHERE id=l.id;
  UPDATE talent_conversations SET updated_at=now() WHERE id=l.conversation_id AND user_id=l.talent_id;
  INSERT INTO career_email_onboarding_events(lead_id,local_id,normalized_email_hash,event_type,metadata)
  VALUES(l.id,l.local_id,l.metadata->>'reviewEventEmailHash',CASE WHEN v_ok THEN 'calendar_cta_sent' ELSE 'profile_ingestion_failed' END,coalesce(l.metadata->'reviewEventData','{}')||jsonb_build_object('resendEmailId',p_provider_id));
END $$;
REVOKE ALL ON FUNCTION public.finalize_email_onboarding_review_v1(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_email_onboarding_review_v1(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_email_intro_capture_v1(p_job_id uuid,p_owner text,p_thread_id uuid,p_row jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j email_reply_jobs; t org_intro_email_threads;
BEGIN
  SELECT * INTO j FROM email_reply_jobs WHERE id=p_job_id AND worker_target='vercel_queue' FOR UPDATE;
  IF j.id IS NULL THEN RAISE EXCEPTION 'email_runtime_lease_lost'; END IF;
  IF j.status='skipped' AND j.skip_reason='org_intro_capture_saved' THEN RETURN; END IF;
  IF j.status<>'processing' OR j.locked_by IS DISTINCT FROM p_owner THEN RAISE EXCEPTION 'email_runtime_lease_lost'; END IF;
  SELECT * INTO t FROM org_intro_email_threads WHERE id=p_thread_id AND status='active' FOR UPDATE;
  IF t.id IS NULL OR NOT EXISTS(SELECT 1 FROM unnest(t.participant_emails) e WHERE lower(btrim(e))=lower(btrim(p_row->>'from_email'))) THEN RAISE EXCEPTION 'email_intro_sender_not_participant'; END IF;
  IF (p_row->>'id')::uuid<>j.id OR (p_row->>'talent_id')::uuid<>t.talent_id OR p_row->>'to_email'<>t.capture_address THEN RAISE EXCEPTION 'email_intro_capture_mismatch'; END IF;
  IF NOT EXISTS(SELECT 1 FROM career_email_messages WHERE id=j.id) THEN
    PERFORM record_email_runtime_audit_v1(p_row);
    UPDATE org_intro_email_threads SET message_count=message_count+1,last_message_at=greatest(coalesce(last_message_at,'-infinity'::timestamptz),coalesce((p_row->>'occurred_at')::timestamptz,now())),updated_at=now() WHERE id=t.id;
  END IF;
  UPDATE email_reply_jobs SET talent_id=t.talent_id,status='skipped',skip_reason='org_intro_capture_saved',processed_at=now(),locked_at=null,locked_by=null,updated_at=now() WHERE id=j.id;
END $$;
REVOKE ALL ON FUNCTION public.record_email_intro_capture_v1(uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_email_intro_capture_v1(uuid,text,uuid,jsonb) TO service_role;
