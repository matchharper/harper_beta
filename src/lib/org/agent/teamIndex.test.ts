import assert from 'node:assert/strict';
import test from 'node:test';
import {readCompanyTeams} from './teamIndex';

function fixture(scope:'organization'|'team', count=2){
  const queries:any[]=[];
  const rows=Array.from({length:count},(_,index)=>({id:`team-${index}`,name:`Team ${index}`,company_workspace_id:'workspace',deleted_at:null}));
  return {queries,admin:{from(table:string){
    const filters:Array<[string,unknown]>=[];let bounds:number[]|undefined;
    const query:any={select(){return query;},eq(key:string,value:unknown){filters.push([key,value]);return query;},
      is(key:string,value:unknown){filters.push([key,value]);return query;},in(key:string,value:string[]){filters.push([key,value]);return query;},
      order(){return query;},range(a:number,b:number){bounds=[a,b];return query;},maybeSingle(){return query;},
      then(resolve:any,reject:any){
        queries.push({table,filters,bounds});
        const data=table==='company_workspace'?{is_reviewing:false}:table==='company_user_workspace'?{authority:scope==='team'?'admin':'owner',access_scope:scope,team_id:scope==='team'?'team-0':null,company_workspace_team_members:scope==='team'?[{team_id:'team-0'}]:[]}
          :rows.filter(row=>filters.every(([key,value])=>Array.isArray(value)?value.includes((row as any)[key]):(row as any)[key]===value));
        return Promise.resolve({data:Array.isArray(data)&&bounds?data.slice(bounds[0],bounds[1]+1):data,error:null}).then(resolve,reject);
      }};return query;
  }} as any};
}
test('organization team discovery includes empty teams and reads every DB page',async()=>{
  const {admin,queries}=fixture('organization',1001);
  const rows=await readCompanyTeams({admin,user:{id:'actor'} as any,workspaceId:'workspace'});
  assert.equal(rows.length,1001);
  assert.equal(queries.filter(q=>q.table==='company_workspace_teams').length,2);
  assert.deepEqual(rows[0],{teamId:'team-0',name:'Team 0'});
  assert.ok(queries.every(q=>['company_workspace','company_workspace_teams','company_user_workspace'].includes(q.table)));
});
test('team audience constrains discovery in the database before reading rows',async()=>{
  const {admin,queries}=fixture('team');
  const rows=await readCompanyTeams({admin,user:{id:'actor'} as any,workspaceId:'workspace'});
  assert.deepEqual(rows,[{teamId:'team-0',name:'Team 0'}]);
  const list=queries.find(q=>q.bounds);
  assert.deepEqual(list.filters.find(([key]:any)=>key==='id'),['id',['team-0']]);
  assert.ok(list.filters.some(([key,value]:any)=>key==='company_workspace_id'&&value==='workspace'));
});
