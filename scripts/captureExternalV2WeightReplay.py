"""Freeze production score-only evidence; canonical read-only DB connection."""
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / 'harper_worker'))
from opp.utils.new_runtime import connect_read_only, load_config

TASK = ROOT / 'docs/evaluation/external-v2-weight-replay'
VERSION = 'filter-first-hnsw-2026-10-16-v1'
KEY = 'external-fit-questions-v6-strong-constraints:openai:gpt-6-luna'

def main():
    os.umask(0o077)
    dest = TASK / 'private/frozen-v1'
    if dest.exists():
        raise SystemExit('Frozen snapshot already exists; do not overwrite')
    with connect_read_only(load_config()) as conn:
        with conn.cursor() as cur:
            cur.execute("""with contaminated as (
              select distinct talent_id from external_recommendation_runs
              where experiment='external-recommendations-2026-10-v1'
                and created_at>now()-interval '30 days'
                and variant<>case when get_byte(extensions.digest(
                  'external-recommendations-2026-10-v1:'||lower(talent_id::text),'sha256'),0)<128
                  then 'control' else 'v2' end
            ) select r.id,r.talent_id,r.surface,r.provider,r.created_at,r.finished_at,
              r.metrics->>'cacheHits' cache_hits,r.metrics->>'scoredCount' scored_count,
              r.metrics->>'candidateCount' candidate_count,r.metrics->>'earlyStopped' early_stopped,
              exists(select 1 from external_recommendation_runs x where x.talent_id=r.talent_id
                and x.id<>r.id and x.created_at<r.finished_at
                and coalesce(x.finished_at,now())>r.created_at) overlapping_run,
              (select jsonb_agg(jsonb_build_object('id',t.id,'roleId',t.role_id,
                'feedback',t.feedback,'reason',t.feedback_reason,'score',t.score,
                'feedbackAt',t.feedback_at)) from talent_opportunity_recommendation t
                where t.external_experiment_run_id=r.id and t.talent_id=r.talent_id
                  and t.recommended_at>=r.created_at) recommendations
            from external_recommendation_runs r
            where r.variant='v2' and r.status='completed' and r.metrics->>'measurementVersion'=%s
              and r.talent_id not in(select talent_id from contaminated)
              and exists(select 1 from talent_opportunity_recommendation t
                where t.external_experiment_run_id=r.id and t.feedback in('like','positive','dislike','negative'))
            order by r.created_at,r.id""", (VERSION,))
            runs = cur.fetchall()
            eligible = [r for r in runs if r['cache_hits']=='0' and not r['overlapping_run']]
            for r in eligible:
                cur.execute("""select role_id, evaluations->%s evaluation
                  from talent_external_fit where talent_id=%s
                  and (evaluations->%s->>'evaluatedAt')::timestamptz between %s and %s
                  order by role_id""", (KEY,r['talent_id'],KEY,r['created_at'],r['finished_at']))
                r['pool'] = cur.fetchall()
    dest.mkdir(parents=True,mode=0o700)
    frozen = {'datasetVersion':'production-score-pool-v1','measurementVersion':VERSION,
              'capturedAt':datetime.now(timezone.utc).isoformat(),'evaluatorKey':KEY,'runs':runs}
    # Store only numeric/structural evidence needed for replay, not model raw outputs.
    keep = {'roleId','candidateInterest','companyInterest','mutualFit','roleFit','constraintPass',
            'evidence','inputFingerprint','evaluatedAt','model','provider','promptVersion'}
    for r in runs:
        for p in r.get('pool',[]):
            p['evaluation']={k:v for k,v in p['evaluation'].items() if k in keep}
    path = dest/'capture.json'
    path.write_text(json.dumps(frozen,ensure_ascii=False,default=str)+'\n')
    print(json.dumps({'runsWithFeedback':len(runs),'noCacheNonOverlappingRuns':len(eligible),
                      'runsWithPoolCountMatch':sum(len(r.get('pool',[]))==int(r.get('scored_count') or -1) for r in eligible),
                      'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}))

if __name__=='__main__':main()
