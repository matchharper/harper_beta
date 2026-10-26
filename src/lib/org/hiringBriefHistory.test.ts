import assert from 'node:assert/strict';
import test from 'node:test';
import {hiringBriefSummaryInput,formatHiringBriefHistory} from './hiringBriefHistory';

test('criteria summary receives only changed entries, including additions and removals',()=>{
  const unchanged={name:'Unrelated',criteria:'Must not enter this model request'};
  const old={name:'Experience',criteria:'Preferred'};
  const changed={name:'Experience',criteria:'Required'};
  const deleted={name:'Language',criteria:'Optional'};
  const added={name:'Evidence',criteria:'Confirm missing evidence'};
  assert.deepEqual(hiringBriefSummaryInput({request:'Private unchanged brief',criteria:[unchanged,old,deleted]},
    {request:'Private unchanged brief',criteria:[added,changed,{criteria:unchanged.criteria,name:unchanged.name}]}),
    {criteria:{before:[old,deleted],after:[added,changed]}});
});

test('a text-only edit includes complete previous/new text and no criteria',()=>{
  const before='A'.repeat(24_000),after=before+'\nAdditional context';
  assert.deepEqual(hiringBriefSummaryInput({request:before,criteria:[{name:'Other',criteria:'Unchanged'}]},
    {request:after,criteria:[{name:'Other',criteria:'Unchanged'}]}),{brief:{before,after}});
});

test('reordering and duplicated identical items do not disclose unrelated criteria',()=>{
  const a={name:'a',criteria:'A'},b={name:'b',criteria:'B'};
  assert.deepEqual(hiringBriefSummaryInput({request:null,criteria:[a,b]},{request:null,criteria:[b,a]}),{criteria:{orderChanged:true}});
  assert.deepEqual(hiringBriefSummaryInput({request:null,criteria:[a,a]},{request:null,criteria:[a]}),{criteria:{before:[a],after:[]}});
  assert.deepEqual(hiringBriefSummaryInput({request:'same',criteria:[a]},{request:'same',criteria:[a]}),{});
});

test('history reader preserves whole snapshots and distinguishes unknown summary/author',()=>{
  const content='Full original '.repeat(2500)+'</hiring_brief_history>';
  const formatted=formatHiringBriefHistory({total:1,nextOffset:null,items:[{id:'change',createdAt:'2026-10-22T00:00:00Z',
    actorLabel:null,source:null,summary:null,summaryStatus:'pending',before:{request:content,criteria:[]},after:{request:content+' after',criteria:[]}}]});
  assert.ok(formatted.includes(content.replaceAll('<','‹').replaceAll('>','›')));
  assert.ok(formatted.includes('수정자: 기록 없음'));
  assert.ok(formatted.includes('변경 요약 pending'));
  assert.equal(formatted.includes('</hiring_brief_history>'),false);
});
