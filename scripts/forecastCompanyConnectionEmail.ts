/** Local forecast only: no environment, database, model, or transport access. */
import { readFileSync,writeFileSync,mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { planSlackConnectionReminder, type ReminderReceipt } from "../src/lib/email/slackConnectionReminder";
import { selectReminderWorkspace, reminderWindow, type ConnectionSnapshot } from "../src/lib/email/companyConnectionDelivery";
globalThis.fetch = async () => {throw Error("Forecast has no network access");};
const root="docs/evaluation/company-email-connection";
const raw=readFileSync(`${root}/private/forecast-input.json`,"utf8");
const input=JSON.parse(raw);
const start=new Date(input.capturedAt);const end=new Date(start.getTime()+7*86400_000);
const events:Array<Record<string,unknown>>=[];
for(const recipient of input.people as ConnectionSnapshot[]) {
 const history:ReminderReceipt[]=input.history.filter((r:any)=>r.recipient_id===recipient.id && r.status==="sent")
   .map((r:any)=>({recipientId:r.recipient_id,eventId:r.id,sentAt:r.sent_at}));
 const unresolved=input.history.find((r:any)=>r.recipient_id===recipient.id && !["sent","cancelled"].includes(r.status));
 if(unresolved) { events.push({name:recipient.name,email:recipient.email,status:"existing_delivery_requires_reconciliation",jobId:unresolved.id});continue; }
 for(let tick=Math.ceil(start.getTime()/300000)*300000;tick<end.getTime();tick+=300000) {
  const time=new Date(tick);if(!reminderWindow(time))continue;
  const selected=selectReminderWorkspace(recipient,history.length+1,"https://matchharper.com");
  const plan=planSlackConnectionReminder(selected,history,time);if(!plan)continue;
  events.push({name:recipient.name,email:recipient.email,locale:recipient.locale,companies:selected.workspaces.map(w=>w.name),
    roles:selected.workspaces.flatMap(w=>w.roles.map(r=>({name:r.name,pending:r.pendingConnectionCount,ready:r.readyCandidateCount,setup:r.setupNeeded}))),
    round:plan.round,scheduledAt:time.toISOString(),scheduledAtKst:new Date(tick+9*3600000).toISOString().replace("T"," ").replace(".000Z"," KST")});
  history.push({recipientId:recipient.id,eventId:`forecast-${plan.round}`,sentAt:time.toISOString()});
 }
}
const result={start:start.toISOString(),endExclusive:end.toISOString(),assumptions:["Deployed with required migration and existing company email runtime before the first slot","Current roles, membership, channel settings and preferences remain unchanged","Each simulated send succeeds at its slot; no prior unrecorded campaign emails"],
 historyTablePresent:input.historyTablePresent,inputHash:createHash("sha256").update(raw).digest("hex"),events};
mkdirSync(`${root}/runs/forecast-20261016`,{recursive:true,mode:0o700});
writeFileSync(`${root}/runs/forecast-20261016/forecast.json`,JSON.stringify(result,null,2),{mode:0o600});
const md=`# 일주일 발송 예상 — 실제 발송 없음\n\n기준 ${start.toISOString()}, 종료 ${end.toISOString()} (미포함). 현재 상태 유지·첫 슬롯 전 배포 및 DB 적용·모든 발송 성공을 가정한다.\n\n| 회사 | 수신자 | 이메일 | 회차 | 예정(KST) |\n|---|---|---|---|---|\n`+events.map((e:any)=>`| ${e.companies?.join(", ") ?? "확인 필요"} | ${e.name} | ${e.email} | ${e.round ?? "-"} | ${e.scheduledAtKst ?? e.status} |`).join("\n");
writeFileSync(`${root}/runs/forecast-20261016/forecast.md`,md,{mode:0o600});console.log(md);
