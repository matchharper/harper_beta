import { runExperiment } from '../../../lib/run.js';
import { legacyProbe } from '../../../lib/legacy.js';
import { runPreflight } from '../../../lib/preflight.js';
export const runtime='nodejs';
export const preferredRegion='iad1';
export const maxDuration=800;
export async function POST(request){
  if(!process.env.LAB_SECRET||request.headers.get('authorization')!=='Bearer '+process.env.LAB_SECRET)return new Response('Forbidden',{status:403});
  try{const input=await request.json();const origin=new URL(request.url).origin;return Response.json(input.mode==='legacy'?await legacyProbe(origin):input.mode==='preflight'?await runPreflight(origin,input):await runExperiment(origin,input));}
  catch(e){return Response.json({error:e.message},{status:400});}
}
