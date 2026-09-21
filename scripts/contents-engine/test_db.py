"""Transactional GTM integration checks. All schema and fixture writes are rolled back.

Uses the configured PostgreSQL connection, never changes product/user records.
Run from harper_beta: python3 scripts/contents-engine/test_db.py
"""
from pathlib import Path
from datetime import datetime, timedelta, timezone
import uuid
import psycopg
from psycopg.types.json import Jsonb
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = [
    ROOT / 'supabase/migrations/20260916130000_gtm_contents_engine.sql',
    ROOT / 'supabase/migrations/20260916131000_gtm_performance.sql',
    ROOT / 'supabase/migrations/20260916132000_gtm_aggregation_fix.sql',
    ROOT / 'supabase/migrations/20260917032009_gtm_creator_operating_view.sql',
    ROOT / 'supabase/migrations/20260917041000_gtm_sheet_operating_views.sql',
    ROOT / 'supabase/migrations/20260917052200_gtm_creator_overview_sheet_fields.sql',
    ROOT / 'supabase/migrations/20260917055533_gtm_format_bank_outreach_templates.sql',
    ROOT / 'supabase/migrations/20260917064500_gtm_creator_outreach_score.sql',
    ROOT / 'supabase/migrations/20260917075510_gtm_outreach_dispatches.sql',
    ROOT / 'supabase/migrations/20260918093000_gtm_outreach_resend_delivery.sql',
    ROOT / 'supabase/migrations/20260921120000_gtm_workspace.sql',
    ROOT / 'supabase/migrations/20260921123000_gtm_operations.sql',
    ROOT / 'supabase/migrations/20260921150000_gtm_creator_mail.sql',
    ROOT / 'supabase/migrations/20260921160000_gtm_outreach_delivery_recovery.sql',
    ROOT / 'supabase/migrations/20260921163000_gtm_resend_delivery_events.sql',
    ROOT / 'supabase/migrations/20260921164000_gtm_delivery_activity_guard.sql',
    ROOT / 'supabase/migrations/20260921170000_gtm_creator_cell_navigation.sql',
    ROOT / 'supabase/migrations/20260921173000_gtm_outreach_status_colors.sql',
    ROOT / 'supabase/migrations/20260921180000_gtm_remove_access_tokens.sql',
    ROOT / 'supabase/migrations/20260921181000_gtm_service_role_auth.sql',
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
                # Migrations are intentionally not replayed over an evolved live
                # schema: CREATE OR REPLACE VIEW cannot remove/reorder columns.
                # Assert the current contract, then exercise it transactionally.
                required = conn.execute("""
                    select
                      to_regprocedure('gtm_view.api(text,text,uuid,bigint,jsonb,uuid)'),
                      to_regprocedure('public.gtm_workspace(text,jsonb)'),
                      to_regprocedure('public.gtm_outreach_worker_record_delivery(uuid,text,text,text,text,timestamp with time zone)'),
                      to_regprocedure('public.gtm_outreach_claim_notifications(text,uuid)'),
                      to_regprocedure('public.gtm_outreach_ingest_gmail_delivery_failure(text,text,text,text,text,text,timestamp with time zone,text,text,text)'),
                      to_regprocedure('public.gtm_outreach_record_activity_slack_notification(uuid,text,text)'),
                      to_regprocedure('public.gtm_outreach_ingest_resend_delivery_event(text,text,text,text,text,timestamp with time zone,boolean)'),
                      to_regprocedure('public.gtm_guard_outreach_internal_activity()')
                """).fetchone()
                assert all(required), 'Apply the checked-in GTM migrations before running this test'
            assert conn.execute("select to_regclass('public.gtm_access_tokens')").fetchone()[0] is None
            assert conn.execute("select to_regprocedure('public.gtm_workspace(text,jsonb,text)')").fetchone()[0] is None
            checks.append('parallel GTM token system is absent')

            def api(action, entity=None, data=None, record=None, request_id=None):
                return conn.execute('select gtm_view.api(%s,%s,%s,%s,%s,%s)', (
                    action, entity, record['id'] if record else None,
                    record['row_version'] if record else None, Jsonb(data or {}),
                    request_id or uuid.uuid4(),
                )).fetchone()[0]

            def workspace(action, data=None):
                return conn.execute(
                    'select public.gtm_workspace(%s::text,%s::jsonb)',
                    (action, Jsonb(data or {})),
                ).fetchone()[0]

            def sheet(view, record_id=None):
                source = {
                    'creator_directory': 'creators',
                    'connected_creators': 'connected',
                    'outreach_log': 'outreach',
                    'outreach_review': 'review',
                }[view]
                catalog = workspace('catalog')
                sheet_id = next(item['id'] for item in catalog['sheets']
                                if item['definition']['source'] == source)
                result = workspace('query', {'sheet_id': sheet_id, 'limit': 200})
                if record_id is not None:
                    record = next((row for row in result['rows']
                                   if row['id'] == str(record_id)), None)
                    offset = 200
                    while record is None and offset < result['total']:
                        page = workspace('query', {
                            'sheet_id': sheet_id, 'limit': 200, 'offset': offset,
                        })
                        record = next((row for row in page['rows']
                                       if row['id'] == str(record_id)), None)
                        offset += 200
                    result['record'] = record
                return result

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
            changed = api('patch_item', 'gtm_creators', {'field': 'contacts', 'item': {
                'id': str(uuid.uuid4()), 'channel': 'email',
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
                'select gtm_view.outreach_prepare(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (creator['id'], outreach_template['id'], 'unknown@example.test',
                 'harper@matchharper.com', 'Fixture subject', 'Fixture body',
                 'The active email template fits this creator', uuid.uuid4(),
                 collab['id'], None, 'Observed career content'),
            ))
            rejects('outreach sender must be a matchharper.com mailbox', lambda: conn.execute(
                'select gtm_view.outreach_prepare(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (creator['id'], outreach_template['id'], 'fixture@example.test',
                 'sender@example.test', 'Fixture subject', 'Fixture body',
                 'The active email template fits this creator', uuid.uuid4(),
                 collab['id'], None, 'Observed career content'),
            ))
            dispatch = conn.execute(
                'select gtm_view.outreach_prepare(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (creator['id'], outreach_template['id'], 'fixture@example.test',
                 'harper@matchharper.com', 'Fixture subject', 'Fixture body',
                 'The active email template fits this creator', prepare_request_id,
                 collab['id'], None, 'Observed career content'),
            ).fetchone()[0]
            repeated_dispatch = conn.execute(
                'select gtm_view.outreach_prepare(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (creator['id'], outreach_template['id'], 'fixture@example.test',
                 'harper@matchharper.com', 'Fixture subject', 'Fixture body',
                 'The active email template fits this creator', prepare_request_id,
                 collab['id'], None, 'Observed career content'),
            ).fetchone()[0]
            assert dispatch['id'] == repeated_dispatch['id']
            assert dispatch['selection_reason'] == 'The active email template fits this creator'
            dispatch = conn.execute(
                'select gtm_view.outreach_review(%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (dispatch['id'], dispatch['row_version'], 'request_revision',
                 uuid.uuid4(), None, None, None,
                 'Use a more specific observed-content opening', 'tester@matchharper.com'),
            ).fetchone()[0]
            assert dispatch['status'] == 'needs_revision'
            dispatch = conn.execute(
                'select gtm_view.outreach_review(%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (dispatch['id'], dispatch['row_version'], 'revise',
                 uuid.uuid4(), 'Revised fixture subject', 'Revised fixture body',
                 None, 'Revision completed', None),
            ).fetchone()[0]
            assert dispatch['status'] == 'ready_for_review'
            review_request_id = uuid.uuid4()
            dispatch = conn.execute(
                'select gtm_view.outreach_review(%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (dispatch['id'], dispatch['row_version'], 'approve',
                 review_request_id, 'Final fixture subject', 'Final fixture body',
                 None, 'Approved in transaction test', 'tester@matchharper.com'),
            ).fetchone()[0]
            assert dispatch['status'] == 'approved'
            assert dispatch['approved_by'] == 'supabase-plugin'
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
                'select gtm_view.outreach_review(%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (dispatch['id'], dispatch['row_version'], 'approve',
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
            pending_notifications = conn.execute(
                'select public.gtm_outreach_pending_reply_notifications(%s)', (30,)
            ).fetchone()[0]
            assert any(item['activity_id'] == str(reply['activity_id']) for item in pending_notifications)
            notification_lease = uuid.uuid4()
            notification_claim = conn.execute(
                'select public.gtm_outreach_claim_notifications(%s,%s)',
                ('harper@matchharper.com', notification_lease),
            ).fetchone()[0]
            assert notification_claim['claimed'] is True
            blocked_notification_claim = conn.execute(
                'select public.gtm_outreach_claim_notifications(%s,%s)',
                ('harper@matchharper.com', uuid.uuid4()),
            ).fetchone()[0]
            assert blocked_notification_claim['claimed'] is False
            conn.execute(
                'select public.gtm_outreach_release_notifications(%s,%s,%s)',
                ('harper@matchharper.com', notification_lease, None),
            )
            conn.execute(
                'select public.gtm_outreach_record_slack_notification(%s,%s,%s)',
                (reply['activity_id'], 'C_FIXTURE', '123.456'),
            )
            assert not any(
                item['activity_id'] == str(reply['activity_id'])
                for item in conn.execute(
                    'select public.gtm_outreach_pending_reply_notifications(%s)', (30,)
                ).fetchone()[0]
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
            checks.append('reply notifications are durable, leased, deduplicated, and recoverable')
            review_row = sheet('outreach_review', dispatch['id'])['record']
            assert review_row['status'] == 'replied'
            assert review_row['outreach_template_ref'] == outreach_template['ref']
            assert review_row['creator_ref'] == creator['ref']
            checks.append('human-approved outreach is idempotently claimed, sent, replied, notified, and shown in Sheet review')

            manual_request_id = uuid.uuid4()
            manual_input = {
                'record_id': str(creator['id']),
                'recipient_email': 'fixture@example.test',
                'subject': 'Manual fixture email',
                'body': '<h2>Manual proposal</h2><p><strong>Reviewed</strong> HTML body.</p>',
                'reply_to_activity_id': None,
                'request_id': str(manual_request_id),
            }
            manual = workspace('prepare_email', manual_input)
            repeated_manual = workspace('prepare_email', manual_input)
            assert manual['id'] == repeated_manual['id']
            assert manual['outreach_template_id'] is None and manual['status'] == 'ready_for_review'
            rejects('manual email idempotency key cannot change input', lambda: workspace(
                'prepare_email', dict(manual_input, subject='Changed manual subject'),
            ))
            draft_conversation = workspace('creator_conversation', {
                'record_id': str(creator['id']), 'limit': 100,
            })
            assert any(item['id'] == str(manual['id']) for item in draft_conversation['dispatches'])
            manual = workspace('review_outreach', {
                'source': 'review',
                'record_id': str(manual['id']),
                'expected_version': manual['row_version'],
                'decision': 'approve',
                'request_id': str(uuid.uuid4()),
                'subject': manual['subject'],
                'body': manual['body'],
                'scheduled_at': (now - timedelta(minutes=1)).isoformat(),
                'review_note': 'Approved through the workspace contract',
            })
            manual_claim = conn.execute(
                'select public.gtm_outreach_worker_claim(%s,%s)',
                (manual['id'], 1),
            ).fetchone()[0]
            assert len(manual_claim) == 1 and manual_claim[0]['body'] == manual_input['body'], (manual, manual_claim)
            provider_id = str(uuid.uuid4())
            provider_rfc_id = '<manual-fixture@resend.test>'
            manual = conn.execute(
                'select public.gtm_outreach_worker_record_delivery(%s,%s,%s,%s,%s,%s)',
                (manual['id'], 'resend', provider_id, provider_rfc_id, None, now),
            ).fetchone()[0]
            assert manual['status'] == 'sent' and manual['provider'] == 'resend'
            resend_event_id = 'evt-' + uuid.uuid4().hex
            delayed = conn.execute(
                'select public.gtm_outreach_ingest_resend_delivery_event(%s,%s,%s,%s,%s,%s,%s)',
                (resend_event_id, provider_id, 'email.delivery_delayed',
                 'fixture@example.test', 'Recipient server temporarily deferred delivery',
                 now, False),
            ).fetchone()[0]
            assert delayed['matched'] and delayed['inserted'] and not delayed['notify_needed']
            repeated_delayed = conn.execute(
                'select public.gtm_outreach_ingest_resend_delivery_event(%s,%s,%s,%s,%s,%s,%s)',
                (resend_event_id, provider_id, 'email.delivery_delayed',
                 'fixture@example.test', 'Recipient server temporarily deferred delivery',
                 now, False),
            ).fetchone()[0]
            assert repeated_delayed['matched'] and not repeated_delayed['inserted']
            assert conn.execute(
                'select status from public.gtm_outreach_dispatches where id=%s',
                (manual['id'],),
            ).fetchone()[0] == 'sent'
            checks.append('Resend delivery events are durable, idempotent, and preserve delayed sends')
            conversation = workspace('creator_conversation', {
                'record_id': str(creator['id']), 'limit': 100,
            })
            assert any(
                item['kind'] == 'message_sent' and item['body'] == manual_input['body']
                for item in conversation['messages']
            )
            reply_request_id = uuid.uuid4()
            reply_draft = workspace('prepare_email', {
                'record_id': str(creator['id']),
                'recipient_email': 'fixture@example.test',
                'subject': 'Re: Final fixture subject',
                'body': '<p>Thanks for your reply.</p>',
                'reply_to_activity_id': str(reply['activity_id']),
                'request_id': str(reply_request_id),
            })
            assert reply_draft['reply_to_activity_id'] == str(reply['activity_id'])
            assert reply_draft['in_reply_to'] == '<reply@example.test>'
            assert dispatch['rfc_message_id'] in reply_draft['email_references']
            assert '<reply@example.test>' in reply_draft['email_references']
            checks.append('manual HTML email, review, Resend delivery, conversation, and threaded reply share one ledger')
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
            assert overview['contact_summary'] == 'email: fixture@example.test [active]'
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
            fixture_outreach = next(row for row in outreach if row['body'] == 'fixture outreach')
            assert fixture_reply['creator_ref'] == creator['ref']
            assert fixture_reply['direction'] == 'inbound'
            assert fixture_outreach['direction'] == 'outbound'
            assert fixture_outreach['outreach_template_ref'] == outreach_template['ref']
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
            bounce_event_id = 'evt-bounce-' + uuid.uuid4().hex
            bounced = conn.execute(
                'select public.gtm_outreach_ingest_resend_delivery_event(%s,%s,%s,%s,%s,%s,%s)',
                (bounce_event_id, provider_id, 'email.bounced',
                 'fixture@example.test', 'Mailbox does not exist', now, True),
            ).fetchone()[0]
            assert bounced['matched'] and bounced['inserted'] and bounced['notify_needed']
            assert bounced['creator_id'] == str(creator['id']) and bounced['permanent'] is True
            bounced_dispatch = conn.execute(
                'select status,last_error from public.gtm_outreach_dispatches where id=%s',
                (manual['id'],),
            ).fetchone()
            assert bounced_dispatch[0] == 'failed' and bounced_dispatch[1] == 'Mailbox does not exist'
            creator_contacts = conn.execute(
                'select contacts from public.gtm_creators where id=%s', (creator['id'],)
            ).fetchone()[0]
            assert any(
                item.get('address') == 'fixture@example.test' and item.get('status') == 'bounced'
                for item in creator_contacts
            )
            conn.execute(
                'select public.gtm_outreach_record_activity_slack_notification(%s,%s,%s)',
                (bounced['activity_id'], 'C_FIXTURE', '234.567'),
            )
            repeated_bounce = conn.execute(
                'select public.gtm_outreach_ingest_resend_delivery_event(%s,%s,%s,%s,%s,%s,%s)',
                (bounce_event_id, provider_id, 'email.bounced',
                 'fixture@example.test', 'Mailbox does not exist', now, True),
            ).fetchone()[0]
            assert repeated_bounce['matched'] and not repeated_bounce['inserted']
            assert not repeated_bounce['notify_needed']
            complaint_event_id = 'evt-complaint-' + uuid.uuid4().hex
            complained = conn.execute(
                'select public.gtm_outreach_ingest_resend_delivery_event(%s,%s,%s,%s,%s,%s,%s)',
                (complaint_event_id, provider_id, 'email.complained',
                 'fixture@example.test', 'Recipient reported this message as spam', now, True),
            ).fetchone()[0]
            assert complained['matched'] and complained['inserted'] and complained['notify_needed']
            complaint_contact = conn.execute(
                'select do_not_contact,contacts from public.gtm_creators where id=%s',
                (creator['id'],),
            ).fetchone()
            assert complaint_contact[0] is True
            assert any(
                item.get('address') == 'fixture@example.test' and item.get('status') == 'revoked'
                for item in complaint_contact[1]
            )
            conn.execute(
                'select public.gtm_outreach_record_activity_slack_notification(%s,%s,%s)',
                (complained['activity_id'], 'C_FIXTURE', '345.678'),
            )
            creator = api('get', 'gtm_creators', record=creator)['record']
            changed = creator
            checks.append('Resend bounces and complaints fail delivery, suppress contact, enforce do-not-contact, and deduplicate Slack')
            incomplete_creator = api('save', 'gtm_creators', {'name': 'Incomplete fixture'})['record']
            incomplete_overview = api('get', 'gtm_creators', record=incomplete_creator)['record']
            assert incomplete_overview['data_status'] == 'missing_accounts'
            assert {'activity_regions', 'content_topics', 'contact_method'} <= set(incomplete_overview['refresh_fields'])
            checks.append('creator default read exposes missing research instead of converting unknowns to zero')
            for text in ['Receive statistics', 'Reconcile payment']:
                collab = api('patch_item', 'gtm_collaborations', {'field': 'action_items', 'item': {
                    'id': str(uuid.uuid4()), 'text': text, 'status': 'open', 'owner_id': 'fixture',
                }}, record=collab)['record']
            assert len(collab['action_items']) == 2
            first_id = collab['action_items'][0]['id']
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
