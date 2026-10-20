"""Freeze the existing harper_eval cases/pairs for the Decisions comparison.

Reads downloaded, pinned artifacts only. No DB, network, model calls or labels changes.
"""
import hashlib
import json
import lzma
import os
from pathlib import Path

TASK = Path(__file__).resolve().parents[1] / 'docs/evaluation/external-decisions-summary-ranking'
SOURCE = TASK / 'private/source'
VERSION = '20260909-20261008/20261017T090550Z'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    os.umask(0o077)
    dest = TASK / 'private/frozen-v1'
    if dest.exists():
        raise SystemExit('Frozen dataset exists; do not overwrite it')
    cases_dir = SOURCE / 'talent/cases' / VERSION
    prep_dir = SOURCE / 'experiments/issue-1/prep/scoring-inputs-v1' / VERSION
    pairs_dir = SOURCE / 'experiments/issue-1/prep/pairs-v1' / VERSION
    cm = json.loads((cases_dir / 'manifest.json').read_text())
    pm = json.loads((prep_dir / 'manifest.json').read_text())
    for entry in cm['files']:
        assert sha(SOURCE / entry['path']) == entry['sha256']
    assert sha(prep_dir / 'inputs.jsonl') == pm['files']['inputs.jsonl']['sha256']
    assert sha(pairs_dir / 'pairs.jsonl') == pm['source']['pairs_sha256']
    inputs = {r['run_id']: r for r in map(json.loads, (prep_dir / 'inputs.jsonl').open())}
    pairs = [r for r in map(json.loads, (pairs_dir / 'pairs.jsonl').open()) if not inputs[r['run_id']].get('excluded')]
    wanted = {p['run_id'] for p in pairs}
    cases = []
    for file in sorted(cases_dir.glob('*.jsonl.xz')):
        with lzma.open(file, 'rt', encoding='utf8') as f:
            for line in f:
                case = json.loads(line)
                if case['run_id'] not in wanted:
                    continue
                row = inputs[case['run_id']]
                # Do not put feedback, old scores, shown rank, or post-run state in input.
                shown = sorted(case['shown'], key=lambda s: hashlib.sha256(
                    f"{case['run_id']}:{s['posting_id']}".encode()).hexdigest())
                roles = []
                for s in shown:
                    card = s['card']
                    assert card['roleId'] == s['posting_id']
                    entry = (card.get('roleSummary') or {}).get(row['locale']) or {}
                    content = entry.get('content')
                    content = content if isinstance(content, str) and content.strip() else None
                    roles.append({'recommendation_id': s['recommendation_id'], 'card': card,
                                  'summary_content': content, 'summary_metadata': {
                                      k: entry.get(k) for k in ('version', 'generatedAt', 'sourceHash')}})
                cases.append({'run_id': case['run_id'], 'talent_id': case['talent_id'],
                              'as_of': case['as_of'], 'locale': row['locale'],
                              'user_context': row['user_context'], 'roles': roles,
                              'brief_exact': row['brief_matches_run_log'].get('fingerprint') is True})
    cases.sort(key=lambda c: c['run_id'])
    assert len(cases) == 359 and len(pairs) == 2338
    assert len({c['talent_id'] for c in cases}) == 268
    aliases = {}
    talent_aliases = {v: f'T{i+1:03}' for i, v in enumerate(sorted({c['talent_id'] for c in cases}))}
    for i, c in enumerate(cases):
        c['case_alias'] = f'C{i+1:03}'
        c['talent_alias'] = talent_aliases[c['talent_id']]
        for j, role in enumerate(c['roles']):
            role['alias'] = f"{c['case_alias']}-R{j+1:02}"
            aliases[role['recommendation_id']] = role['alias']
    gold = {'version': 'pairs-v1-aliases', 'sourceRule': 'harper_eval pairs-v1, unchanged',
            'pairs': [{'like': aliases[p['like']['recommendation_id']],
                       'dislike': aliases[p['dislike']['recommendation_id']],
                       'talent': talent_aliases[p['talent_id']]} for p in pairs]}
    with (TASK/'gold-v1.json').open('x') as f:
        json.dump(gold, f, indent=2)
        f.write('\n')
    dest.mkdir(parents=True, mode=0o700)
    for name, values in [('cases.jsonl', cases), ('pairs.jsonl', pairs)]:
        with (dest / name).open('x', encoding='utf8') as f:
            for row in values:
                f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n')
    roles = [r for c in cases for r in c['roles']]
    manifest = {
        'datasetVersion': 'harper-eval-decisions-summary-v1',
        'harper_eval_commit': '8b4eadeffa2f63149bce408f6fef611316b74fe5',
        'casesVersion': f'talent/cases/{VERSION}',
        'prepVersion': f'experiments/issue-1/prep/scoring-inputs-v1/{VERSION}',
        'goldVersion': f'experiments/issue-1/prep/pairs-v1/{VERSION}',
        'summarySource': 'Historical shown[].card.roleSummary[locale].content; no new summaries or pool data',
        'cases': len(cases), 'talents': 268, 'roles': len(roles), 'pairs': len(pairs),
        'summaryRoles': sum(bool(r['summary_content']) for r in roles),
        'fallbackRawRoles': sum(not r['summary_content'] for r in roles),
        'sourceFiles': {str(p.relative_to(SOURCE)): sha(p) for p in [
            *sorted(cases_dir.glob('*')), prep_dir/'inputs.jsonl', prep_dir/'manifest.json',
            pairs_dir/'pairs.jsonl', pairs_dir/'manifest.json']},
        'files': {name: sha(dest / name) for name in ('cases.jsonl', 'pairs.jsonl')},
        'limitations': ['Only historically shown roles; max 15 per run, not full pre-rerank pool',
                        'Historical input restoration limitations are inherited from scoring-inputs-v1',
                        'Summaries may omit original requirements; their content is not regenerated'],
    }
    (dest/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print(json.dumps({k: manifest[k] for k in ('cases','talents','roles','pairs','summaryRoles','fallbackRawRoles')}))


if __name__ == '__main__':
    main()
