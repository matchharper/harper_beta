-- Extend durable reply identity; messages/jobs retain conversation and delivery facts.
ALTER TABLE public.email_reply_aliases ALTER COLUMN talent_id DROP NOT NULL;
ALTER TABLE public.email_reply_aliases
  ADD COLUMN company_user_id uuid REFERENCES public.company_users(user_id) ON DELETE CASCADE,
  ADD COLUMN company_workspace_id uuid REFERENCES public.company_workspace(company_workspace_id) ON DELETE CASCADE,
  ADD COLUMN company_conversation_id uuid REFERENCES public.company_conversations(id) ON DELETE CASCADE,
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}';
-- Prevent a token from authorizing two audiences or a company/talent cross-link.
ALTER TABLE public.email_reply_aliases ADD CONSTRAINT email_reply_alias_owner CHECK (
  (talent_id IS NOT NULL AND company_user_id IS NULL AND company_workspace_id IS NULL AND company_conversation_id IS NULL)
  OR (talent_id IS NULL AND company_user_id IS NOT NULL AND company_workspace_id IS NOT NULL
      AND company_conversation_id IS NOT NULL AND conversation_id IS NULL AND company_talent_request_id IS NULL)
);
-- An outbound provider key must keep the exact same reply route on retries.
CREATE UNIQUE INDEX company_email_outbound_identity
ON public.email_reply_aliases ((metadata->>'companyOutboundKey'))
WHERE company_user_id IS NOT NULL AND metadata->>'companyOutboundKey' IS NOT NULL;
-- Legacy talent-only pollers must not consume company replies during rollout.
CREATE FUNCTION public.route_company_email_job_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.metadata->>'companyEmail' = 'true' THEN NEW.worker_target := 'vercel_queue'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER route_company_email_job BEFORE INSERT OR UPDATE OF metadata, worker_target
ON public.email_reply_jobs FOR EACH ROW EXECUTE FUNCTION public.route_company_email_job_v1();
-- Source and terminal response identities survive retries and process crashes.
CREATE UNIQUE INDEX company_message_email_reply_identity
ON public.company_messages ((metadata->>'emailReplyJobId'), role)
WHERE metadata->>'emailReplyJobId' IS NOT NULL;
CREATE FUNCTION public.persist_company_email_source_v1(
  p_job_id uuid, p_owner text, p_alias_id uuid, p_content text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j email_reply_jobs; a email_reply_aliases; c company_conversations; m company_messages;
BEGIN
  SELECT * INTO j FROM email_reply_jobs WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND OR j.status<>'processing' OR j.locked_by IS DISTINCT FROM p_owner
      OR j.worker_target<>'vercel_queue' THEN RAISE EXCEPTION 'email_runtime_lease_lost'; END IF;
  SELECT * INTO a FROM email_reply_aliases WHERE id=p_alias_id AND company_user_id IS NOT NULL;
  IF NOT FOUND OR (a.expires_at IS NOT NULL AND a.expires_at<=now()) THEN RAISE EXCEPTION 'company_email_alias_invalid'; END IF;
  SELECT * INTO c FROM company_conversations WHERE id=a.company_conversation_id
    AND company_workspace_id=a.company_workspace_id AND role_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'company_email_conversation_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM company_user_workspace WHERE company_user_id=a.company_user_id
      AND company_workspace_id=a.company_workspace_id) THEN RAISE EXCEPTION 'company_email_membership_revoked'; END IF;
  IF EXISTS(SELECT 1 FROM email_reply_jobs other WHERE other.id<>p_job_id AND other.status='processing'
      AND other.locked_at>now()-interval '10 minutes'
      AND other.metadata->>'companyConversationId'=c.id::text)
    THEN RAISE EXCEPTION 'company_email_conversation_busy'; END IF;
  IF j.metadata->>'companyAliasId' IS NOT NULL AND j.metadata->>'companyAliasId'<>a.id::text
    THEN RAISE EXCEPTION 'company_email_identity_changed'; END IF;
  SELECT * INTO m FROM company_messages WHERE metadata->>'emailReplyJobId'=j.id::text AND role='user';
  IF FOUND THEN
    IF m.conversation_id<>c.id OR m.company_user_id<>a.company_user_id THEN RAISE EXCEPTION 'company_email_source_mismatch'; END IF;
  ELSE
    INSERT INTO company_messages(company_workspace_id,conversation_id,company_user_id,role,content,message_type,status,metadata)
      VALUES(a.company_workspace_id,c.id,a.company_user_id,'user',p_content,'chat','completed',
        jsonb_build_object('emailReplyJobId',j.id,'emailAliasId',a.id,'emailInboundEventId',j.inbound_event_id,'source','company_email')) RETURNING * INTO m;
    UPDATE company_conversations SET last_message_id=m.id,last_message_at=m.created_at,updated_at=now() WHERE id=c.id;
  END IF;
  UPDATE email_reply_jobs SET metadata=metadata || jsonb_build_object('companyEmail',true,'companyAliasId',a.id,
    'companyConversationId',c.id,'companyUserMessageId',m.id),updated_at=now() WHERE id=j.id;
  RETURN to_jsonb(m);
END $$;
REVOKE ALL ON FUNCTION public.persist_company_email_source_v1(uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.persist_company_email_source_v1(uuid,text,uuid,text) TO service_role;
