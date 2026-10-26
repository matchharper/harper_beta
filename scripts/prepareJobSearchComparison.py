"""Freeze five captured timeout queries for the local Ops comparison page.

Usage: python3 scripts/prepareJobSearchComparison.py <capture directory>
Input is the private manifest from the opportunity SQL investigation. No DB writes.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import sys

os.umask(0o077)
source = Path(sys.argv[1])
destination = Path('.local/job-search-comparison/cases.json')
manifest = json.loads((source / 'manifest.json').read_text())


def conjunctions(sql):
    """Split generated SQL only at unquoted, top-level AND boundaries."""
    parts, start, depth, quoted, i = [], 0, 0, False, 0
    while i < len(sql):
        char = sql[i]
        if char == "'":
            if quoted and i + 1 < len(sql) and sql[i + 1] == "'":
                i += 2
                continue
            quoted = not quoted
        elif not quoted:
            if char == '(':
                depth += 1
            elif char == ')':
                depth -= 1
            elif depth == 0 and sql[i:i+5] == ' AND ':
                parts.append(sql[start:i].strip())
                start = i + 5
        i += 1
    parts.append(sql[start:].strip())
    return parts


cases = []
for number in [1, 12, 20, 25, 33]:
    entry = next(row for row in manifest if row['case'] == number)
    raw = Path(entry['variants']['baseline']['path']).read_text()
    assert hashlib.sha256(raw.encode()).hexdigest() == entry['variants']['baseline']['sha256']
    assert raw.startswith('SELECT to_jsonb(result) FROM (') and raw.endswith(') result')
    original = raw[len('SELECT to_jsonb(result) FROM ('):-len(') result')]
    vectors = re.findall(r"'(\[[^']+\])'::public.halfvec\(1536\)", original)
    assert vectors and len(set(vectors)) == 1
    vector = json.loads(vectors[0])
    assert len(vector) == 1536
    candidate_limits = set(re.findall(r'ORDER BY distance LIMIT (\d+)', original))
    assert len(candidate_limits) == 1
    candidate_limit = int(next(iter(candidate_limits)))
    result_limit = int(re.search(r'LIMIT (\d+)$', original)[1])
    where = original.split('\n WHERE ', 1)[1].split('\n ORDER BY distance', 1)[0]
    filters = {key: [] for key in ['postingRecency', 'excludeIntern', 'excludeParttime', 'excludeContract', 'remote', 'eligibility']}
    for clause in conjunctions(where):
        if 'cr.country_code' in clause:
            # Country membership is an independent exact-match toggle. Preserve
            # only remote-only requirements in the separate remote toggle.
            for codes in re.findall(r"cr.country_code IN \(([^)]+)\) AND lower\(coalesce\(cr.work_mode,''\)\)='remote'", clause):
                filters['remote'].append(f"(cr.country_code NOT IN ({codes}) OR lower(coalesce(cr.work_mode,''))='remote')")
        elif 'FROM unnest(COALESCE(cr.type' in clause:
            key = 'excludeIntern' if "'internship'" in clause else 'excludeParttime' if "'part_time'" in clause else 'excludeContract'
            filters[key].append(clause)
        elif 'cr.posted_at >=' in clause:
            filters['postingRecency'].append(clause)
        elif 'cr.work_mode' in clause:
            filters['remote'].append(clause)
        elif any(value in clause for value in ['cw.', 'cd.', 'talent_opportunity_recommendation', 'cr.role_id NOT IN']):
            filters['eligibility'].append(clause)
        else:
            assert any(value in clause for value in ['cr.source_type', 'cr.source_provider', 'cr.is_expired', 'cr.expires_at', 'cr.status', 'cr.information', 'cr.title_embedding', 'SELECT at FROM started']), clause
    expressions = original.split('), signals AS MATERIALIZED (', 1)[1].split(' FROM nearest cr', 1)[0].split('cr.distance, ', 1)[1]
    fts, rest = expressions.split(' AS lexical_score,\n', 1)
    salary, rest = rest.split(' AS salary_utility,\n', 1)
    seniority, recency = rest.split(' AS entry_preference_score,\n', 1)
    scores = dict(fts=fts.strip(), salary=salary.strip(), seniority=seniority.strip(), postingRecency=recency.removesuffix(' AS recency_score\n').strip())
    assert 'AS recency_score' not in scores['postingRecency']
    remote_only_countries = []
    remote_mode = 'any'
    for clause in filters['remote']:
        conditional = re.fullmatch(r"\(cr.country_code NOT IN \(([^)]+)\) OR lower\(coalesce\(cr.work_mode,''\)\)='remote'\)", clause)
        if conditional:
            remote_only_countries.extend(re.findall(r"'([A-Z]{2})'", conditional[1]))
        elif clause == "lower(coalesce(cr.work_mode,''))='remote'":
            remote_mode = 'only'
        elif clause == "NOT (lower(coalesce(cr.work_mode,''))='remote')":
            remote_mode = 'exclude'
        else:
            raise ValueError(f'Unrecognized captured remote filter: {clause}')
    weights = dict((code, float(weight)) for code, weight in re.findall(r"\('([A-Z]{2})',([0-9.]+)::numeric,\d+\)", original))
    assert not weights or set(weights) == set(entry['countries'])
    country_weights = [dict(countryCode=code, weight=weights.get(code, 1), remoteOnly=code in remote_only_countries) for code in entry['countries']]
    cases.append(dict(
        id=f'case-{number:02}', capturedAt=entry['completed_at'], failure=entry['error_type'],
        countries=entry['countries'], countryWeights=country_weights, remoteMode=remote_mode, remoteOnlyCountries=remote_only_countries, vector=vector, originalSql=original,
        candidateLimit=candidate_limit, resultLimit=result_limit,
        sourceSha256=entry['variants']['baseline']['sha256'], filters=filters, scores=scores,
    ))
destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
destination.write_text(json.dumps(cases, ensure_ascii=False))
destination.chmod(0o600)
print(f'Prepared {len(cases)} private cases: {destination}')
