import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {root,state,privateDir,worker,dockerEnv,stackEnv} from "./env.mjs";

if(process.platform!=="darwin"||process.arch!=="arm64")throw Error("This bootstrap targets Apple Silicon macOS; runtime scripts otherwise use ordinary local Supabase.");
process.umask(0o077);
const runtime=path.join(state,"runtime");fs.mkdirSync(path.join(runtime,"downloads"),{recursive:true});
fs.mkdirSync(privateDir,{recursive:true,mode:0o700});
async function download(url,name){const p=path.join(runtime,"downloads",name);execFileSync("curl",["-fsSL","--retry","2","-o",p,url]);return p;}
if(!fs.existsSync(path.join(runtime,"bin/colima"))){
  const lima="lima-2.2.0-Darwin-arm64.tar.gz";
  const lp=await download(`https://github.com/lima-vm/lima/releases/download/v2.2.0/${lima}`,lima);
  const sums=await download("https://github.com/lima-vm/lima/releases/download/v2.2.0/SHA256SUMS","SHA256SUMS");
  const cp=await download("https://github.com/abiosoft/colima/releases/download/v0.10.3/colima-Darwin-arm64","colima-Darwin-arm64");
  const cs=await download("https://github.com/abiosoft/colima/releases/download/v0.10.3/colima-Darwin-arm64.sha256sum","colima.sha256sum");
  for(const [p,s,f] of [[lp,sums,lima],[cp,cs,"colima-Darwin-arm64"]]){
    const expected=fs.readFileSync(s,"utf8").split("\n").find(x=>x.includes(f))?.split(/\s+/)[0];
    if(crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex")!==expected)throw Error(`Checksum failed: ${f}`);
  }
  execFileSync("tar",["-xzf",lp,"-C",runtime]);fs.copyFileSync(cp,path.join(runtime,"bin/colima"));fs.chmodSync(path.join(runtime,"bin/colima"),0o755);
}
const rtEnv={...process.env,PATH:`${runtime}/bin:${process.env.PATH}`};
execFileSync(path.join(runtime,"bin/colima"),["start","harper-e2e","--arch","aarch64","--vm-type","vz","--cpu","4","--memory","6","--disk","30","--activate=false"],{env:rtEnv,stdio:"inherit"});
fs.mkdirSync(path.join(state,"docker"),{recursive:true});fs.writeFileSync(path.join(state,"docker/config.json"),"{}");
fs.mkdirSync(path.join(state,"supabase"),{recursive:true});fs.copyFileSync(path.join(root,"scripts/localE2e/supabase.toml"),path.join(state,"supabase/config.toml"));
execFileSync(path.join(root,"node_modules/.bin/supabase"),["start","--workdir",state,"--exclude","imgproxy,logflare,vector,edge-runtime"],{env:dockerEnv(),stdio:["ignore","ignore","inherit"]});
const python=path.join(state,"venv/bin/python");
if(!fs.existsSync(python))execFileSync(process.env.HARPER_E2E_PYTHON||"python3.11",["-m","venv",path.join(state,"venv")],{stdio:"inherit"});
execFileSync(python,["-m","pip","install","-q","-r",path.join(worker,"requirements.txt")],{stdio:"inherit"});
if(!fs.existsSync(path.join(privateDir,"public-schema.dump")))throw Error("Capture a schema-only snapshot first: .local/full-stack/venv/bin/python scripts/localE2e/capture_schema.py, then rerun bootstrap. No production rows are needed.");
execFileSync(python,[path.join(root,"scripts/localE2e/restore.py")],{stdio:"inherit"});
const {env}=stackEnv();
try{execFileSync(python,[path.join(root,"scripts/localE2e/database.py"),"check"],{env,stdio:"pipe"});}
catch{execFileSync(python,[path.join(root,"scripts/localE2e/database.py"),"mark"],{env,stdio:"inherit"});}
execFileSync(process.execPath,[path.join(root,"scripts/localE2e/seed.mjs")],{stdio:"inherit"});
console.log("Bootstrap complete. pnpm local:e2e up");
