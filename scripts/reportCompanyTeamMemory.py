"""Measure actual team Memory artifacts; leave meaning to manual review."""
import argparse
import collections
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path

TASK = Path(__file__).resolve().parents[1] / 'docs/evaluation/company-agentic-role-search'


def read(path):
    return json.loads(path.read_text())


def stable(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', required=True)
    args = parser.parse_args()
    directory = (TASK / 'runs' / args.run).resolve()
    if directory.parent != (TASK / 'runs').resolve():
        raise ValueError('Registered run directory required')
    manifest = read(directory / 'manifest.json')
    before, after = (read(directory / name) for name in ['state-before.json', 'state-after.json'])
    delta = {}
    for table in before:
        old, new = (collections.Counter(stable(row) for row in rows) for rows in [before[table], after[table]])
        delta[table] = {'identical': old == new, 'beforeRows': len(before[table]), 'afterRows': len(after[table]),
                        'removedOrPriorRows': sum((old - new).values()), 'addedOrRevisedRows': sum((new - old).values())}
    usage = {}
    provider_calls = []
    for file in sorted(directory.glob('provider-*.json')):
        artifact = read(file)
        response = json.loads(artifact['response']) if artifact.get('response') else {}
        model = (artifact.get('request') or {}).get('model', 'unknown')
        tokens = response.get('usage') or {}
        u = usage.setdefault(model, {'calls': 0, 'inputTokens': 0, 'cachedInputTokens': 0, 'outputTokens': 0,
                                     'providerReportedCostUsd': None, 'callsWithoutReportedCost': 0, 'failedResponses': 0})
        u['calls'] += 1
        u['inputTokens'] += tokens.get('input_tokens', tokens.get('prompt_tokens', 0))
        u['cachedInputTokens'] += (tokens.get('input_tokens_details') or tokens.get('prompt_tokens_details') or {}).get('cached_tokens', 0)
        u['outputTokens'] += tokens.get('output_tokens', tokens.get('completion_tokens', 0))
        if isinstance(tokens.get('cost'), (int, float)):
            u['providerReportedCostUsd'] = (u['providerReportedCostUsd'] or 0) + tokens['cost']
        else:
            u['callsWithoutReportedCost'] += 1
        failed = bool(artifact.get('error')) or artifact.get('status', 0) >= 400 or bool(response.get('error'))
        u['failedResponses'] += failed
        provider_calls.append({'file': file.name, 'model': model, 'elapsedMs': artifact.get('elapsedMs'), 'failed': failed})
    trace = read(directory / 'tool-trace.json')
    calls = collections.Counter(entry['name'] for entry in trace)
    result = {'runId': args.run, 'generatedAt': datetime.now(timezone.utc).isoformat(),
              'executionStatus': manifest['executionStatus'], 'semanticQuality': 'requires_manual_review',
              'sourceDrift': manifest['sourceChangedDuringRun'],
              'initialStateHash': hashlib.sha256(stable({table: sorted(rows, key=stable) for table, rows in before.items()}).encode()).hexdigest(),
              'elapsedMs': round((datetime.fromisoformat(manifest['finishedAt'].replace('Z', '+00:00')) - datetime.fromisoformat(manifest['startedAt'].replace('Z', '+00:00'))).total_seconds() * 1000),
              'executorCalls': len(trace), 'executorDistribution': calls, 'companyCompletions': len(read(directory / 'completions.json')),
              'providerUsage': usage, 'providerCalls': provider_calls, 'stateChanges': delta,
              'memoryAfterEachTurn': [read(file) for file in sorted(directory.glob('turn-*-memory.json'))],
              'limitations': ['Organization-authorized actor only; no actual team-restricted teammate in source.',
                             'Different actual company/team capture; not part of original16 paid-role matching score.',
                             'Local authentication/PostgREST transport; production writes and external delivery are absent.',
                             'Missing provider cost remains unknown, not zero.']}
    os.umask(0o077)
    (directory / 'aggregate.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'run': args.run, 'usage': usage, 'changedTables': [table for table, value in delta.items() if not value['identical']]}))


if __name__ == '__main__':
    main()
