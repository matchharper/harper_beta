import "server-only";

import type { GtmReadSql } from "../db.server";

/**
 * `gtm_signups (mail_id text, at timestamptz)`: when a GTM mail's link led to a new Harper account, i.e. the first
 * career_signup_completed log (auth/bootstrap) whose landing page was that mail's link (/career?gtm=<mail id>). #5 가입
 * counts from here (Shaun 11/19: 가입 = 계정을 만든 때), not only from the mail's claim, which waits for the onboarding
 * submit. Use as `with gtm_signups as materialized ${gtmSignupsCte(sql)}`.
 */
export function gtmSignupsCte(sql: GtmReadSql): ReturnType<GtmReadSql> {
  return sql`(
    select lower(substring(l.meta_data->>'landingPath' from 'gtm=([0-9a-fA-F-]{36})')) as mail_id, min(l.created_at) as at
    from public.logs l
    where l.type = 'career_signup_completed' and l.meta_data->>'landingPath' like '%gtm=%'
    group by 1
  )` as unknown as ReturnType<GtmReadSql>;
}
