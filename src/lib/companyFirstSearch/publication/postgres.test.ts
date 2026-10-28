/** Exact SQL against a disposable localhost clone of the existing captured baseline.
 * No new Roles, model calls, Worker, delivery service or production connection.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { publishRecommendations, type PublicationDependencies } from './service';
import { loadSnapshot, type Query, type PublicationCommand } from './repository';
import { parsePresentation, type PublicationRole, type PublicationCandidate, type Presentation } from './writer';

const port = process.env.COMPANY_PUBLICATION_TEST_PORT;
const makePresentation = async (role: PublicationRole, candidate: PublicationCandidate): Promise<Presentation> => ({
  ...parsePresentation({tldr:'Synthetic writer output for SQL verification',harper_note:'',recommendationReason:'Synthetic evidence paragraph',
    criteriaEvaluations:role.criteria.map((_,index)=>({criterionRef:`c${index+1}`,content:'Synthetic criterion evidence'}))},role,candidate),
  fingerprint:'synthetic-writer',usage:{model:'test-only-no-model-call'},
});

test('synchronous publication SQL and parallel completion on a disposable local snapshot', {skip:!port,timeout:60000}, async t => {
  assert.match(port!,/^\d+$/);
  const database=`harper_publication_test_${randomUUID().replaceAll('-','')}`;
  const control=postgres({host:'127.0.0.1',port:Number(port),username:'postgres',database:'postgres',max:1});
  await control.unsafe(`CREATE DATABASE ${database} TEMPLATE harper_agentic_baseline_v1`);
  const db=postgres({host:'127.0.0.1',port:Number(port),username:'postgres',database,max:4,prepare:false});
  const query: Query=async(text,params=[])=>Array.from(await db.unsafe(text,params));
  const transaction: PublicationDependencies['transaction']=async work=>await db.begin(async tx=>work(async(text,params=[])=>Array.from(await tx.unsafe(text,params)))) as any;
  try {
    const [source]=await query(`SELECT role.role_id::text,role.company_workspace_id::text,member.company_user_id::text,internal.criteria
      FROM company_roles role JOIN company_internal_roles internal USING(role_id)
      JOIN company_user_workspace member USING(company_workspace_id)
      WHERE member.authority='owner' AND role.status='active' AND nullif(btrim(internal.request),'') IS NOT NULL
      AND coalesce(lower(role.information->>'testOnly'),'false') NOT IN ('true','1','yes','on') ORDER BY role.role_id LIMIT 1`);
    assert.ok(source,'existing captured active role required');
    const base={workspaceId:source.company_workspace_id,userId:source.company_user_id,roleId:source.role_id,kind:'add' as const};
    await query(`UPDATE company_workspace SET billing_started_at=now(),billing_model='standard' WHERE company_workspace_id=$1::uuid`,[base.workspaceId]);
    await query(`UPDATE company_workspace_slots SET assigned_role_id=NULL WHERE company_workspace_id=$1::uuid`,[base.workspaceId]);
    await query(`UPDATE company_internal_roles SET is_harper_tailored_role=false WHERE role_id=$1::uuid`,[base.roleId]);
    await query(`UPDATE company_roles SET is_expired=false,expires_at=NULL WHERE role_id=$1::uuid`,[base.roleId]);
    assert.equal((await query('SELECT role_matching_slot_type_v1($1::uuid,now()) AS kind',[base.roleId]))[0].kind,'free');
    const talentRows=await query(`SELECT talent.user_id::text AS id FROM talent_users talent JOIN talent_setting setting ON setting.user_id=talent.user_id
      JOIN company_workspace workspace ON workspace.company_workspace_id=$1::uuid
      WHERE talent.deleted_at IS NULL AND setting.is_onboarding_done IS TRUE AND setting.profile_visibility='open_to_matches'
        AND setting.get_internal_recommendation IS NOT FALSE AND company_first_pair_is_available_v1(talent.user_id,$2::uuid)
        AND NOT EXISTS(SELECT 1 FROM unnest(coalesce(setting.blocked_companies,'{}'::text[])) blocked(name)
          WHERE lower(btrim(blocked.name)) IN (lower(btrim(workspace.company_name)),lower(btrim(coalesce(workspace.published_name,'')))))
      ORDER BY talent.user_id LIMIT 4`,[base.workspaceId,base.roleId]);
    assert.equal(talentRows.length,4);
    const talentIds=talentRows.map(row=>row.id);
    const [basis]=await query(`INSERT INTO company_first_search_runs(company_workspace_id,role_id,scheduled_slot,trigger_reason,status,contract_version,requested_role_ids,
      source_snapshot) VALUES($1::uuid,$2::uuid,clock_timestamp(),'manual','succeeded','company_agentic_role_search_v1',ARRAY[$2::uuid],
      jsonb_build_object('roleSearchBrief',company_role_search_brief_snapshot_v1($2::uuid)||jsonb_build_object('version',company_role_search_brief_version_v1($2::uuid)))) RETURNING id::text`,[base.workspaceId,base.roleId]);
    for (const talentId of talentIds) await query(`INSERT INTO company_role_candidate_evaluations(company_workspace_id,role_id,talent_id,run_id,brief_version,stage,input_fingerprint,assessment)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,company_role_search_brief_version_v1($2::uuid),2,'test-only-synthetic-assessment',$5::text::jsonb)`,
    [base.workspaceId,base.roleId,talentId,basis.id,JSON.stringify({criteria:(source.criteria??[]).map((item:any)=>({name:item.name,score:.7,label:'good',distribution:{good:1}})),mutualFit:.7})]);
    const effects=async()=>({
      cards:await query(`SELECT id::text,talent_id::text,revision,presentation,status FROM company_intro_candidates WHERE role_id=$1::uuid ORDER BY id`,[base.roleId]),
      runs:await query(`SELECT id::text,status FROM company_first_search_runs WHERE company_workspace_id=$1::uuid ORDER BY id`,[base.workspaceId]),
      contact:await query(`SELECT id::text FROM talent_opportunity_recommendation WHERE role_id=$1::uuid ORDER BY id`,[base.roleId]),
    });
    const makeCommand=(overrides:Partial<PublicationCommand>={}):PublicationCommand=>({...base,requestId:randomUUID(),talentIds,...overrides});
    await t.test('four requests start together; no save until the last writer completes; completed cards and scores are immediately readable',async()=>{
      const before=await effects();
      const started:string[]=[];
      const release: (()=>void)[]=[];
      let finished=false;
      const command=makeCommand({sourceRunId:basis.id});
      const pending=publishRecommendations(command,{transaction,write:async(role,candidate)=>{
        started.push(candidate.talentId); await new Promise<void>(resolve=>release.push(resolve));
        return makePresentation(role,candidate);
      }}).then(result=>{finished=true;return result;});
      while(started.length<4) await new Promise(resolve=>setTimeout(resolve,10));
      assert.equal(finished,false); assert.deepEqual(await effects(),before);
      release.slice(0,3).forEach(resolve=>resolve());
      await new Promise(resolve=>setTimeout(resolve,20));
      assert.equal(finished,false); assert.deepEqual(await effects(),before);
      release[3]();
      const result=await pending;
      assert.equal(result.status,'completed'); assert.deepEqual(result.addedTalentIds,talentIds);
      const after=await effects();
      assert.equal(after.cards.length,before.cards.length+4); assert.deepEqual(after.contact,before.contact);
      assert.equal(after.runs.filter(row=>row.status==='queued').length,before.runs.filter(row=>row.status==='queued').length);
      for(const row of after.cards.filter(row=>talentIds.includes(row.talent_id))){
        assert.equal(row.status,'ready'); assert.equal(row.presentation.tldr,'Synthetic writer output for SQL verification');
        assert.equal(row.presentation.criteriaEvaluations[0].score,.7); assert.equal(row.presentation.criteriaEvaluations[0].label,'good');
      }
      assert.deepEqual(await publishRecommendations(command,{transaction,write:async()=>{throw Error('Replay must not call a model');}}),result);
      assert.deepEqual(await effects(),after);
      const addAgain=await publishRecommendations(makeCommand(),{transaction,write:async()=>{throw Error('Existing add cards must remain unchanged');}});
      assert.deepEqual(addAgain.addedTalentIds,[]);assert.deepEqual((await effects()).cards,after.cards);
    });
    await t.test('replace can clear exactly the untouched pool, without contacting people',async()=>{
      const before=await effects();
      const result=await publishRecommendations(makeCommand({kind:'replace',talentIds:[]}),{transaction,write:makePresentation});
      assert.ok(result.removedTalentIds.length>=4);
      assert.equal((await effects()).cards.filter(row=>row.status==='ready').length,0);
      assert.deepEqual((await effects()).contact,before.contact);
    });
    await t.test('one failed writer waits for the other writers and persists nothing',async()=>{
      const before=await effects();let completed=0;
      await assert.rejects(publishRecommendations(makeCommand(),{transaction,write:async(role,candidate)=>{
        if(candidate.talentId===talentIds[0]) throw Error('Injected provider failure');
        await new Promise(resolve=>setTimeout(resolve,20));completed++;return makePresentation(role,candidate);
      }}),/no recommendations were saved/);
      assert.equal(completed,3);assert.deepEqual(await effects(),before);
    });
    await t.test('changed source evidence and permission prevent stale writes',async()=>{
      for(const permission of [false,true]){
        const before=await effects();
        const [original]=await query('SELECT bio FROM talent_users WHERE user_id=$1::uuid',[talentIds[0]]);
        await assert.rejects(publishRecommendations(makeCommand(),{transaction,write:async(role,candidate)=>{
          if(candidate.talentId===talentIds[0]) {
            if(permission) await query('UPDATE talent_setting SET get_internal_recommendation=false WHERE user_id=$1::uuid',[candidate.talentId]);
            else await query('UPDATE talent_users SET bio=coalesce(bio,\'\')||\' Source changed\' WHERE user_id=$1::uuid',[candidate.talentId]);
          }
          return makePresentation(role,candidate);
        }}),permission?/eligible/:/evidence/);
        assert.deepEqual(await effects(),before);
        await query('UPDATE talent_users SET bio=$2 WHERE user_id=$1::uuid',[talentIds[0],original.bio]);
        await query('UPDATE talent_setting SET get_internal_recommendation=true WHERE user_id=$1::uuid',[talentIds[0]]);
      }
    });
    await t.test('database failure after the first insert rolls back cards, explanations and success history together',async()=>{
      const before=await effects();
      let inserted=false;
      await assert.rejects(publishRecommendations(makeCommand(),{write:makePresentation,
        transaction:async work=>transaction(query=>work(async(text,params)=>{
          if(inserted && text.startsWith('INSERT INTO public.company_role_candidate_evaluations')) throw Error('Injected database failure');
          const result=await query(text,params);
          if(text.startsWith('INSERT INTO public.company_intro_candidates')) inserted=true;
          return result;
        })),
      }),/Injected database failure/);
      assert.equal(inserted,true);assert.deepEqual(await effects(),before);
    });
    await t.test('concurrent replacement cannot erase another completed addition',async()=>{
      await publishRecommendations(makeCommand({talentIds:talentIds.slice(0,2)}),{transaction,write:makePresentation});
      let release!:()=>void;let started!:()=>void;
      const startedPromise=new Promise<void>(resolve=>started=resolve);
      const pending=publishRecommendations(makeCommand({kind:'replace',talentIds:[talentIds[0]]}),{transaction,write:async(role,candidate)=>{
        await new Promise<void>(resolve=>{release=resolve;started();});return makePresentation(role,candidate);
      }});
      await startedPromise;
      await publishRecommendations(makeCommand({talentIds:[talentIds[2]]}),{transaction,write:makePresentation});
      release();await assert.rejects(pending,/list changed/);
      assert.deepEqual((await effects()).cards.filter(row=>row.status==='ready').map(row=>row.talent_id).sort(),talentIds.slice(0,3).sort());
    });
    await t.test('authorization and test-only role isolation fail before any writer',async()=>{
      let calls=0;const deps={transaction,write:async()=>{calls++;throw Error('Unexpected writer');}};
      await assert.rejects(publishRecommendations(makeCommand({userId:randomUUID()}),deps),/not authorized/);
      await query(`UPDATE company_roles SET information=coalesce(information,'{}')||'{"testOnly":true,"testFixture":"publication-isolation-check"}'::jsonb WHERE role_id=$1::uuid`,[base.roleId]);
      await assert.rejects(publishRecommendations(makeCommand(),deps),/unavailable/);
      assert.equal(calls,0);
    });
  } finally {
    await db.end();
    await control.unsafe(`DROP DATABASE ${database} WITH (FORCE)`);
    await control.end();
  }
});
