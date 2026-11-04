import test from "node:test";
import assert from "node:assert/strict";
import {readSimulationJdSource, buildSimulationRoleInput} from "./jdSource";
import {runSimulationWorkflow} from "./workflow";
import {SIMULATION_STEPS} from "./types";
import {applicationRequirementsText, applicationFormText} from "./applicationFormText";
test("JD reader distinguishes read, missing and inaccessible sources",async()=>{
 const read=await readSimulationJdSource("https://example.com/job",async url=>({url,title:"Role",markdown:"Cover letter required; portfolio optional",cached:false}));
 assert.equal(read.status,"read");
 assert.match(read.markdown!,/portfolio optional/);
 const missing=await readSimulationJdSource(null,async()=>{throw new Error("must not be called");});
 assert.equal(missing.status,"unavailable");
 const failed=await readSimulationJdSource("https://example.com/job",async()=>{throw new Error("blocked");});
 assert.equal(failed.status,"unavailable");
});
test("submission requirements and original JD pass through all three stages without implying missing experience",async()=>{
 const role={summary:"Submission requirements",report:"Read the posting",data:{kind:"role",requirements:[
 {id:"R1",requirement:"Cover letter",requirementType:"application_material",importance:3,mandatory:true,rationale:"Explicitly required",source:"https://example.com/job: Cover letter required",evidenceNeeded:"A ready cover letter"},
 {id:"R2",requirement:"Portfolio",requirementType:"application_material",importance:1,mandatory:false,rationale:"Explicitly optional",source:"https://example.com/job: Portfolio optional",evidenceNeeded:"An existing portfolio link"}
 ]}};
 const comparison={summary:"Readiness unknown",report:"The supplied resume does not establish separate material availability",data:{kind:"comparison",diagnoses:role.data.requirements.map(r=>({requirementId:r.id,match:"unknown",evidence:[],rationale:"No material supplied",presentation:"unavailable",questions:[`Do you have a ${r.requirement}?`],target:r.requirement})),observations:[]}};
 const review={summary:"Check additional materials",report:"Optional portfolio is not a qualification gap",data:{kind:"review",fitVerdict:{level:"moderate",reason:"Qualification fit cannot be established from material readiness alone"},actionCoverage:role.data.requirements.map((r,i)=>({requirementId:r.id,actionIds:[`A${i+1}`],disposition:"action",reason:"Clarify material readiness"})),emptyReason:"",actions:role.data.requirements.map((r,i)=>({id:`A${i+1}`,category:"materials",title:r.mandatory?"Cover letter required":"Portfolio optional",target:r.requirement,proposal:r.mandatory?"Confirm your cover letter is ready":"You may attach an existing portfolio",reason:r.rationale,requirementIds:[r.id],evidenceIds:[],needsConfirmation:true,questions:["Is it ready?"],executionPrompt:"Confirm whether this material is ready; do not create it",originalText:"",suggestedText:""}))}};
 const outputs={role,comparison,review};
 const result=await runSimulationWorkflow({state:{version:2,status:"running",roleName:"Role",documentName:"CV",updatedAt:new Date().toISOString(),steps:SIMULATION_STEPS.map(key=>({key,status:"pending"}))},input:{role:JSON.stringify({jdPage:{status:"read",markdown:"Cover letter required; portfolio optional"}}),candidate:"Profile",resume:"Resume",language:"English"},publish:async()=>{},complete:async({key,input})=>{
 const data=JSON.parse(input);
 assert.match(data.role,/Cover letter required/);
 if(key==="role")assert.equal(data.candidate,undefined);
 else assert.equal(data.rubric.data.requirements[1].mandatory,false);
 if(key==="review")assert.equal(data.comparison.data.diagnoses[0].match,"unknown");
 return JSON.stringify(outputs[key]);
 }});
 assert.equal(result.status,"completed");
 assert.deepEqual(result.steps[2].result?.data,review.data);
});

test("saved JD is authoritative and form requirements remain separate", async () => {
 const page = await readSimulationJdSource("https://example.com/job",async url=>({url,title:"Role",markdown:"Live fallback",cached:false}));
 const form={status:"partial" as const,url:"https://example.com/apply",checkedAt:"now",fields:[],limitations:["Hidden fields unknown"]};
 const input=await buildSimulationRoleInput("Example",page,async()=>({description:"Saved qualifications"}),form);
 assert.ok(input.includes("## Saved job description\n\nSaved qualifications"));
 assert.ok(!input.includes("Live fallback"));
 assert.ok(input.includes("Application form: partial"));
 const fallback=await buildSimulationRoleInput("Example",page,async()=>({description:""}),form);
 assert.ok(fallback.includes("## Job description from the posting"));
 assert.ok(fallback.includes("Source: https://example.com/job"));
 assert.ok(fallback.includes("Live fallback"));
 const empty=await readSimulationJdSource(null,async()=>{throw new Error();});
 await assert.rejects(buildSimulationRoleInput("Example",empty,async()=>({description:""})),/Neither/);
});

test("role projection preserves full source and useful company context without transport metadata", async () => {
 const page = await readSimulationJdSource(null,async()=>{throw new Error("must not be called");});
 const description = "Detailed role evidence.\n".repeat(2000) + "Final required qualification.";
 const input = await buildSimulationRoleInput("Example · Nurse",page,async()=>({
   roleId:"role-exact-reference", name:"Nurse", location:"Seoul", workMode:"On site",
   seniority:"Experienced", compensation:"KRW 50 million", externalJdUrl:"https://example.com/job",
   description,
   company:{name:"Example",shortDescription:"Community hospital",description:"Provides emergency care.",hqLocation:"Seoul",foundedYear:1990,employeeCountRange:{start:51,end:200},logoUrl:"private-logo-transport"},
   internalRequest:"private-internal-request",
 }));
 assert.ok(input.includes(description));
 assert.ok(input.includes("Role reference: role-exact-reference"));
 assert.ok(input.includes("Title: Nurse"));
 assert.ok(input.includes("Work arrangement: On site"));
 assert.ok(input.includes("Community hospital"));
 assert.ok(input.includes("Provides emergency care."));
 assert.ok(input.includes("Founded: 1990"));
 assert.ok(input.includes("51") && input.includes("200"));
 assert.ok(!input.includes("private-") && !input.includes("[object Object]"));
});

test("document requirements retain source instructions without browser execution metadata", () => {
 const form = {
   status:"partial" as const,url:"https://example.com/private-execution-url",checkedAt:"2026-10-29T01:20:30.000Z",
   limitations:["browser-only-limitation"],submission:{status:"unsupported" as const,reason:"browser-only-access-reason"},
   text:"Submit a resume in English.\nInclude professional affiliations when applicable.",
   fields:[{
     label:"Resume",type:"file",required:true,name:"browser-only-input-name",optionValue:"browser-only-option-value",
     multiple:false,options:[],instructions:"Include relevant clinical placements.",fileTypes:[".pdf"],maxLength:null,
   },{
     label:"Professional credential",type:"select",required:null,options:["Registered nurse","Other"],instructions:"Use your current credential.",fileTypes:[],maxLength:200,
   }],
 };
 const text=applicationRequirementsText(form);
 assert.ok(text.includes("### Resume — required"));
 assert.ok(text.includes("Instructions: Include relevant clinical placements."));
 assert.ok(text.includes("Accepted files: .pdf"));
 assert.ok(text.includes("### Professional credential — requiredness unknown"));
 assert.ok(text.includes("Options: Registered nurse; Other"));
 assert.ok(text.includes("Maximum characters: 200"));
 assert.ok(text.includes(form.text));
 assert.doesNotMatch(text,/browser-only|private-execution-url|checkedAt|partial|unsupported|2026-10-29/);
 assert.ok(applicationFormText(form).includes("browser-only-input-name"));
 assert.equal(applicationRequirementsText(),"");
});
