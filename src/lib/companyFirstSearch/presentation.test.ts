import assert from "node:assert/strict";
import test from "node:test";
import { parseCompanyCandidatePresentation, currentCompanyCriteriaEvaluations, isGradedCriterion, settleStaleRereads, CHANGED_CRITERION_NOTE } from "./presentation";
import { normalizeOrgCompanyCriteriaEvaluations } from "../org/companyCriteriaEvaluations";

test("unknown evidence remains uncertain and every current criterion is required", () => {
  const report={introduction:"Built and operated the product. People management is not documented.",criteriaEvaluations:[{name:"Management",fitness:"uncertain",content:"No management scope in the shareable profile."}]};
  const parsed=parseCompanyCandidatePresentation(report,[{name:"Management"}]);
  assert.equal(parsed.criteriaEvaluations[0].fitness,"uncertain");
  assert.equal(parsed.criteriaEvaluations[0].criterionDefinition,"");
  assert.throws(()=>parseCompanyCandidatePresentation(report,[{name:"New criterion"}]),/Invalid/);
  assert.throws(()=>parseCompanyCandidatePresentation({...report,criteriaEvaluations:[]},[{name:"Management"}]),/Every/);
  assert.throws(()=>parseCompanyCandidatePresentation({...report,criteriaEvaluations:[...report.criteriaEvaluations,...report.criteriaEvaluations]},[{name:"Management"}]),/duplicate/);
});
test("same criterion name with a changed definition invalidates the old assessment",()=>{
  const criteria=[{name:"Ownership",criteria:"Own one service"}];
  const report=parseCompanyCandidatePresentation({introduction:"Built a service.",criteriaEvaluations:[
    {name:"Ownership",fitness:"good",content:"Owned a billing service",criterionDefinition:"Model cannot author this stamp"}
  ]},criteria);
  assert.equal(report.criteriaEvaluations[0].criterionDefinition,"Own one service");
  assert.deepEqual(currentCompanyCriteriaEvaluations(report.criteriaEvaluations,criteria),report.criteriaEvaluations);
  // The old grade is never shown for the new definition: that criterion reads as not yet checked.
  const changed=currentCompanyCriteriaEvaluations(report.criteriaEvaluations,[{name:"Ownership",criteria:"Lead an entire platform"}]);
  assert.equal(changed[0].fitness,"uncertain");
  assert.equal(changed[0].criterionDefinition,"Lead an entire platform");
  assert.ok(changed[0].content);
  assert.deepEqual(currentCompanyCriteriaEvaluations(report.criteriaEvaluations,[]),[]);
});
test("each current criterion is judged on its own: kept, renamed, changed, added, removed",()=>{
  const graded=[
    {name:"A",fitness:"good",content:"a",criterionDefinition:"do a"},
    {name:"B",fitness:"excellent",content:"b",criterionDefinition:"do b"},
    {name:"C",fitness:"bad",content:"c",criterionDefinition:"do c"},
  ];
  const now=currentCompanyCriteriaEvaluations(graded,[
    {name:"B2",criteria:"do b"},      // renamed, same text: kept under the new name
    {name:"A",criteria:"do a"},       // unchanged: kept
    {name:"D",criteria:"do d"},       // added: not yet checked
  ]);                                 // C removed: dropped
  assert.deepEqual(now.map(item=>[item.name,item.fitness]),[["B2","excellent"],["A","good"],["D","uncertain"]]);
  assert.deepEqual(currentCompanyCriteriaEvaluations([],[{name:"A",criteria:"do a"}]),[],"no grades are not invented");
});
test("no criteria does not invent a scoring rubric",()=>{
  assert.deepEqual(parseCompanyCandidatePresentation({introduction:"A compact introduction.",criteriaEvaluations:[]},[]).criteriaEvaluations,[]);
  assert.throws(()=>parseCompanyCandidatePresentation({introduction:123,criteriaEvaluations:[]},[]),/requires/);
});
test("a placeholder or pending cell is no grade, also after the board normalizes it",()=>{
  assert.equal(isGradedCriterion({content:"Owned a service"}),true);
  assert.equal(isGradedCriterion({content:CHANGED_CRITERION_NOTE}),false);
  assert.equal(isGradedCriterion({content:"",pending:true}),false);
  // A second quick edit reads the board while the first re-read is still running.
  const [cell]=normalizeOrgCompanyCriteriaEvaluations([{name:"A",fitness:"uncertain",content:"",pending:true}]);
  assert.equal(cell.pending,true);
  assert.equal(isGradedCriterion(cell),false,"so it is read again, not kept as a blank grade");
});
test("a re-read still pending after 5 minutes reads as not checked",()=>{
  const cells=[{name:"A",fitness:"uncertain",content:"",pending:true},{name:"B",fitness:"good",content:"b"}];
  const written="2026-10-23T00:00:00Z", at=Date.parse(written);
  assert.deepEqual(settleStaleRereads(cells,written,at+4*60_000),cells);
  const settled=settleStaleRereads(cells,written,at+6*60_000) as Array<Record<string,unknown>>;
  assert.deepEqual(settled[0],{name:"A",fitness:"uncertain",content:CHANGED_CRITERION_NOTE,pending:false});
  assert.deepEqual(settled[1],cells[1]);
  assert.equal(settleStaleRereads(cells,null,at+6*60_000),cells);
});
