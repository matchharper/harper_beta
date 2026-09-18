// Meaningful bridge regression checks without a Google account or production writes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const config=JSON.parse(fs.readFileSync(__dirname+'/sheet-columns.json','utf8'));
const context={GTM_TABLES:config,console};vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname+'/sheets-bridge.gs','utf8'),context);
const c=config['Creator Directory'],n=c.fields.length;
const outreachScoreIndex=c.fields.findIndex(field=>field[0]==='outreach_score');
assert.ok(outreachScoreIndex>=0);assert.equal(c.fields[outreachScoreIndex][2],'number');
let values=Array(n+6).fill('');values[1]='Bridge fixture';
const sheet={getName:()=> 'Creator Directory',getLastRow:()=>6,getActiveRange:()=>({getRow:()=>6,getLastRow:()=>6}),
 getRange:(r,col,height,width)=>({getValues:()=>[values.slice(col-1,col-1+(width||1))],
 setValues:matrix=>{matrix[0].forEach((v,i)=>values[col-1+i]=v);},setValue:value=>{values[col-1]=value;}})};
const workbook={toast(){},getSheetByName:()=>sheet};
context.SpreadsheetApp={getActiveSheet:()=>sheet,getActive:()=>workbook,getActiveSpreadsheet:()=>workbook,flush(){}};
context.LockService={getDocumentLock:()=>({waitLock(){},releaseLock(){}})};
let issued=0;context.Utilities={getUuid:()=> 'request-'+(++issued)};
const ctx={metrics:{},creatorMetrics:{},reviews:{},refs:{gtm_creators:{}},records:{}};
context.context_=()=>ctx;
let committed=null,firstAttempt=true,requests=[];
context.rpc_=req=>{
 if(req.action==='save'){
  requests.push(JSON.stringify(req));
  if(!committed)committed={id:'id-1',ref:1,row_version:1,name:req.data.name,activity_regions:['KR'],languages:['ko'],content_topics:['career'],account_summary:'youtube @fixture · followers 12345 · posts/365d 78',total_followers:12345,content_count_365d:78,contact_summary:'email: fixture@example.test [active]',outreach_status:'awaiting_reply',data_status:'current',refresh_fields_text:'',description:null,owner_id:null,do_not_contact:false,notes:null};
  if(firstAttempt){firstAttempt=false;throw Error('unknown network result');}
  return {record:committed};
 }
 return {record:committed};
};
context.getRecord_=()=>committed;
assert.throws(()=>context.saveSelected(),/unknown network result/);
assert.equal(values[1],'Bridge fixture');assert.match(values[n],/미반영/);
context.saveSelected();assert.equal(issued,1);assert.equal(requests[0],requests[1]);assert.equal(values[n+1],'id-1');assert.equal(values[n],'저장됨');
console.log('PASS unknown network result retries the same logical mutation and reloads server identity');

const notesIndex=c.fields.findIndex(field=>field[0]==='notes');
values[notesIndex]='local update';context.rpc_=()=>{throw Error('Row version conflict');};
assert.throws(()=>context.saveSelected(),/Row version conflict/);assert.equal(values[notesIndex],'local update');assert.match(values[n],/conflict/);assert.equal(committed.notes,null);
console.log('PASS conflict preserves local edits and does not overwrite the server');

const cleanSheet={getLastRow:()=>5};
const mixedWorkbook={getSheetByName:name=>name==='Creator Directory'?sheet:cleanSheet};
assert.deepEqual(Array.from(context.dirtySheetNames_(mixedWorkbook)),['Creator Directory']);
assert.match(context.refreshAllCore_.toString(),/dirtySheets\.indexOf\(name\)>=0/);
console.log('PASS refresh preserves dirty sheets while allowing clean sheets to continue syncing');

const oldFieldCount=n-c.legacyInsertions.length,legacyVisible=Array(oldFieldCount).fill('');
legacyVisible[0]=1;legacyVisible[1]='Legacy creator';legacyVisible[15]='awaiting_reply';
const legacyId='bd94d180-6d21-4cb2-91ef-72763151d2f6';
const legacyRow=legacyVisible.concat(['미반영 · 메뉴에서 선택행 저장',legacyId,7,JSON.stringify(legacyVisible),'request-legacy','payload-legacy']);
let migratedRow=null,maxColumns=legacyRow.length;
const legacySheet={getName:()=> 'Creator Directory',getLastRow:()=>6,getMaxColumns:()=>maxColumns,
 insertColumnsAfter:(after,count)=>{maxColumns+=count;},
 getRange:(r,col,height,width)=>({getValues:()=>[legacyRow.slice(col-1,col-1+width)],setValues:matrix=>{migratedRow=matrix[0];}})};
assert.equal(context.migrateLegacyRows_(legacySheet,c),1);
assert.equal(migratedRow.length,n+6);assert.equal(migratedRow[15],'');assert.equal(migratedRow[16],'awaiting_reply');
assert.equal(migratedRow[n],'미반영 · 메뉴에서 선택행 저장');assert.equal(migratedRow[n+1],legacyId);
assert.equal(JSON.parse(migratedRow[n+3])[15],'');assert.equal(migratedRow[n+4],'request-legacy');
console.log('PASS schema upgrade inserts new visible fields without shifting legacy IDs, versions, or unsaved edits');

values=context.row_(committed,c,ctx);values[0]=999;
assert.equal(context.dirty_(values,c),false);
assert.equal(context.textCell_('=IMPORTXML("untrusted")'),'\'=IMPORTXML("untrusted")');
assert.equal(context.textCell_(0),0);
const stopIndex=c.fields.findIndex(field=>field[0]==='do_not_contact');
assert.equal(context.visible_(committed,c,ctx)[stopIndex],false);
assert.equal(context.visible_(committed,c,ctx)[c.fields.findIndex(field=>field[0]==='total_followers')],12345);
assert.equal(context.visible_(committed,c,ctx)[c.fields.findIndex(field=>field[0]==='outreach_status')],'awaiting_reply');
ctx.creatorMetrics['id-1']={tracked:1,visitors:42,signups:7,completed:3,costSeen:true,cost:900,currency:'USD',cpa:300,measurement_status:'observed_window'};
const connectedC=config['Connected Creators'];
assert.equal(context.visible_(committed,connectedC,ctx)[connectedC.fields.findIndex(field=>field[0]==='_creator_completed')],3);
assert.equal(context.visible_(committed,connectedC,ctx)[connectedC.fields.findIndex(field=>field[0]==='_creator_cpa')],300);
console.log('PASS read-only values do not mutate records; untrusted text is not executed as a formula; zero/false preserved');

const formatC=config['Format Bank'],templateC=config['Outreach Templates'];
assert.ok(formatC);assert.ok(templateC);assert.equal(config['포맷'],undefined);
assert.equal(formatC.legacySheet,'포맷');
ctx.refs.gtm_campaigns={'campaign-id':7};ctx.refs.gtm_outreach_templates={'template-id':9};
const formatRow={id:'format-id',ref:3,name:'Creator-native role review',status:'active',
 default_campaign_id:'campaign-id',default_outreach_template_id:'template-id',
 example_links:['https://example.test/one','https://example.test/two'],content_use_count:4};
const visibleFormat=context.visible_(formatRow,formatC,ctx);
assert.equal(visibleFormat[formatC.fields.findIndex(field=>field[0]==='default_campaign_id')],7);
assert.equal(visibleFormat[formatC.fields.findIndex(field=>field[0]==='default_outreach_template_id')],9);
assert.equal(visibleFormat[formatC.fields.findIndex(field=>field[0]==='example_links')],'https://example.test/one, https://example.test/two');
assert.equal(visibleFormat[formatC.fields.findIndex(field=>field[0]==='content_use_count')],4);
assert.ok(templateC.fields.some(field=>field[0]==='response_rate'&&field[2]==='read'));
assert.ok(config['Outreach Log'].fields.some(field=>field[0]==='outreach_template_name'));
assert.ok(config['Outreach Log'].fields.some(field=>field[0]==='reply_type'));
assert.ok(config['Outreach Log'].fields.some(field=>field[0]==='publication_verification_required'));
assert.ok(config['Outreach Log'].fields.some(field=>field[0]==='delivery_status'));
assert.ok(config['Outreach Log'].fields.some(field=>field[0]==='manual_destination'));
assert.ok(config['Outreach Log'].fields.some(field=>field[0]==='delivery_diagnostic'));
console.log('PASS Format Bank and Outreach Templates expose editable guidance, relations, arrays, and read-only usage');

const reviewC=config['Outreach Review'];
assert.ok(reviewC);assert.equal(reviewC.view,'outreach_review');assert.equal(reviewC.reviewMode,true);
assert.deepEqual(reviewC.fields.slice(0,7).map(field=>field[0]),[
 'creator_name','primary_profile_url','recipient_email','outreach_template_name','subject','body','review_action'
]);
assert.ok(!reviewC.fields.some(field=>field[0]==='primary_platform'));
assert.ok(!reviewC.fields.some(field=>field[0]==='primary_handle'));
assert.equal(reviewC.fields.at(-5)[0],'ref');
const reviewVisible=context.visible_({creator_name:'Fixture Creator',primary_platform:'youtube',primary_handle:'fixture',primary_profile_url:'https://youtube.com/@fixture'},reviewC,ctx);
assert.equal(reviewVisible[0],'Fixture Creator\nYouTube · @fixture');
assert.equal(reviewVisible[1],'https://youtube.com/@fixture');
assert.match(reviewC.helpText,/노란색 Review Decision/);
assert.match(reviewC.helpText,/Approve & Send를 선택하면 셀이 초록색/);
assert.equal(reviewC.fields.find(field=>field[0]==='review_action')[2],'decision');
const bridgeSource=fs.readFileSync(__dirname+'/sheets-bridge.gs','utf8');
assert.match(bridgeSource,/whenTextEqualTo\('Approve & Send'\)/);
assert.match(bridgeSource,/setBackground\('#d9ead3'\)/);
assert.match(bridgeSource,/WrapStrategy\.CLIP/);
assert.match(bridgeSource,/setRowHeightsForced\(6,height,38\)/);
assert.match(bridgeSource,/getRange\(4,1,2,s\.getMaxColumns\(\)\)\.clearContent\(\)\.clearFormat\(\)\.clearDataValidations\(\)/);
assert.match(bridgeSource,/addItem\('시트 구조 설치\/업데이트', 'installWorkbook'\)/);
assert.match(bridgeSource,/refreshSheet_\(s,c,ctx\.sheetRows\[name\]\.map\(record=>row_\(record,c,ctx\)\),ctx\)/);
assert.match(bridgeSource,/getRange\(2,1,1,Math\.max\(1,c\.frozenColumns\|\|2\)\)\.merge\(\)/);
assert.ok(
 bridgeSource.indexOf('s.setFrozenRows(0);s.setFrozenColumns(0);')<
 bridgeSource.indexOf("s.getRange(2,1,1,Math.max(1,c.frozenColumns||2)).merge()")
);
assert.equal(context.reviewAction_('Approve & Send'),'approve');
assert.equal(context.reviewAction_('Request Revision'),'request_revision');
assert.equal(context.reviewAction_('Skip'),'skip');
assert.throws(()=>context.reviewAction_(''),/Review Decision/);
console.log('PASS Outreach Review leads with the email decision context and requires one explicit human decision before the send path');
