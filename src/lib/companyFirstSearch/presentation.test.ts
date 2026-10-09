import assert from "node:assert/strict";
import test from "node:test";
import { parseCompanyCandidatePresentation, currentCompanyCriteriaEvaluations } from "./presentation";

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
  assert.deepEqual(currentCompanyCriteriaEvaluations(report.criteriaEvaluations,[{name:"Ownership",criteria:"Lead an entire platform"}]),[]);
  assert.deepEqual(currentCompanyCriteriaEvaluations(report.criteriaEvaluations,[]),[]);
});
test("no criteria does not invent a scoring rubric",()=>{
  assert.deepEqual(parseCompanyCandidatePresentation({introduction:"A compact introduction.",criteriaEvaluations:[]},[]).criteriaEvaluations,[]);
  assert.throws(()=>parseCompanyCandidatePresentation({introduction:123,criteriaEvaluations:[]},[]),/requires/);
});
