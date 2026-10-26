/** Actual PostgreSQL/PostgREST sandbox. Every case clones the immutable source DB. */
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { openSync, readFileSync, writeFileSync } from 'node:fs';

const local = '127.0.0.1';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve,reject) => { server.once('error',reject);server.listen(0,local,resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
export async function startCompanySearchSandbox({root,runDirectory,baseline='harper_agentic_baseline_v1',pgPort=55461,authUser=null,preserveDatabase=false,gatewayPort=0,migrations=[]}) {
  if (!/^harper_agentic_[a-z0-9_]+$/.test(baseline)) throw Error('Dedicated evaluation baseline required');
  const database='harper_agentic_run_'+randomUUID().replaceAll('-','');
  const runtime=path.join(root,'docs/evaluation/company-agentic-role-search/private/runtime');
  const pgBin=process.env.COMPANY_EVAL_PG_BIN ?? '/usr/local/opt/postgresql@17/bin';
  if(!Number.isSafeInteger(pgPort)||pgPort<1||pgPort>65535)throw Error('Valid local PostgreSQL port required');
  if(!Number.isSafeInteger(gatewayPort)||gatewayPort<0||gatewayPort>65535)throw Error('Valid local gateway port required');
  const pgData=path.join(runtime,'pgdata');
  try{execFileSync(path.join(pgBin,'pg_ctl'),['-D',pgData,'status'],{stdio:'pipe'});}
  catch{execFileSync(path.join(pgBin,'pg_ctl'),['-D',pgData,'-l',path.join(runtime,'postgres.log'),'-o',`-p ${pgPort} -h 127.0.0.1 -k /tmp`,'start'],{stdio:'pipe'});}
  execFileSync(path.join(pgBin,'createdb'),['-h',local,'-p',String(pgPort),'-U','postgres','--template',baseline,database],{stdio:'pipe'});
  // Production capture confirmed UTC. Set only the new clone before any writes;
  // old baseline instants, including its actual source cutoffs, stay untouched.
  execFileSync(path.join(pgBin,'psql'),['-h',local,'-p',String(pgPort),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',`ALTER DATABASE "${database}" SET timezone TO 'UTC'`],{stdio:'pipe'});
  const databaseUrl=`postgresql://postgres@${local}:${pgPort}/${database}`;
  const databaseTimezone=execFileSync(path.join(pgBin,'psql'),['-h',local,'-p',String(pgPort),'-U','postgres','-d',database,'-Atc','SHOW timezone'],{encoding:'utf8'}).trim();
  if(databaseTimezone!=='UTC')throw Error('Evaluation clone must match the verified production UTC timezone');
  const appliedMigrations=[];
  try {
    for(const relative of migrations){
      const file=path.resolve(root,relative);
      if(!file.startsWith(path.join(root,'supabase/migrations')+path.sep)||!file.endsWith('.sql'))throw Error('Only explicit repository migrations may be applied to a new evaluation clone');
      const sha256=createHash('sha256').update(readFileSync(file)).digest('hex');
      const output=execFileSync(path.join(pgBin,'psql'),['-h',local,'-p',String(pgPort),'-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-f',file],{encoding:'utf8',stdio:'pipe'});
      appliedMigrations.push({file:relative,sha256,output});
    }
  }catch(error){
    writeFileSync(path.join(runDirectory,'migration-error.json'),JSON.stringify({database,appliedMigrations,error:String(error)},null,2),{mode:0o600});
    execFileSync(path.join(pgBin,'dropdb'),['-h',local,'-p',String(pgPort),'-U','postgres','--force',database],{stdio:'pipe'});
    throw error;
  }
  if(migrations.length)writeFileSync(path.join(runDirectory,'local-migrations.json'),JSON.stringify(appliedMigrations,null,2),{mode:0o600});
  const restPort=await unusedPort();
  const logs=openSync(path.join(runDirectory,'postgrest.log'),'a',0o600);
  const rest=spawn(path.join(runtime,'bin/postgrest'),[],{env:{PATH:process.env.PATH,
    DYLD_LIBRARY_PATH:process.env.COMPANY_EVAL_LIBPQ ?? '/usr/local/opt/libpq/lib',
    PGRST_DB_URI:databaseUrl,PGRST_DB_ANON_ROLE:'postgres',PGRST_DB_SCHEMAS:'public',
    PGRST_SERVER_HOST:local,PGRST_SERVER_PORT:String(restPort),PGRST_LOG_LEVEL:'warn'},stdio:['ignore',logs,logs]});
  let ready=false;
  for(let attempt=0;attempt<100;attempt++) {
    if(rest.exitCode!==null) throw Error('PostgREST failed; inspect the private log');
    try { const response=await fetch(`http://${local}:${restPort}/`); if(response.ok) {ready=true;break;} } catch {}
    await pause(50);
  }
  if(!ready) {rest.kill('SIGTERM');throw Error('Local PostgREST did not start');}
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,`http://${local}`);
    const origin=req.headers.origin;
    if(origin){let permitted=false;try{permitted=['127.0.0.1','localhost'].includes(new URL(origin).hostname);}catch{}
      if(!permitted){res.writeHead(403);res.end();return;}res.setHeader('access-control-allow-origin',origin);}
    res.setHeader('access-control-allow-headers','*');res.setHeader('access-control-allow-methods','GET,POST,PATCH,DELETE,OPTIONS');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    if(url.pathname==='/evaluation-contract') {res.setHeader('content-type','application/json');res.end(JSON.stringify({task:'company-agentic-role-search',actualPostgreSQL:true,actualPostgREST:true,externalEffects:false}));return;}
    if(authUser&&url.pathname==='/auth/v1/user') {res.setHeader('content-type','application/json');res.end(JSON.stringify(authUser));return;}
    if(authUser&&url.pathname.startsWith('/auth/v1/admin/users/')) {
      res.setHeader('content-type','application/json');
      if(url.pathname===`/auth/v1/admin/users/${authUser.id}`)res.end(JSON.stringify({user:authUser}));
      else{res.writeHead(404);res.end(JSON.stringify({error:'Uncaptured actor'}));}
      return;
    }
    if(!url.pathname.startsWith('/rest/v1/')) {res.writeHead(404);res.end();return;}
    try {
      const body=[];for await(const chunk of req) body.push(chunk);
      const headers={...req.headers};delete headers.authorization;delete headers.apikey;delete headers.host;delete headers['content-length'];
      const response=await fetch(`http://${local}:${restPort}/${url.pathname.slice('/rest/v1/'.length)}${url.search}`,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(body)});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    } catch(error) {res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:String(error)}));}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(gatewayPort,local,resolve);});
  const url=`http://${local}:${server.address().port}`;
  const metadata={database,databaseUrl,url,restPort,baseline,pgPort,databaseTimezone,baselineInstantsModified:false,localMigrations:appliedMigrations.map(({output,...metadata})=>metadata),actualPostgreSQL:true,actualPostgREST:true,auth:'local exact-identity transport; not authentication/RLS coverage'};
  writeFileSync(path.join(runDirectory,'sandbox.json'),JSON.stringify(metadata,null,2),{mode:0o600});
  return {...metadata,async stop(){
    await new Promise(resolve=>server.close(resolve));rest.kill('SIGTERM');
    if(rest.exitCode===null)await new Promise(resolve=>rest.once('exit',resolve));
    if(!preserveDatabase)execFileSync(path.join(pgBin,'dropdb'),['-h',local,'-p',String(pgPort),'-U','postgres','--force',database],{stdio:'pipe'});
    writeFileSync(path.join(runDirectory,'sandbox-completion.json'),JSON.stringify({database,stopped:true,databaseRemoved:!preserveDatabase}),{mode:0o600});
  }};
}

// Browser-only launcher. The exact owner identity comes from the actual frozen
// capture. Local auth is explicitly a transport substitute, not an auth test.
async function browserMain(){
  const {readFileSync,mkdirSync}=await import('node:fs');
  const root=path.resolve(path.dirname(process.argv[1]),'..');
  const source=path.join(root,'docs/evaluation/company-agentic-role-search/private/legacy-source-v1');
  const capture=JSON.parse(readFileSync(path.join(source,'manifest.json'),'utf8'));
  const tables=JSON.parse(readFileSync(path.join(source,'tables.json'),'utf8'));
  const runDirectory=path.resolve(process.argv[2]??'');
  if(!runDirectory.startsWith(path.join(root,'docs/evaluation/company-agentic-role-search/runs')+path.sep))throw Error('A fresh private run directory is required');
  mkdirSync(runDirectory,{mode:0o700});
  const person=tables.company_users.find(row=>row.user_id===capture.actorId);
  const user={id:capture.actorId,email:'local-evaluation@invalid.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{name:person?.name},created_at:capture.capturedAt};
  const token=Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,email:user.email,aud:'authenticated',role:'authenticated',user_metadata:user.user_metadata,exp:Math.floor(Date.now()/1000)+86400})).toString('base64url')+'.local';
  const baseline=process.argv.find(value=>value.startsWith('--baseline='))?.slice('--baseline='.length);
  const gatewayPort=Number(process.argv.find(value=>value.startsWith('--gateway-port='))?.slice('--gateway-port='.length)??0);
  const migrations=(process.argv.find(value=>value.startsWith('--local-migrations='))?.slice('--local-migrations='.length)??'').split(',').filter(Boolean);
  const sandbox=await startCompanySearchSandbox({root,runDirectory,authUser:user,...(baseline?{baseline}:{}),gatewayPort,migrations});
  writeFileSync(path.join(runDirectory,'browser-auth.json'),JSON.stringify({user,access_token:token,refresh_token:'local-evaluation-only',expires_in:86400,expires_at:Math.floor(Date.now()/1000)+86400,token_type:'bearer',workspaceId:capture.selected.company_workspace_id,roleId:capture.selected.role_id}),{mode:0o600});
  console.log(JSON.stringify({url:sandbox.url,runDirectory,localAuthSubstitute:true}));
  process.on('SIGTERM',async()=>{await sandbox.stop();process.exit(0);});
  process.on('SIGINT',async()=>{await sandbox.stop();process.exit(0);});
}

if(process.argv[1]?.endsWith('/companyAgenticSearchSandbox.mjs')) browserMain().catch(error=>{console.error(error);process.exitCode=1;});
