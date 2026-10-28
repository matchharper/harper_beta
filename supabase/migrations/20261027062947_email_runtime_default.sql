-- All new email work belongs to the shared Career runtime without a rollout flag.
-- Keep active owners and provider checkpoints intact while the old service drains.
BEGIN;

ALTER TABLE public.email_reply_jobs ALTER COLUMN worker_target SET DEFAULT 'vercel_queue';
ALTER TABLE public.contact_queue ALTER COLUMN worker_target SET DEFAULT 'vercel_queue';
ALTER TABLE public.career_email_onboarding_leads ALTER COLUMN worker_target SET DEFAULT 'vercel_queue';

UPDATE public.email_reply_jobs
SET worker_target = 'vercel_queue'
WHERE worker_target = 'legacy' AND status = 'queued';

UPDATE public.contact_queue
SET worker_target = 'vercel_queue'
WHERE worker_target = 'legacy' AND status = 'queued';

UPDATE public.career_email_onboarding_leads
SET worker_target = 'vercel_queue'
WHERE worker_target = 'legacy' AND status = 'active'
  AND review_locked_at IS NULL AND review_locked_by IS NULL;

COMMIT;
