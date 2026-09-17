"""Transactional GTM integration checks. All schema and fixture writes are rolled back.

Uses the configured PostgreSQL connection, never changes product/user records.
Run from harper_beta: python3 scripts/contents-engine/test_db.py
"""
from pathlib import Path
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
import uuid
import psycopg
from psycopg.types.json import Jsonb
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = [
    ROOT / 'supabase/migrations/20260916130000_gtm_contents_engine.sql',
    ROOT / 'supabase/migrations/20260916131000_gtm_performance.sql',
    ROOT / 'supabase/migrations/20260917032009_gtm_creator_operating_view.sql',
    ROOT / 'supabase/migrations/20260917041000_gtm_sheet_operating_views.sql',
    ROOT / 'supabase/migrations/20260917052200_gtm_creator_overview_sheet_fields.sql',
    ROOT / 'supabase/migrations/20260917055533_gtm_format_bank_outreach_templates.sql',
    ROOT / 'supabase/migrations/20260917064500_gtm_creator_outreach_score.sql',
    ROOT / 'supabase/migrations/20260917075510_gtm_outreach_dispatches.sql',
    ROOT / 'supabase/migrations/20260917090000_gtm_outreach_reply_triage.sql',
]


def main():
    url = dotenv_values(ROOT.parent / 'worker.env')['DATABASE_URL']
    checks = []
    with psycopg.connect(url, connect_timeout=10,
                         options='-c statement_timeout=30000 -c lock_timeout=3000') as conn:
        try:
            exists = conn.execute("select to_regclass('public.gtm_creators')").fetchone()[0]
            if not exists:
                for migration in MIGRATIONS:
                    conn.execute(migration.read_text())
            else:
                # Test the working copy of existing GTM functions, still inside the rollback.
                # Exercise the newest checked-in API definition that includes
                # format-bank and outreach-template entities.
                sql = MIGRATIONS[5].read_text()
                start = sql.index('create or replace function public.gtm_api(')
                end = sql.index('end $$;', start) + len('end $$;')
                conn.execute(sql[start:end])
                conn.execute(MIGRATIONS[1].read_text().replace('create function', 'create or replace function'))
                # Older operating views are already live. Replacing a view that
                # expands another view with `*` can reorder columns after a later
                # additive migration, so exercise only the forward migration
                # under test against the current schema.
                conn.execute(MIGRATIONS[-2].read_text())
                conn.execute(MIGRATIONS[-1].read_text())
            token = secrets.token_urlsafe(32)
            conn.execute('insert into public.gtm_access_tokens(name,token_hash,can_write,expires_at) values(%s,%s,true,now()+interval \'1 hour\')',
                         ('GTM transactional test', hashlib.sha256(token.encode()).hexdigest()))

            def api(action, entity=None, data=None, record=None, request_id=None, access=token):
                return conn.execute('select public.gtm_api(%s,%s,%s,%s,%s,%s,%s)', (
                    access, action, entity, record['id'] if record else None,
                    record['row_version'] if record else None, Jsonb(data or {}),
                    request_id or uuid.uuid4(),
                )).fetchone()[0]

            def sheet(view, record_id=None, access=token):
                return conn.execute(
                    'select public.gtm_sheet_view(%s::text,%s::text,%s::uuid,%s::integer,%s::integer)',
                    (access, view, record_id, 500, 0),
                ).fetchone()[0]

            def rejects(name, call):
                conn.execute('savepoint expected_failure')
                try:
                    call()
                except psycopg.Error:
                    conn.execute('rollback to savepoint expected_failure')
                    checks.append(name)
                else:
                    raise AssertionError(f'Expected rejection: {name}')
                finally:
                    conn.execute('release savepoint expected_failure')

            rejects('invalid token', lambda: api('list', 'gtm_creators', access='invalid'))
            rejects('invalid Sheet token', lambda: sheet('creator_directory', access='invalid'))
            rejects('access tokens are not exposed', lambda: api('list', 'gtm_access_tokens'))
            request_id = uuid.uuid4()
            creator_data = {'name': 'GTM rollback fixture', 'activity_regions': ['KR'], 'content_topics': ['career']}
            creator = api('save', 'gtm_creators', creator_data, request_id=request_id)['record']
            repeated = api('save', 'gtm_creators', creator_data, request_id=request_id)['record']
            assert creator['id'] == repeated['id']
            checks.append('same logical write is idempotent')
            rejects('changed idempotent input', lambda: api('save', 'gtm_creators', {'name': 'Different'}, request_id=request_id))
            changed = api('save', 'gtm_creators', {'notes': 'verified edit'}, record=creator)['record']
            rejects('stale row version', lambda: api('save', 'gtm_creators', {'notes': 'stale'}, record=creator))
            rejects('immutable identity', lambda: api('save', 'gtm_creators', {'ref': 42}, record=changed))
            primary_contact_id = str(uuid.uuid4())
            changed = api('patch_item', 'gtm_creators', {'field': 'contacts', 'item': {
                'id': primary_contact_id, 'channel': 'email',
                'address': 'fixture@example.test', 'source_ref': 'transactional-fixture',
                'as_of': datetime.now(timezone.utc).isoformat(), 'status': 'active',
            }}, record=changed)['record']
            plan = api('save', 'gtm_plans', {'name': 'GTM rollback plan', 'cash_budget': 100000})['record']
            campaign = api('save', 'gtm_campaigns', {'name': 'GTM rollback campaign'})['record']
            outreach_template = api('save', 'gtm_outreach_templates', {
                'name': 'GTM rollback outreach template', 'status': 'active',
                'campaign_id': campaign['id'], 'channel': 'email', 'language': 'en',
                'target_creator_profile': 'Career creators with evidence-led content',
                'subject_template': 'A collaboration idea for [Name]',
                'opening_template': 'Hi [Name], I liked your recent career content.',
                'value_proposition': 'Help job seekers make a clearer next move.',
                'ask': 'One short creator-native video and the final file.',
                'offer_structure': 'Confirm scope and fee before production.',
                'follow_up_template': 'Checking whether this direction fits your channel.',
                'link_refs': ['https://matchharper.com/career'],
                'usage_notes': 'Personalize the opening with observed creator evidence.',
                'template_version': 'fixture-v1',
            })['record']
            fmt = api('save', 'gtm_formats', {
                'name': 'GTM rollback format', 'status': 'active',
                'default_campaign_id': campaign['id'],
                'default_outreach_template_id': outreach_template['id'],
                'hook': 'Show the job-search question before the product response.',
                'shot_sequence': '1. Real problem\n2. Harper conversation\n3. Recommendation review',
                'required_moment': 'A recommendation explanation grounded in user criteria.',
                'caption_template': 'How I made my job search criteria clearer.',
                'example_links': ['https://example.test/format'],
                'replicate_rule': 'Reuse when viewers engage with the decision process.',
                'kill_rule': 'Stop when the product is presented as guaranteed employment.',
                'target_creator_profile': 'Career and productivity creators',
                'cold_outreach_angle': 'Build on the creator’s own job-search framework.',
            })['record']
            account = api('save', 'gtm_accounts', {
                'creator_id': creator['id'], 'platform': 'youtube',
                'provider_scope': 'public', 'external_id': str(uuid.uuid4()),
                'handle': 'gtm-fixture', 'profile_url': 'https://youtube.com/@gtm-fixture',
                'audience_summary': 'Korea university students',
                'as_of': datetime.now(timezone.utc).isoformat(),
                'last_post_at': (datetime.now(timezone.utc)-timedelta(days=2)).isoformat(),
            })['record']
            now = datetime.now(timezone.utc)
            for metric, value, unit, start_at, end_at in [
                ('followers', 12345, 'people', None, None),
                ('published_content_count', 78, 'posts', now-timedelta(days=365), now),
            ]:
                api('save', 'gtm_metric_snapshots', {
                    'account_id': account['id'], 'metric': metric, 'value': value,
                    'unit': unit, 'period_start': start_at.isoformat() if start_at else None,
                    'period_end': end_at.isoformat() if end_at else None,
                    'as_of': now.isoformat(), 'source_ref': 'transactional-fixture',
                    'definition_version': 'fixture-v1',
                    'value_kind': 'period' if start_at else 'cumulative',
                })
            collab = api('save', 'gtm_collaborations', {'title': 'GTM rollback collaboration', 'creator_id': creator['id'], 'plan_id': plan['id']})['record']
            prepare_request_id = uuid.uuid4()
            rejects('outreach recipient must be a current creator email contact', lambda: conn.execute(
                'select public.gtm_outreach_prepare(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (token, creator['id'], outreach_template['id'], 'unknown@example.test',
                 'harper@matchharper.com', 'Fixture subject', 'Fixture body',
                 'The active email template fits this creator', uuid.uuid4(),
                 collab['id'], None, 'Observed career content'),
            ))
            rejects('outreach sender must be a matchharper.com mailbox', lambda: conn.execute(
                'select public.gtm_outreach_prepare(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (token, creator['id'], outreach_template['id'], 'fixture@example.test',
                 'sender@example.test', 'Fixture subject', 'Fixture body',
                 'The active email template fits this creator', uuid.uuid4(),
                 collab['id'], None, 'Observed career content'),
            ))
            dispatch = conn.execute(
                'select public.gtm_outreach_prepare(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (token, creator['id'], outreach_template['id'], 'fixture@example.test',
                 'harper@matchharper.com', 'Fixture subject', 'Fixture body',
                 'The active email template fits this creator', prepare_request_id,
                 collab['id'], None, 'Observed career content'),
            ).fetchone()[0]
            repeated_dispatch = conn.execute(
                'select public.gtm_outreach_prepare(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (token, creator['id'], outreach_template['id'], 'fixture@example.test',
                 'harper@matchharper.com', 'Fixture subject', 'Fixture body',
                 'The active email template fits this creator', prepare_request_id,
                 collab['id'], None, 'Observed career content'),
            ).fetchone()[0]
            assert dispatch['id'] == repeated_dispatch['id']
            assert dispatch['selection_reason'] == 'The active email template fits this creator'
            dispatch = conn.execute(
                'select public.gtm_outreach_review(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (token, dispatch['id'], dispatch['row_version'], 'request_revision',
                 uuid.uuid4(), None, None, None,
                 'Use a more specific observed-content opening', 'tester@matchharper.com'),
            ).fetchone()[0]
            assert dispatch['status'] == 'needs_revision'
            dispatch = conn.execute(
                'select public.gtm_outreach_review(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (token, dispatch['id'], dispatch['row_version'], 'revise',
                 uuid.uuid4(), 'Revised fixture subject', 'Revised fixture body',
                 None, 'Revision completed', None),
            ).fetchone()[0]
            assert dispatch['status'] == 'ready_for_review'
            review_request_id = uuid.uuid4()
            dispatch = conn.execute(
                'select public.gtm_outreach_review(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (token, dispatch['id'], dispatch['row_version'], 'approve',
                 review_request_id, 'Final fixture subject', 'Final fixture body',
                 None, 'Approved in transaction test', 'tester@matchharper.com'),
            ).fetchone()[0]
            assert dispatch['status'] == 'approved'
            assert dispatch['approved_by'] == 'GTM transactional test'
            conn.execute(
                'update public.gtm_creators set do_not_contact=true where id=%s',
                (creator['id'],),
            )
            blocked_claim = conn.execute(
                'select public.gtm_outreach_worker_claim(%s,%s)',
                (dispatch['id'], 1),
            ).fetchone()[0]
            assert blocked_claim == []
            dispatch = conn.execute(
                'select to_jsonb(d) from public.gtm_outreach_dispatches d where id=%s',
                (dispatch['id'],),
            ).fetchone()[0]
            assert dispatch['status'] == 'failed'
            conn.execute(
                'update public.gtm_creators set do_not_contact=false where id=%s',
                (creator['id'],),
            )
            dispatch = conn.execute(
                'select public.gtm_outreach_review(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (token, dispatch['id'], dispatch['row_version'], 'approve',
                 uuid.uuid4(), 'Final fixture subject', 'Final fixture body',
                 None, 'Approved after contact gate restored', None),
            ).fetchone()[0]
            claimed = conn.execute(
                'select public.gtm_outreach_worker_claim(%s,%s)',
                (dispatch['id'], 1),
            ).fetchone()[0]
            assert len(claimed) == 1 and claimed[0]['status'] == 'sending'
            gmail_message_id = 'gmail-' + uuid.uuid4().hex
            gmail_thread_id = 'thread-' + uuid.uuid4().hex
            dispatch = conn.execute(
                'select public.gtm_outreach_worker_mark_sent(%s,%s,%s,%s)',
                (dispatch['id'], gmail_message_id, gmail_thread_id, now),
            ).fetchone()[0]
            assert dispatch['status'] == 'sent'
            gmail_reply_id = 'gmail-' + uuid.uuid4().hex
            reply = conn.execute(
                'select public.gtm_outreach_ingest_gmail_reply(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                ('harper@matchharper.com', gmail_reply_id, gmail_thread_id,
                 'fixture@example.test', 'harper@matchharper.com',
                 'Re: Final fixture subject', 'Interested in learning more.', now,
                 '<reply@example.test>', dispatch['rfc_message_id'],
                 dispatch['rfc_message_id']),
            ).fetchone()[0]
            assert reply['matched'] and reply['inserted'] and reply['notify_needed']
            triage = conn.execute(
                'select public.gtm_outreach_record_reply_triage(%s,%s,%s,%s,%s)',
                (reply['activity_id'], 'positive',
                 '크리에이터가 제안에 관심을 보이고 자세한 설명을 요청했습니다.',
                 Jsonb([]), 'z-ai/glm-5.3-flash'),
            ).fetchone()[0]
            assert triage['triage_type'] == 'positive'
            assert triage['follow_up_action_id'] == reply['activity_id']
            reply_action = conn.execute(
                "select to_jsonb(t) from public.gtm_today t where t.entity='gtm_collaborations' and t.entity_id=%s and t.action_id=%s",
                (collab['id'], reply['activity_id']),
            ).fetchone()[0]
            assert reply_action['status'] == 'open'
            assert reply_action['action'] == 'Review creator email reply and decide the next response'
            repeated_triage = conn.execute(
                'select public.gtm_outreach_record_reply_triage(%s,%s,%s,%s,%s)',
                (reply['activity_id'], 'positive',
                 '크리에이터가 제안에 관심을 보이고 자세한 설명을 요청했습니다.',
                 Jsonb([]), 'z-ai/glm-5.3-flash'),
            ).fetchone()[0]
            assert triage['triage_activity_id'] == repeated_triage['triage_activity_id']
            conn.execute(
                'select public.gtm_outreach_record_slack_notification(%s,%s,%s)',
                (reply['activity_id'], 'C_FIXTURE', '123.456'),
            )
            repeated_reply = conn.execute(
                'select public.gtm_outreach_ingest_gmail_reply(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                ('harper@matchharper.com', gmail_reply_id, gmail_thread_id,
                 'fixture@example.test', 'harper@matchharper.com',
                 'Re: Final fixture subject', 'Interested in learning more.', now,
                 '<reply@example.test>', dispatch['rfc_message_id'],
                 dispatch['rfc_message_id']),
            ).fetchone()[0]
            assert repeated_reply['matched'] and not repeated_reply['inserted']
            assert not repeated_reply['notify_needed']
            alternate_contact_id = str(uuid.uuid4())
            creator_for_contact = conn.execute(
                'select to_jsonb(c) from public.gtm_creators c where id=%s',
                (creator['id'],),
            ).fetchone()[0]
            api('patch_item', 'gtm_creators', {'field': 'contacts', 'item': {
                'id': alternate_contact_id, 'channel': 'email',
                'address': 'manager@example.test', 'source_ref': 'transactional-fixture',
                'as_of': datetime.now(timezone.utc).isoformat(), 'status': 'pending',
                'party': 'manager',
            }}, record=creator_for_contact)
            alternate_reply = conn.execute(
                'select public.gtm_outreach_ingest_gmail_reply(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                ('harper@matchharper.com', 'gmail-' + uuid.uuid4().hex,
                 gmail_thread_id, 'manager@example.test', 'harper@matchharper.com',
                 'Re: Final fixture subject', 'I manage this creator.', now,
                 '<manager-reply@example.test>', dispatch['rfc_message_id'],
                 dispatch['rfc_message_id']),
            ).fetchone()[0]
            assert alternate_reply['matched'] and alternate_reply['inserted']
            unknown_reply = conn.execute(
                'select public.gtm_outreach_ingest_gmail_reply(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                ('harper@matchharper.com', 'gmail-' + uuid.uuid4().hex,
                 gmail_thread_id, 'unknown-third-party@example.test',
                 'harper@matchharper.com', 'Re: Final fixture subject',
                 'Unrelated participant.', now, '<unknown-reply@example.test>',
                 dispatch['rfc_message_id'], dispatch['rfc_message_id']),
            ).fetchone()[0]
            assert not unknown_reply['matched']
            bounce_message_id = 'gmail-' + uuid.uuid4().hex
            delivery_failure = conn.execute(
                'select public.gtm_outreach_ingest_gmail_delivery_failure(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                ('harper@matchharper.com', bounce_message_id, gmail_thread_id,
                 '5.1.1', 'fixture@example.test',
                 'smtp; 550 5.1.1 User unknown', now,
                 '<bounce@example.test>', dispatch['rfc_message_id'],
                 dispatch['rfc_message_id']),
            ).fetchone()[0]
            assert delivery_failure['matched'] and delivery_failure['inserted']
            assert delivery_failure['permanent'] and delivery_failure['notify_needed']
            bounced_dispatch = conn.execute(
                'select to_jsonb(d) from public.gtm_outreach_dispatches d where id=%s',
                (dispatch['id'],),
            ).fetchone()[0]
            assert bounced_dispatch['status'] == 'replied'
            assert '550 5.1.1' in bounced_dispatch['last_error']
            bounced_creator = conn.execute(
                'select to_jsonb(c) from public.gtm_creators c where id=%s',
                (creator['id'],),
            ).fetchone()[0]
            bounced_contact = next(
                contact for contact in bounced_creator['contacts']
                if contact['id'] == primary_contact_id
            )
            assert bounced_contact['status'] == 'bounced'
            conn.execute(
                'select public.gtm_outreach_record_activity_slack_notification(%s,%s,%s)',
                (delivery_failure['activity_id'], 'C_FIXTURE', '123.457'),
            )
            repeated_failure = conn.execute(
                'select public.gtm_outreach_ingest_gmail_delivery_failure(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                ('harper@matchharper.com', bounce_message_id, gmail_thread_id,
                 '5.1.1', 'fixture@example.test',
                 'smtp; 550 5.1.1 User unknown', now,
                 '<bounce@example.test>', dispatch['rfc_message_id'],
                 dispatch['rfc_message_id']),
            ).fetchone()[0]
            assert repeated_failure['matched'] and not repeated_failure['inserted']
            assert not repeated_failure['notify_needed']
            creator_for_restore = conn.execute(
                'select to_jsonb(c) from public.gtm_creators c where id=%s',
                (creator['id'],),
            ).fetchone()[0]
            api('patch_item', 'gtm_creators', {'field': 'contacts', 'item': {
                'id': primary_contact_id,
                'status': 'active',
                'as_of': datetime.now(timezone.utc).isoformat(),
            }}, record=creator_for_restore)
            review_row = sheet('outreach_review', dispatch['id'])['record']
            assert review_row['status'] == 'replied'
            assert review_row['outreach_template_ref'] == outreach_template['ref']
            assert review_row['creator_ref'] == creator['ref']
            checks.append('human-approved outreach is idempotently sent and triaged; evidenced alternate senders, permanent bounces, and Slack notifications are recorded once')
            api('save', 'gtm_activities', {
                'entity': 'gtm_collaborations', 'entity_id': collab['id'],
                'kind': 'message_draft', 'body': 'Send this directly by DM.',
                'payload': {
                    'channel': 'instagram_dm',
                    'delivery_status': 'manual_send_required',
                    'manual_destination': 'https://instagram.com/gtm-fixture',
                    'subject': 'Manual collaboration outreach',
                },
            })
            api('save', 'gtm_activities', {
                'entity': 'gtm_collaborations', 'entity_id': collab['id'],
                'kind': 'message_sent', 'body': 'fixture outreach',
                'source_ref': 'transactional-fixture',
                'provider': 'fixture', 'connection_ref': 'fixture',
                'thread_id': 'fixture-thread', 'external_id': str(uuid.uuid4()),
                'outreach_template_id': outreach_template['id'],
            })
            api('save', 'gtm_activities', {
                'entity': 'gtm_collaborations', 'entity_id': collab['id'],
                'kind': 'message_received', 'body': 'fixture reply',
                'provider': 'fixture', 'connection_ref': 'fixture',
                'thread_id': 'fixture-thread', 'external_id': str(uuid.uuid4()),
            })
            overview = api('get', 'gtm_creators', record=creator)['record']
            assert overview['platforms'] == ['youtube']
            assert overview['outreach_score'] is None
            assert overview['total_followers'] == 12345
            assert overview['content_count_365d'] == 78
            assert overview['outreach_status'] == 'replied'
            assert overview['data_status'] == 'current'
            assert 'email: fixture@example.test [active]' in overview['contact_summary']
            assert 'email: manager@example.test [pending]' in overview['contact_summary']
            assert overview['activity_regions'] == ['KR']
            assert overview['primary_platform'] == 'youtube'
            assert overview['primary_handle'] == 'gtm-fixture'
            assert overview['primary_profile_url'] == 'https://youtube.com/@gtm-fixture'
            assert overview['primary_email'] == 'fixture@example.test'
            assert overview['first_outreach_at'] is not None
            assert overview['current_plan_ref'] == plan['ref']
            assert overview['current_plan_name'] == 'GTM rollback plan'
            checks.append('creator default read includes filterable identity, scale, pipeline, plan, outreach, and freshness')
            directory = sheet('creator_directory', creator['id'])['record']
            assert directory['sheet_primary_platform'] == 'youtube'
            assert directory['outreach_score'] is None
            assert directory['sheet_primary_email'] == 'fixture@example.test'
            assert directory['sheet_current_plan_ref'] == plan['ref']
            connected = sheet('connected_creators')['rows']
            assert any(row['id'] == creator['id'] for row in connected)
            outreach = sheet('outreach_log')['rows']
            fixture_reply = next(row for row in outreach if row['body'] == 'fixture reply')
            classified_reply = next(row for row in outreach if row['body'] == 'Interested in learning more.')
            fixture_outreach = next(row for row in outreach if row['body'] == 'fixture outreach')
            manual_outreach = next(row for row in outreach if row['body'] == 'Send this directly by DM.')
            delivery_event = next(row for row in outreach if row['kind'] == 'delivery_failed')
            assert fixture_reply['creator_ref'] == creator['ref']
            assert fixture_reply['direction'] == 'inbound'
            assert classified_reply['reply_type'] == 'positive'
            assert classified_reply['reply_summary'] == '크리에이터가 제안에 관심을 보이고 자세한 설명을 요청했습니다.'
            assert fixture_outreach['direction'] == 'outbound'
            assert fixture_outreach['outreach_template_ref'] == outreach_template['ref']
            assert manual_outreach['delivery_status'] == 'manual_send_required'
            assert manual_outreach['manual_destination'] == 'https://instagram.com/gtm-fixture'
            assert delivery_event['delivery_status'] == 'permanent_failure'
            assert '550 5.1.1' in delivery_event['delivery_diagnostic']
            checks.append('three Sheet read models join creator, relationship, and outreach facts without new ledgers')
            creator = api('save', 'gtm_creators', {'outreach_score': 5}, record=overview)['record']
            changed = creator
            assert api('get', 'gtm_creators', record=creator)['record']['outreach_score'] == 5
            rejects('outreach score is limited to 1 through 5', lambda: api(
                'save', 'gtm_creators', {'outreach_score': 6}, record=creator,
            ))
            checks.append('outreach priority is nullable, editable, and constrained to 1 through 5')
            template_detail = api('get', 'gtm_outreach_templates', record=outreach_template)
            template_overview = template_detail['record']
            assert template_overview['default_format_count'] == 1
            assert template_overview['sent_count'] == 2
            assert template_overview['sent_thread_count'] == 2
            assert template_overview['replied_thread_count'] == 2
            assert template_overview['response_rate'] == 100
            assert any(
                message['body'] == 'fixture outreach'
                for message in template_detail['related']['messages']
            )
            format_overview = api('get', 'gtm_formats', record=fmt)['record']
            assert format_overview['default_campaign_ref'] == campaign['ref']
            assert format_overview['default_outreach_template_ref'] == outreach_template['ref']
            checks.append('Format Bank and Outreach Templates expose reusable guidance and recorded usage')
            incomplete_creator = api('save', 'gtm_creators', {'name': 'Incomplete fixture'})['record']
            incomplete_overview = api('get', 'gtm_creators', record=incomplete_creator)['record']
            assert incomplete_overview['data_status'] == 'missing_accounts'
            assert {'activity_regions', 'content_topics', 'contact_method'} <= set(incomplete_overview['refresh_fields'])
            checks.append('creator default read exposes missing research instead of converting unknowns to zero')
            collab = conn.execute(
                'select to_jsonb(c) from public.gtm_collaborations c where id=%s',
                (collab['id'],),
            ).fetchone()[0]
            collab = api('patch_item', 'gtm_collaborations', {
                'field': 'action_items',
                'item': {'id': reply['activity_id'], 'status': 'done'},
            }, record=collab)['record']
            for text in ['Receive statistics', 'Reconcile payment']:
                collab = api('patch_item', 'gtm_collaborations', {'field': 'action_items', 'item': {
                    'id': str(uuid.uuid4()), 'text': text, 'status': 'open', 'owner_id': 'fixture',
                }}, record=collab)['record']
            open_actions = [action for action in collab['action_items'] if action['status'] == 'open']
            assert len(open_actions) == 2
            first_id = open_actions[0]['id']
            collab = api('patch_item', 'gtm_collaborations', {'field': 'action_items', 'item': {'id': first_id, 'status': 'done'}}, record=collab)['record']
            outstanding = [a for a in api('today')['rows'] if a['entity_id'] == collab['id']]
            assert len(outstanding) == 1 and outstanding[0]['action'] == 'Reconcile payment'
            checks.append('independent follow-ups survive completion')
            content = api('save', 'gtm_contents', {'title': 'GTM rollback content', 'creator_id': creator['id'],
                'collaboration_id': collab['id'], 'plan_id': plan['id'], 'campaign_id': campaign['id'], 'format_id': fmt['id']})['record']
            assert api('get', 'gtm_formats', record=fmt)['record']['content_use_count'] == 1
            linked = api('issue_link', 'gtm_contents', {'destination_url': 'https://www.matchharper.com/career',
                'source': 'instagram', 'medium': 'creator', 'placement': 'bio'}, record=content)
            assert linked['link']['scope'] == 'content' and linked['link']['id'] in linked['link']['url']
            checks.append('immutable scoped UTM link issued')
            rejects('link overwrite', lambda: api('save', 'gtm_contents', {'tracking_links': []}, record=linked['record']))
            cost = api('save', 'gtm_costs', {'plan_id': plan['id'], 'collaboration_id': collab['id'],
                'kind': 'creator_fee', 'description': 'GTM rollback cost', 'agreed_amount': 30000})['record']
            payment = {'id': str(uuid.uuid4()), 'kind': 'payment', 'amount': 15000,
                'occurred_at': datetime.now(timezone.utc).isoformat(), 'source_ref': 'transactional-fixture',
                'provider': 'fixture', 'connection_ref': 'fixture', 'external_id': str(uuid.uuid4())}
            cost = api('patch_item', 'gtm_costs', {'field': 'payments', 'item': payment}, record=cost)['record']
            summary = api('get', 'gtm_plans', record=plan)['record']
            assert summary['committed_cash'] == 30000 and summary['net_paid'] == 15000
            checks.append('payment does not double-count obligation')
            rejects('over-budget new obligation', lambda: api('save', 'gtm_costs', {'plan_id': plan['id'],
                'kind': 'creator_fee', 'description': 'Excess obligation', 'agreed_amount': 100001}))
            duplicate = api('save', 'gtm_costs', {'plan_id': plan['id'], 'kind': 'creator_fee', 'description': 'Second cost'})['record']
            rejects('cross-record payment duplication', lambda: api('patch_item', 'gtm_costs', {'field': 'payments', 'item': payment}, record=duplicate))
            another_payment = dict(payment, id=str(uuid.uuid4()))
            rejects('same-cost payment duplication', lambda: api('patch_item', 'gtm_costs', {'field': 'payments', 'item': another_payment}, record=cost))
            rejects('payment overwrite', lambda: api('patch_item', 'gtm_costs', {'field': 'payments', 'item': dict(payment, amount=1)}, record=cost))
            plan = api('save', 'gtm_plans', {'cash_budget': 1000}, record=plan)['record']
            cost = api('save', 'gtm_costs', {'incurred_amount': 30000, 'source_ref': 'confirmed-existing-invoice'}, record=cost)['record']
            assert api('get', 'gtm_plans', record=plan)['record']['available_cash'] == -29000
            relationship = sheet('connected_creators', creator['id'])['record']
            assert relationship['lifetime_incurred_cost'] == 30000
            assert relationship['lifetime_committed_cash'] == 30000
            assert relationship['lifetime_net_paid'] == 15000
            checks.append('budget reductions do not erase or block existing expense facts')
            rejects('new promise blocked after budget reduction', lambda: api('save', 'gtm_costs', {'plan_id': plan['id'], 'kind': 'creator_fee', 'description': 'New promise', 'agreed_amount': 1}))
            batch_creator = api('batch', data={'operations': [{
                'action': 'save', 'entity': 'gtm_creators', 'id': changed['id'], 'expected_version': changed['row_version'],
                'data': {'notes': 'batch updated'}, 'request_id': str(uuid.uuid4()),
            }]})['results'][0]['record']
            rejects('atomic batch rejects a stale member', lambda: api('batch', data={'operations': [
                {'action': 'save', 'entity': 'gtm_creators', 'id': batch_creator['id'], 'expected_version': batch_creator['row_version'], 'data': {'notes': 'must roll back'}, 'request_id': str(uuid.uuid4())},
                {'action': 'save', 'entity': 'gtm_creators', 'id': batch_creator['id'], 'expected_version': 1, 'data': {'notes': 'stale'}, 'request_id': str(uuid.uuid4())},
            ]}))
            assert api('get', 'gtm_creators', record=batch_creator)['record']['notes'] == 'batch updated'
            checks.append('batch rollback preserves all prior records')
            rejects('raw product entity read', lambda: api('list', 'talent_users'))
            performance = api('performance', data={'start_at': (datetime.now(timezone.utc)-timedelta(days=1)).isoformat()})
            assert 'product_overall' in performance and 'daily' in performance
            assert all('email' not in row and 'local_id' not in row for row in performance['daily'])
            checks.append('live product sources return aggregate-only results')
            test_attribution(conn)
            checks.append('isolated attribution: future/competing visits, signup dedup, shared scope and exact 7-day completion boundary')
            print('\n'.join(f'PASS {name}' for name in checks))
            print(f'{len(checks)} checks passed; all GTM schema/fixtures rolled back.')
        finally:
            conn.rollback()


def test_attribution(conn):
    """Synthetic source facts live only in an uncommitted, isolated fixture schema."""
    schema = 'gtm_test_' + uuid.uuid4().hex
    conn.execute(f'create schema {schema}')
    sources = {
        'landing_logs': 'gtm_fixture_landing_logs', 'logs': 'gtm_fixture_logs',
        'talent_users': 'gtm_fixture_users', 'talent_activity_events': 'gtm_fixture_events',
        'contact_queue': 'gtm_fixture_contacts',
    }
    for target, source in [(new, old) for old, new in sources.items()] + [(name, name) for name in ['gtm_contents', 'gtm_costs', 'gtm_activities']]:
        conn.execute(f'create table {schema}.{target} (like public.{source} including defaults including identity)')
    sql = MIGRATIONS[1].read_text()
    for old, new in sources.items():
        sql = sql.replace('public.' + old, schema + '.' + new)
    sql = sql.replace('public.', schema + '.')
    conn.execute(sql)
    base = datetime.now(timezone.utc)-timedelta(days=20)
    cid = uuid.uuid4()
    plan = uuid.uuid4()
    links = [
        {'id': 'gtm_fixture_content', 'scope': 'content', 'target_id': str(cid), 'plan_id': str(plan), 'utm_source': 'instagram', 'utm_campaign': 'fixture'},
        {'id': 'gtm_fixture_shared', 'scope': 'plan', 'target_id': str(plan), 'plan_id': str(plan), 'utm_source': 'instagram', 'utm_campaign': 'fixture'},
    ]
    conn.execute(f'insert into {schema}.gtm_contents(id,title,tracking_links)values(%s,%s,%s)', (cid, 'Isolated fixture', Jsonb(links)))
    def touch(n, when, link='gtm_fixture_content', source='instagram'):
        conn.execute(f'insert into {schema}.gtm_fixture_landing_logs(created_at,local_id,type)values(%s,%s,%s)',
                     (when, f'fixture-browser-{n}', f'utm:utm_source={source}&utm_campaign=fixture&utm_content={link}'))
    for n in range(1, 6):
        uid = uuid.uuid4()
        signed = base+timedelta(days=2)
        conn.execute(f'insert into {schema}.gtm_fixture_users(user_id,email,created_at)values(%s,%s,%s)', (uid, f'fixture-{n}@example.test', signed))
        conn.execute(f'insert into {schema}.gtm_fixture_logs(created_at,user_id,type)values(%s,%s,%s)', (signed, uid, 'career_signup_completed'))
        conn.execute(f'insert into {schema}.gtm_fixture_contacts(user_id,type,status,scheduled_at,created_at,payload)values(%s,%s,%s,%s,%s,%s)',
                     (uid, 'career_signup_no_profile_submit', 'cancelled', signed, signed, Jsonb({'landingLocalId': f'fixture-browser-{n}'})))
        touch(n, signed+timedelta(hours=1) if n==2 else base+timedelta(days=1), 'gtm_fixture_shared' if n==4 else 'gtm_fixture_content')
        if n==3:
            touch(n, base+timedelta(days=1,hours=1), 'other-channel', 'newsletter')
        if n==5:
            conn.execute(f'insert into {schema}.gtm_fixture_logs(created_at,user_id,type)values(%s,%s,%s)', (signed+timedelta(days=1), uid, 'career_signup_completed'))
        if n in (1,4,5):
            conn.execute(f'insert into {schema}.gtm_fixture_events(talent_id,event_type,source,summary,impact_level,created_at)values(%s,%s,%s,%s,%s,%s)',
                         (uid, 'onboarding_completed', 'fixture', 'fixture', 'medium', signed+timedelta(days=1 if n==1 else 7)))
    result = conn.execute(f'select {schema}.gtm_performance(%s)', (Jsonb({'start_at': base.isoformat()}),)).fetchone()[0]
    assert result['product_overall']['signups']==5, result['product_overall']
    content = result['contents'][0]
    assert content['signups']==2 and content['onboarding_completed_7d']==1, content
    assert result['shared_attribution'][0]['signups']==1 and result['shared_attribution'][0]['onboarding_completed_7d']==0
    conn.execute(f'insert into {schema}.gtm_contents(title)values(%s)', ('Untracked fixture',))
    untracked = conn.execute(f'select {schema}.gtm_performance(%s)', (Jsonb({'start_at': base.isoformat()}),)).fetchone()[0]['contents'][-1]
    assert untracked['signups'] is None and untracked['landing_visitors'] is None


if __name__ == '__main__':
    main()
