"""Recompute all metrics from frozen inputs and saved receipts, without API calls."""
import hashlib
import json
import math
import os
import random
import statistics
from collections import Counter, defaultdict
from pathlib import Path

TASK = Path(__file__).resolve().parents[1] / 'docs/evaluation/external-decisions-summary-ranking'
RUN = TASK / 'runs/20261020-summary-four-axis-v1'
FROZEN = TASK / 'private/frozen-v1'
REPORT = TASK / 'reports/2026-10-20-summary-four-axis-v1'
ARMS = ['baseline-r1', 'baseline-r2', 'treatment-r1', 'treatment-r2']


def read(p):
    return json.loads(p.read_text())


def lines(p):
    return [json.loads(s) for s in p.read_text().split('\n') if s]


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def save(p, value):
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')


def pct(values, q):
    values = sorted(values)
    if not values:
        return None
    p = (len(values)-1)*q
    a, b = math.floor(p), math.ceil(p)
    return values[a]*(b-p)+values[b]*(p-a) if a != b else values[a]


def outcome(a, b):
    if a is None or b is None:
        return .5, 'missing'
    if a == b:
        return .5, 'tie'
    return (1., 'like_ahead') if a > b else (0., 'dislike_ahead')


def cluster_bootstrap(rows, repeats=10000):
    # Resample talent clusters with all of their repeated runs/pairs together.
    groups = defaultdict(lambda: [0, 0., 0.])
    for r in rows:
        g = groups[r['talent']]
        g[0] += 1
        g[1] += r['baseline']
        g[2] += r['treatment']
    gs = list(groups.values())
    n = sum(g[0] for g in gs)
    means = [sum(g[k] for g in gs)/n for k in (1, 2)]
    rng = random.Random(20261015)
    bs, ts, ds = [], [], []
    for _ in range(repeats):
        chosen = rng.choices(gs, k=len(gs))
        d = sum(g[0] for g in chosen)
        b, t = sum(g[1] for g in chosen)/d, sum(g[2] for g in chosen)/d
        bs.append(b); ts.append(t); ds.append(t-b)
    return {'pairs': n, 'talents': len(gs), 'baseline': means[0], 'treatment': means[1],
            'delta': means[1]-means[0], 'baseline_ci95': [pct(bs,.025),pct(bs,.975)],
            'treatment_ci95': [pct(ts,.025),pct(ts,.975)],
            'delta_ci95': [pct(ds,.025),pct(ds,.975)]}


def main():
    os.umask(0o077)
    manifest = read(RUN/'manifest.json')
    assert sha(RUN/'requests.jsonl') == manifest['requestsSha256']
    for name, h in manifest['frozen']['files'].items():
        assert sha(FROZEN/name) == h
    cases = lines(FROZEN/'cases.jsonl')
    by_case = {c['run_id']: c for c in cases}
    pairs = lines(FROZEN/'pairs.jsonl')
    jobs = lines(RUN/'requests.jsonl')
    scores = {a: {} for a in ARMS}
    fits = {a: {} for a in ARMS}
    usage = {a: Counter() for a in ARMS}
    latency = {a: [] for a in ARMS}
    receipts_hashes = {}
    raw_scores = []
    errors = []
    starts, ends = [], []
    for j in jobs:
        p = RUN/'receipts'/f"{j['id']}.json"
        if not p.exists():
            raise SystemExit(f'Incomplete run: {p.name}')
        r = read(p)
        assert r['requestSha256'] == j['requestSha256']
        a = f"{j['arm']}-r{j['repeat']}"
        u = usage[a]
        u['calls'] += 1
        u['roles_expected'] += len(j['roles'])
        u['valid_roles'] += len(r['evaluations'])
        u['failed_calls'] += bool(r['errors'])
        if r['errors']:
            errors.append({'id':j['id'],'errors':r['errors']})
        u['attempts'] += len(r['attempts'])
        u['retry_attempts'] += max(0,len(r['attempts'])-1)
        u['input_tokens'] += (r['usage'] or {}).get('input_tokens',0)
        u['output_tokens'] += (r['usage'] or {}).get('output_tokens',0)
        cached = ((r['usage'] or {}).get('input_tokens_details') or {}).get('cached_tokens',0)
        u['cached_tokens'] += cached
        for attempt in r['attempts']:
            au = (attempt.get('response') or {}).get('usage')
            if au and isinstance(au.get('input_tokens'), (int,float)):
                inp = au['input_tokens']; cache = (au.get('input_tokens_details') or {}).get('cached_tokens',0)
                u['receipts_with_usage'] += 1
                if isinstance(au.get('cost'),(int,float)):
                    u['provider_reported_usd'] += au['cost'];u['provider_cost_receipts'] += 1
                else:
                    u['estimated_usd'] += max(0,inp-cache)*.1/1e6
                u['costed_input_tokens'] += inp
            elif attempt.get('httpStatus') not in (400,401,403,404,429):
                u['unknown_cost_attempts'] += 1
            starts.append(attempt['startedAt'])
        u['known_cost_usd'] = u['estimated_usd']+u['provider_reported_usd']
        latency[a].append(r['elapsedMs'])
        ends.append(r['finishedAt'])
        by_role = {e['roleId']:e for e in r['evaluations']}
        for role in j['roles']:
            rid = role['recommendation_id']
            assert rid not in scores[a]
            e = by_role.get(role['role_id'])
            scores[a][rid] = e['score'] if e else None
            fits[a][rid] = e['fit'] if e else None
            raw_scores.append({'arm':a,'run_id':j['run_id'],'recommendation_id':rid,
                               'role_id':role['role_id'],'score':scores[a][rid],'fit':fits[a][rid]})
        receipts_hashes[p.name] = sha(p)
    for a,u in usage.items():
        u['mean_ms'] = statistics.mean(latency[a])
        u['p50_ms'] = pct(latency[a],.5)
        u['p95_ms'] = pct(latency[a],.95)
        u['usd_per_1000_roles'] = u['known_cost_usd']/u['roles_expected']*1000
        u['input_per_role'] = u['input_tokens']/u['roles_expected']
    outcome_counts = {a:Counter() for a in ARMS}
    rows=[]
    summary_by_rid={r['recommendation_id']:bool(r['summary_content']) for c in cases for r in c['roles']}
    for p in pairs:
        c=by_case[p['run_id']];l=p['like']['recommendation_id'];d=p['dislike']['recommendation_id']
        values={}
        for a in ARMS:
            value,label=outcome(scores[a][l],scores[a][d]);values[a]=value;outcome_counts[a][label]+=1
        rows.append({'talent':c['talent_alias'],'case':c['case_alias'],
                     'baseline':(values['baseline-r1']+values['baseline-r2'])/2,
                     'treatment':(values['treatment-r1']+values['treatment-r2'])/2,
                     'values':values,'brief_exact':c['brief_exact'],
                     'both_summaries':summary_by_rid[l] and summary_by_rid[d]})
    aggregate={}
    clusters=[]
    for name, subset in [('all',rows),('brief_exact',[r for r in rows if r['brief_exact']]),
                         ('both_summaries',[r for r in rows if r['both_summaries']]),
                         ('any_raw_fallback',[r for r in rows if not r['both_summaries']])]:
        if not subset:continue
        aggregate[name]=cluster_bootstrap(subset)
        gs=defaultdict(lambda:{'pairs':0,'baseline_sum':0.,'treatment_sum':0.,**{a+'_sum':0. for a in ARMS}})
        for r in subset:
            g=gs[r['talent']];g['pairs']+=1;g['baseline_sum']+=r['baseline'];g['treatment_sum']+=r['treatment']
            for a in ARMS:g[a+'_sum']+=r['values'][a]
        clusters += [{'slice':name,'cluster':t,**g} for t,g in sorted(gs.items())]
    accuracy={a:sum(r['values'][a] for r in rows)/len(rows) for a in ARMS}
    stability={}
    for arm in ('baseline','treatment'):
        a,b=arm+'-r1',arm+'-r2'
        common=[rid for rid in scores[a] if scores[a][rid] is not None and scores[b][rid] is not None]
        stability[arm]={'accuracy_delta_r2_minus_r1':accuracy[b]-accuracy[a],
          'pair_decisions_changed':sum(r['values'][a]!=r['values'][b] for r in rows),
          'median_absolute_score_change':statistics.median(abs(scores[a][rid]-scores[b][rid]) for rid in common),
          'constraint_boundary_changes':sum((fits[a][rid]['constraintPass']>50)!=(fits[b][rid]['constraintPass']>50) for rid in common)}
    constraints={}
    for repeat in (1,2):
        a,b=f'baseline-r{repeat}',f'treatment-r{repeat}'
        common=[rid for rid in fits[a] if fits[a][rid] is not None and fits[b][rid] is not None]
        constraints[str(repeat)]={'roles':len(common),
            'baseline_blocked':sum(fits[a][rid]['constraintPass']<=50 for rid in common),
            'treatment_blocked':sum(fits[b][rid]['constraintPass']<=50 for rid in common),
            'baseline_blocked_treatment_pass':sum(fits[a][rid]['constraintPass']<=50<fits[b][rid]['constraintPass'] for rid in common),
            'baseline_pass_treatment_blocked':sum(fits[b][rid]['constraintPass']<=50<fits[a][rid]['constraintPass'] for rid in common)}
    # Existing harper_eval normalized mean rank gap, with shared average places for ties.
    gaps={}
    for a in ARMS:
        places={}
        for c in cases:
            vals=[(r['recommendation_id'],scores[a][r['recommendation_id']]) for r in c['roles'] if scores[a][r['recommendation_id']] is not None]
            for rid,v in vals:
                places[rid]=(sum(w>v for _,w in vals)+(sum(w==v for _,w in vals)+1)/2)/len(vals)
        gaps[a]=statistics.mean(places[p['dislike']['recommendation_id']]-places[p['like']['recommendation_id']]
            if p['like']['recommendation_id'] in places and p['dislike']['recommendation_id'] in places else 0 for p in pairs)
    combined={}
    for arm in ('baseline','treatment'):
        us=[usage[f'{arm}-r{i}'] for i in (1,2)]
        combined[arm]={k:sum(u[k] for u in us) for k in ('calls','roles_expected','valid_roles','input_tokens','cached_tokens','known_cost_usd','unknown_cost_attempts','failed_calls')}
        combined[arm]['cost_per_repeat_usd']=combined[arm]['known_cost_usd']/2
        combined[arm]['cost_per_1000_roles_usd']=combined[arm]['known_cost_usd']/combined[arm]['roles_expected']*1000
        times=latency[arm+'-r1']+latency[arm+'-r2']
        combined[arm].update(mean_ms=statistics.mean(times),p50_ms=pct(times,.5),p95_ms=pct(times,.95))
    delta={k:combined['treatment'][k]/combined['baseline'][k]-1 for k in ('input_tokens','known_cost_usd','p50_ms','p95_ms','mean_ms')}
    gate={'noninferiority_margin':-.02,'quality_noninferiority_demonstrated':aggregate['all']['delta_ci95'][0]>-.02 and not errors,
          'quality_improvement_demonstrated':aggregate['all']['delta_ci95'][0]>0 and not errors,
          'structural_errors':len(errors),'not_deployment_approval':True}
    result={'createdAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
            'dataset':manifest['frozen'],'accuracy':accuracy,'pair_outcomes':outcome_counts,'paired':aggregate,
            'rank_gap':gaps,'repeat_stability':stability,'constraint_changes_not_gold':constraints,
            'usage_by_repeat':usage,'combined':combined,'relative_change':delta,'gate':gate,
            'run_started_at':min(starts),'run_finished_at':max(ends),
            'reporter_sha256':sha(Path(__file__)),'pricing':manifest['price'],
            'sources':manifest['source'],'limitations':manifest['limitations']}
    save(RUN/'metrics.json',result)
    save(RUN/'errors.json',errors)
    save(RUN/'receipt-hashes.json',receipts_hashes)
    with (RUN/'scores.jsonl').open('w') as f:
        for r in raw_scores:f.write(json.dumps(r)+'\n')
    REPORT.mkdir(parents=True,exist_ok=True)
    # Aggregate numeric evidence only, no actual IDs, text or model raw outputs.
    save(REPORT/'metrics.json',result)
    with (REPORT/'cluster-metrics.jsonl').open('w') as f:
        for r in clusters:f.write(json.dumps(r)+'\n')
    public_manifest={'task':manifest['task'],'runId':manifest['runId'],'source':manifest['source'],
       'harper_eval_commit':manifest['frozen']['harper_eval_commit'],'frozen_sha256':sha(FROZEN/'manifest.json'),
       'gold_sha256':sha(TASK/'gold-v1.json'),'requests_sha256':manifest['requestsSha256'],
       'scores_sha256':sha(RUN/'scores.jsonl'),'receipt_index_sha256':sha(RUN/'receipt-hashes.json'),
       'metrics_sha256':sha(REPORT/'metrics.json'),'cluster_metrics_sha256':sha(REPORT/'cluster-metrics.jsonl'),
       'rawLocator':'harper_beta/docs/evaluation/external-decisions-summary-ranking/runs/20261020-summary-four-axis-v1 (local, ignored, owner-only; not available from git alone)',
       'privacy':'Raw production data/outputs not committed under workspace policy. Shareable aggregate report and deidentified gold only.',
       'gate':gate}
    if (RUN/'source-capture.json').exists():
        public_manifest['sourceCapture'] = read(RUN/'source-capture.json')
    public_manifest['experimentIssue'] = 'https://github.com/matchharper/harper_eval/issues/7'
    save(REPORT/'manifest.json',public_manifest)
    save(TASK/'manifest-v1.json',public_manifest)
    p=aggregate['all'];b=combined['baseline'];t=combined['treatment']
    md=f'''# Decisions scoring 단일 실험 결과

2026-10-20. 실제 API 실행 완료. 검색·reranker·운영 DB·배포 변경 없음.

## 비교

기준안: 현재 로컬 formatter와6축 Decisions, 기존 rankScore. 변경안 하나: 당시 저장된 언어별 summary 우선(1,932/2,023), 없으면 원문(91); evidence/mutualFit 질문·rubric·교차 참조 제거; candidateInterest60% + roleFit35% + companyInterest5%, 기존 constraint 감점 유지. 같은359사례·268명·2,338쌍, 각 버전2회. 결과를 본 뒤 prompt/가중치 수정 없음.

| 항목 | 기준안 | 변경안 | 변화 |
|---|---:|---:|---:|
| 👍 우선 정확도 (두 반복 평균) | {p['baseline']:.2%} | {p['treatment']:.2%} | {p['delta']*100:+.2f}%p |
| API 입력 토큰 (2회 합계) | {b['input_tokens']:,} | {t['input_tokens']:,} | {delta['input_tokens']:.2%} |
| 확인된 사용량 기반 비용 (2회 합계) | ${b['known_cost_usd']:.6f} | ${t['known_cost_usd']:.6f} | {delta['known_cost_usd']:.2%} |
| 1회당 비용 | ${b['cost_per_repeat_usd']:.6f} | ${t['cost_per_repeat_usd']:.6f} | |
| 공고1,000개당 비용 | ${b['cost_per_1000_roles_usd']:.6f} | ${t['cost_per_1000_roles_usd']:.6f} | |
| 호출 p50 | {b['p50_ms']/1000:.3f}초 | {t['p50_ms']/1000:.3f}초 | {delta['p50_ms']:.2%} |
| 호출 p95 | {b['p95_ms']/1000:.3f}초 | {t['p95_ms']/1000:.3f}초 | {delta['p95_ms']:.2%} |
| 유효 공고 평가 (2회 합계) | {b['valid_roles']}/{b['roles_expected']} | {t['valid_roles']}/{t['roles_expected']} | |

paired talent-cluster bootstrap10,000회: 정확도 차이95% 구간 **[{p['delta_ci95'][0]*100:+.2f}, {p['delta_ci95'][1]*100:+.2f}]%p**. 반복을 독립 표본으로 늘리지 않았다. 사전 비열등 허용폭은 -2%p다. 비열등 입증: **{gate['quality_noninferiority_demonstrated']}**. 개선 입증: **{gate['quality_improvement_demonstrated']}**. 구조 오류 호출: {len(errors)}.

## 반복 변동

| 버전 | 1회 | 2회 | 차이 |
|---|---:|---:|---:|
| 기준안 | {accuracy['baseline-r1']:.2%} | {accuracy['baseline-r2']:.2%} | {(accuracy['baseline-r2']-accuracy['baseline-r1'])*100:+.2f}%p |
| 변경안 | {accuracy['treatment-r1']:.2%} | {accuracy['treatment-r2']:.2%} | {(accuracy['treatment-r2']-accuracy['treatment-r1'])*100:+.2f}%p |

## 사전 지정 부분집합

| 부분집합 | 쌍 | 기준안 | 변경안 | 차이95% 구간 |
|---|---:|---:|---:|---|
'''
    for name in ('brief_exact','both_summaries','any_raw_fallback'):
        if name in aggregate:
            x=aggregate[name];md+=f"| {name} | {x['pairs']} | {x['baseline']:.2%} | {x['treatment']:.2%} | [{x['delta_ci95'][0]*100:+.2f}, {x['delta_ci95'][1]*100:+.2f}]%p |\n"
    md+=f'''
## 조건 경계와 반복 확인

각 반복에서 기준안은32공고, 변경안은22공고를 constraintPass≤50으로 판단했다. 기준안 차단→변경안 통과24개, 반대14개로 총38/2,023공고(1.88%)의 경계 판단이 달랐다. 어느 쪽이 옳은지는 이 feedback gold만으로 판정할 수 없다.

각 버전의 두 반복은 모든 공고 점수와 pair 판단이 동일했다. 1,712개 실제 API 호출은 서로 다른 provider request ID를 받았고, reported cached input은0이었다. 이번 반복에서 관측한 변동이0인 것이 모든 미래 실행의 결정성을 보장하지는 않는다.

전체 실험의 확인된 사용량 기반 비용은 **${b['known_cost_usd']+t['known_cost_usd']:.6f}**다. 오류·재시도·비용 미확인 시도는0건이다.
'''
    md+='''
## 해석과 재현 범위

- 비용은 API usage에 공식 Decisions 단가($0.10/입력100만토큰, 캐시 읽기/쓰기·출력0)를 적용한 추정이며 청구서 실액이 아니다. API 토큰은 실제 영수증이다. 계정별 조정·regional/long-context premium은 적용 증거가 없으므로 추정에 포함하지 않았다. raw usage와 모델 식별자는 private 영수증에 보존했다.
- `constraint_changes_not_gold`는 두 버전의 경계 불일치이며 어느 쪽이 맞다는 정답이 아니다. 실제 👍/👎는 hard constraint의 독립 정답이 아니다.
- 한 사례에 최대15공고만 있으므로 상위20개 shortlist 회수율이나 전체 검색·최종 추천 성능은 측정하지 못한다. 요약 사용·축 제거·가중치 변경을 합친 한 실험이며 각각의 효과로 나누지 않는다.
- 초기 로컬 formatter 변경은 양쪽 공통이다. 실행에 사용한9개 소스 파일은 모두 로컬 커밋1122120과 일치함을 확인했다. 해당 커밋의 배포 여부는 검증하지 않았다. source revision과 파일별 hash를 기록했다.
- 원본 사례/정답 버전은 유지했다. 반응 없는 사용자 제외 및 과거 입력 복원 한계는 기존 데이터와 같다. 독립 holdout이나 온라인 실험은 아니다.
- 재계산: `python3 scripts/reportExternalDecisionsSummary.py`. API 없이 raw 영수증으로 점수와 지표를 다시 계산한다. `cluster-metrics.jsonl`은 비식별 talent별 합계여서 공개된 primary 지표와 clustered bootstrap을 별도로 재계산할 수 있다.
- 개인정보와 raw 모델 출력은 workspace 지침에 따라 ignored private/runs에만 저장했다. Git만 받아서는 raw 입력·출력을 재현할 수 없다. 경로·hash는 manifest에 있다.

공식 가격: https://developers.openai.com/api/docs/guides/decisions#pricing-and-availability
'''
    (REPORT/'report.md').write_text(md)
    print(json.dumps({'accuracy':accuracy,'paired':aggregate['all'],'combined':combined,'relative_change':delta,'gate':gate},indent=2))


if __name__ == '__main__':
    main()
