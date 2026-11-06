"""Select 50 historical users without model results; preserve source gold and inputs."""
import collections
import hashlib
import json
import lzma
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TASK = ROOT / 'docs/evaluation/external-company-value'
SOURCE = TASK / 'private/source-v2'
EXPECTED = {
    'inputs.jsonl': '3f9c032105a18c08032167ae5b99e9daf8809c49b13462042bc7699022e8f0ec',
    'pairs.jsonl': 'd99e3c04c33c7d85bc1df43fced78b73d6e1a691a98db9f37ebeabeb88b03c93',
    'part-000.jsonl.xz': 'c4351396c9704941435ca42f02fdbba0f1ad81725b45ae2297a2fcfde1cacb30',
    'part-001.jsonl.xz': 'f916d2530620fba3beddbd87ba9adb4cea425a02f2b15583124fd30ba8c0117d',
}


def main():
    os.umask(0o077)
    for name, expected in EXPECTED.items():
        assert hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() == expected
    inputs = [json.loads(line) for line in (SOURCE / 'inputs.jsonl').open()]
    pairs = [json.loads(line) for line in (SOURCE / 'pairs.jsonl').open()]
    paired_runs = {p['run_id'] for p in pairs}
    eligible = [r for r in inputs if not r.get('excluded') and r['run_id'] in paired_runs
                and r['brief_matches_run_log']['fingerprint'] is True
                and r['versus_case']['profile_row_unchanged'] is True
                and r['versus_case']['experiences_same'] is True
                and r['versus_case']['educations_same'] is True]
    # One latest eligible run per user. Stable hash sampling; no score/company/reason filtering.
    latest = {}
    for row in sorted(eligible, key=lambda r: (r['as_of'], r['run_id'])):
        latest[row['talent_id']] = row
    users = sorted(latest, key=lambda u: hashlib.sha256(('company-value-v2:' + u).encode()).hexdigest())[:50]
    assert len(users) == 50
    chosen = {latest[u]['run_id']: latest[u] for u in users}
    chosen_pairs = [p for p in pairs if p['run_id'] in chosen]
    wanted = {p[side]['recommendation_id'] for p in chosen_pairs for side in ['like', 'dislike']}
    labels = {p[side]['recommendation_id']: side for p in chosen_pairs for side in ['like', 'dislike']}
    rows = []
    for name in ['part-000.jsonl.xz', 'part-001.jsonl.xz']:
        with lzma.open(SOURCE / name, 'rt') as source:
            for line in source:
                case = json.loads(line)
                if case['run_id'] not in chosen:
                    continue
                context = chosen[case['run_id']]
                for shown in case['shown']:
                    if shown['recommendation_id'] not in wanted:
                        continue
                    rows.append({'recommendation_id': shown['recommendation_id'],
                                 'talent_id': case['talent_id'], 'run_id': case['run_id'],
                                 'role_id': shown['posting_id'], 'feedback': labels[shown['recommendation_id']],
                                 'as_of': case['as_of'], 'locale': context['locale'],
                                 'context': context['user_context'], 'card': shown['card'],
                                 'source_shown': shown,
                                 'restoration': {'brief_exact': True,
                                                 'profile_row_unchanged': True,
                                                 'behavior_source': context['behavior']['source'],
                                                 'withheld': context['withheld']}})
    assert {r['recommendation_id'] for r in rows} == wanted
    rows.sort(key=lambda r: (users.index(r['talent_id']), hashlib.sha256(r['recommendation_id'].encode()).hexdigest()))
    for user in users:
        assert {r['feedback'] for r in rows if r['talent_id'] == user} == {'like', 'dislike'}
    result = {'sourceCommit': '8b4eadeffa2f63149bce408f6fef611316b74fe5',
              'sourceHashes': EXPECTED, 'eligibleUsers': len(latest), 'selectedUsers': 50,
              'selection': 'sha256(company-value-v2:talent_id); one latest eligible paired run per user',
              'pairs': chosen_pairs, 'rows': rows}
    with (TASK / 'private/history-v2.json').open('x') as out:
        json.dump(result, out, ensure_ascii=False)
    # Compare the current JD with the frozen card before using current salary enrichment.
    role_hashes = sorted({(r['role_id'], hashlib.md5(re.sub(r'[ \t\n\r\f\v]', '', r['card']['roleDescription']).encode()).hexdigest()) for r in rows})
    values = ',\n'.join("('%s'::uuid,'%s')" % item for item in role_hashes)
    query = """with frozen(role_id,jd_md5) as (values %s)
select c.role_id, f.jd_md5, md5(regexp_replace(c.description, '[[:space:]]', '', 'g'))=f.jd_md5 as same_jd,
lower(coalesce(c.information->>'testOnly','false'))='true' as test_only,
jsonb_build_object('salary_is_predicted',c.salary_is_predicted,'salary_min',c.salary_min,
'salary_max',c.salary_max,'salary_currency',c.salary_currency,'salary_period',c.salary_period) as salary
from frozen f join public.company_roles c on c.role_id=f.role_id order by c.role_id,f.jd_md5""" % values
    (TASK / 'private/salary-normalized-capture-v2.sql').write_text(query)
    print(json.dumps({'users': len(users), 'cases': len(rows), 'pairs': len(chosen_pairs),
                      'positive': sum(r['feedback'] == 'like' for r in rows),
                      'negative': sum(r['feedback'] == 'dislike' for r in rows),
                      'behavior': dict(collections.Counter(r['behavior']['source'] for r in chosen.values())),
                      'first': min(r['as_of'] for r in rows), 'last': max(r['as_of'] for r in rows),
                      'cardKeys': list(rows[0]['card']), 'shownKeys': list(rows[0]['source_shown'])}))


def finalize():
    os.umask(0o077)
    history_path = TASK / 'private/history-v2.json'
    salary_path = TASK / 'private/salaries-normalized-v2.json'
    history = json.loads(history_path.read_text())
    captured = json.loads(salary_path.read_text())
    salaries = {(s['role_id'], s['jd_md5']): s for s in captured['rows']}
    rows = []
    for row in history['rows']:
        digest = hashlib.md5(re.sub(r'[ \t\n\r\f\v]', '', row['card']['roleDescription']).encode()).hexdigest()
        salary = salaries.get((row['role_id'], digest), {})
        assert not salary.get('test_only'), 'Test role: revise selection before freezing'
        rows.append({**{k: row[k] for k in ['recommendation_id', 'talent_id', 'run_id', 'role_id', 'feedback', 'as_of', 'locale', 'card', 'restoration']},
                     'input_snapshot': {'context': row['context']},
                     'salary': salary.get('salary', {}), 'same_jd': salary.get('same_jd', False),
                     'reaction': row['source_shown']['reaction']})
    capture = {'capturedAt': captured['capturedAt'], 'rows': rows,
               'selection': history['selection'],
               'historicalSource': {'commit': history['sourceCommit'], 'files': history['sourceHashes'],
                                    'historyHash': hashlib.sha256(history_path.read_bytes()).hexdigest(),
                                    'eligibleUsers': history['eligibleUsers'],
                                    'behavior': dict(collections.Counter(next(r for r in rows if r['talent_id'] == user)['restoration']['behavior_source'] for user in {r['talent_id'] for r in rows}))},
               'salaryCaptureHash': hashlib.sha256(salary_path.read_bytes()).hexdigest(),
               'firstRecommendation': min(r['as_of'] for r in rows),
               'lastRecommendation': max(r['as_of'] for r in rows)}
    with (TASK / 'private/capture-v2.json').open('x') as out:
        json.dump(capture, out, ensure_ascii=False)
    print(json.dumps({'rows': len(rows), 'same_jd': sum(r['same_jd'] for r in rows),
                      'estimated_salary': sum(r['same_jd'] and r['salary'].get('salary_is_predicted', False) for r in rows),
                      'historicalPairs': len(history['pairs']),
                      'reactionKeys': list(rows[0]['reaction'])}))


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'finalize':
        finalize()
    else:
        main()
