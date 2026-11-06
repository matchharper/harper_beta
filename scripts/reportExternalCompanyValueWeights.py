"""Offline paired weight comparison; never calls a model or production service."""
import hashlib
import json
from pathlib import Path

TASK = Path(__file__).resolve().parents[1] / 'docs/evaluation/external-company-value'
ARMS = ['baseline', 'salary', 'prompt', 'previousCombined', 'combined']
WEIGHTS = {'30/50/10/10': [.30, .50, .10, .10], '45/35/10/10': [.45, .35, .10, .10]}
AXES = ['mutualFit', 'candidateInterest', 'companyInterest', 'roleFit']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def score(row, arm, weights):
    return sum(row['fits'][arm][axis] * weight for axis, weight in zip(AXES, weights))


def ordering(rows, arm, weights):
    positive = [r for r in rows if r['label'] == 1]
    negative = [r for r in rows if r['label'] == 0]
    result = []
    for p in positive:
        for n in negative:
            a, b = score(p, arm, weights), score(n, arm, weights)
            result.append(1 if a > b else .5 if a == b else 0)
    return result


def mean(values):
    return sum(values) / len(values)


def difference(before, after):
    changes = [b - a for a, b in zip(before, after)]
    seed = 20261106
    replicates = []
    for _ in range(2000):
        sample = []
        for _ in changes:
            seed = (1664525 * seed + 1013904223) & 0xffffffff
            sample.append(changes[int(seed / 4294967296 * len(changes))])
        replicates.append(mean(sample))
    replicates.sort()
    return {'delta': mean(changes), 'lower95': replicates[50], 'upper95': replicates[1950],
            'improvedUsers': sum(x > 0 for x in changes),
            'worseUsers': sum(x < 0 for x in changes), 'tiedUsers': sum(x == 0 for x in changes)}


def main():
    result_path = TASK / 'runs/v2/paired-results.json'
    rows = json.loads(result_path.read_text())
    gold = json.loads((TASK / 'gold-v2.json').read_text())
    assert [{k: r[k] for k in ['id', 'user', 'label']} for r in rows] == gold
    manifest = json.loads((TASK / 'manifest-v2.json').read_text())
    assert sha(TASK / 'private/fixture-v2.json') == manifest['fixtureHash']
    users = list(dict.fromkeys(r['user'] for r in rows))
    assert len(rows) == 265 and len(users) == 50
    original = json.loads((TASK / 'reports/summary-v2.json').read_text())
    baseline = {m['arm']: m for m in original['metrics']}
    metrics, by_arm = [], {}
    for arm in ARMS:
        values = {}
        pair_outcomes = {}
        for name, weights in WEIGHTS.items():
            pairs = [ordering([r for r in rows if r['user'] == user], arm, weights) for user in users]
            assert all(pairs) and sum(map(len, pairs)) == 438
            values[name] = [mean(p) for p in pairs]
            pair_outcomes[name] = [value for p in pairs for value in p]
            existing_key = 'current' if name == '30/50/10/10' else 'moderate'
            assert abs(mean(values[name]) - baseline[arm]['withinUserWeights'][existing_key]) < 1e-12
        old, new = list(WEIGHTS)
        by_arm[arm] = values
        metrics.append({'arm': arm,
                        'macro': {k: mean(v) for k, v in values.items()},
                        'pooledPairs': {k: mean(v) for k, v in pair_outcomes.items()},
                        'weightChange': difference(values[old], values[new]),
                        'pairChanges': {'better': sum(b > a for a, b in zip(pair_outcomes[old], pair_outcomes[new])),
                                        'worse': sum(b < a for a, b in zip(pair_outcomes[old], pair_outcomes[new])),
                                        'same': sum(b == a for a, b in zip(pair_outcomes[old], pair_outcomes[new]))}})
    arm_comparisons = {arm: difference(by_arm['baseline']['45/35/10/10'], by_arm[arm]['45/35/10/10'])
                       for arm in ARMS if arm != 'baseline'}
    report = {'datasetVersion': 'v2', 'users': 50, 'cases': 265, 'pairs': 438,
              'weights': WEIGHTS, 'metrics': metrics, 'versusBaselineAt4535': arm_comparisons,
              'bootstrap': {'unit': 'user', 'replicates': 2000, 'seed': 20261106},
              'sourceHashes': {'pairedResults': sha(result_path), 'gold': sha(TASK / 'gold-v2.json'),
                               'fixture': manifest['fixtureHash'], 'runner': sha(Path(__file__))},
              'additionalModelCalls': 0, 'additionalCostUsd': 0,
              'scope': 'Offline weight comparison; no runtime settings or frozen inputs changed'}
    output = TASK / 'reports/weights-v2-45-35.json'
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
