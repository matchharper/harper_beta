/** Harper Contents Engine. Bound to one workbook.
 * @OnlyCurrentDoc
 * GTM_TABLES is generated from sheet-columns.json and inserted above this file.
 * Teammates authenticate with their Harper Google Workspace identity. GTM
 * credentials stay on the Harper server and are never stored in this workbook.
 */
const GTM_SHEET_SCHEMA_VERSION='2026-09-18-v16';
const GTM_APP_URL='https://matchharper.com';
const GTM_SPREADSHEET_ID='1-3QpEN19fFEiP6acBqLWMCOD483bWvJtPwwQ9KUqgEI';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Contents Engine')
    .addItem('전체 새로고침', 'refreshAll')
    .addItem('시트 구조 설치/업데이트', 'installWorkbook')
    .addItem('자동 동기화 설치/복구', 'installAutoSync')
    .addItem('선택한 행 저장', 'saveSelected')
    .addItem('Outreach Review 선택행 승인/반영', 'saveOutreachReviewSelected')
    .addItem('선택한 행 상세', 'showSelected')
    .addItem('선택한 행 서버값 다시 읽기', 'reloadSelected')
    .addSeparator()
    .addItem('연결 확인', 'verifyConnection').addToUi();
}
function rpc_(request) {
  return postRpc_('gtm_api',request);
}
function googleIdentityToken_(){
  const token=ScriptApp.getIdentityToken();
  if(!token)throw Error('Harper Google Workspace 권한이 필요합니다. 이 메뉴를 다시 실행해 Google 권한을 승인하세요.');
  return token;
}
function postServer_(path,payload){
  const response=UrlFetchApp.fetch(GTM_APP_URL+path,{
    method:'post',contentType:'application/json',
    headers:{Authorization:'Bearer '+googleIdentityToken_()},
    payload:JSON.stringify(payload),muteHttpExceptions:true
  });
  let data={};
  try{data=JSON.parse(response.getContentText()||'{}');}
  catch(error){throw Error('서버 응답을 읽을 수 없습니다. HTTP '+response.getResponseCode());}
  if(response.getResponseCode()>=400)throw Error(data.error||data.message||('API '+response.getResponseCode()));
  return data;
}
function postRpc_(name,request) {
  return postServer_('/api/internal/contents-engine/sheets/rpc',{rpc:name,params:request});
}
function verifyConnection(){
  const r=rpc_({action:'list',entity:'gtm_creators',data:{limit:1}});
  SpreadsheetApp.getActive().toast('Google Workspace 연결 확인 · '+r.as_of,'Contents Engine',8);
}
function all_(entity,filters){
  let rows=[],offset=0;
  do{const r=rpc_({action:'list',entity:entity,data:{limit:500,offset:offset,filters:filters||{}}});rows=rows.concat(r.rows);offset=r.next_offset;}while(offset!==null);
  return rows;
}
function allView_(view){
  let rows=[],offset=0;
  do{const r=postRpc_('gtm_sheet_view',{view:view,limit:500,offset:offset});rows=rows.concat(r.rows);offset=r.next_offset;}while(offset!==null);
  return rows;
}
function getRecord_(c,id){
  return c.view
    ? postRpc_('gtm_sheet_view',{view:c.view,id:id}).record
    : rpc_({action:'get',entity:c.entity,id:id}).record;
}
function context_(){
  const records={},sheetRows={},refs={},names={};
  [...new Set(Object.values(GTM_TABLES).filter(c=>!c.view).map(c=>c.entity).concat(['gtm_creators','gtm_accounts','gtm_activities']))].forEach(entity=>{
    records[entity]=all_(entity,entity==="gtm_activities"?{kind:"review_adopted"}:{});refs[entity]={};names[entity]={};
    records[entity].forEach(r=>{refs[entity][r.id]=r.ref;names[entity][r.ref]=r.id;});
  });
  Object.keys(GTM_TABLES).forEach(name=>{
    const c=GTM_TABLES[name];
    sheetRows[name]=c.view?allView_(c.view):records[c.entity];
  });
  const perf=rpc_({action:'performance'}),metrics={},creatorMetrics={};
  const start=Date.parse(perf.start_at),end=Date.parse(perf.end_at);
  perf.contents.forEach(r=>{
    metrics[r.id]=r;
    if(!r.creator_id)return;
    const m=creatorMetrics[r.creator_id]||(creatorMetrics[r.creator_id]={contents:0,tracked:0,visitors:0,signups:0,completed:0,cost:0,costSeen:false,currencies:new Set(),windowCost:0,windowCompleted:0,windowCostComplete:true,windowCurrencies:new Set(),statuses:new Set()});
    m.contents++;
    if(r.landing_visitors!==null&&r.landing_visitors!==undefined){m.tracked++;m.visitors+=Number(r.landing_visitors);m.signups+=Number(r.signups||0);m.completed+=Number(r.onboarding_completed_7d||0);}
    if(r.allocated_lifetime_cost!==null&&r.allocated_lifetime_cost!==undefined&&r.currency){m.cost+=Number(r.allocated_lifetime_cost);m.costSeen=true;m.currencies.add(r.currency);}
    const published=Date.parse(r.published_at),inWindow=Number.isFinite(published)&&published>=start&&published<end;
    if(inWindow){
      m.windowCompleted+=Number(r.onboarding_completed_7d||0);
      if(r.allocated_lifetime_cost===null||r.allocated_lifetime_cost===undefined||!r.currency)m.windowCostComplete=false;
      else{m.windowCost+=Number(r.allocated_lifetime_cost);m.windowCurrencies.add(r.currency);}
    }
    if(r.measurement_status)m.statuses.add(r.measurement_status);
  });
  Object.values(creatorMetrics).forEach(m=>{
    m.currency=m.currencies.size===1?[...m.currencies][0]:(m.currencies.size>1?'mixed':'');
    m.cpa=m.windowCostComplete&&m.windowCurrencies.size===1&&m.windowCompleted>0?m.windowCost/m.windowCompleted:'';
    m.measurement_status=m.contents===0?'no_content':m.tracked===0?'untracked':m.statuses.has('observing')?'observing':m.statuses.has('observed_window')?'observed_window':'partial';
  });
  const reviews={},reviewedAt={};records.gtm_activities.filter(r=>r.kind==='review_adopted').sort((a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at)).forEach(r=>{
    reviews[r.entity_id]=r.payload.direction||'';
    reviewedAt[r.entity_id]=r.occurred_at||'';
  });
  return {records,sheetRows,refs,names,perf,metrics,creatorMetrics,reviews,reviewedAt};
}
function platformLabel_(value){
  const labels={youtube:'YouTube',instagram:'Instagram',tiktok:'TikTok',twitter:'X',x:'X',threads:'Threads',linkedin:'LinkedIn'};
  const key=String(value||'').trim();
  return labels[key.toLowerCase()]||key;
}
function creatorReviewLabel_(r){
  const name=String(r.creator_name||'').trim(),platform=platformLabel_(r.primary_platform);
  let handle=String(r.primary_handle||'').trim();
  if(handle&&handle[0]!=='@')handle='@'+handle;
  const account=[platform,handle].filter(Boolean).join(' · ');
  return account?name+'\n'+account:name;
}
function visible_(r,c,ctx){
  const m=ctx.metrics[r.id]||{},cm=ctx.creatorMetrics[r.id]||{},derived={_next:(r.action_items||[]).filter(x=>x.status==='open').map(x=>x.text).join(' / '),_direction:ctx.reviews[r.id]||'',_signups:m.signups,_completed:m.onboarding_completed_7d,_visitors:m.landing_visitors,_cost:m.allocated_lifetime_cost,_cpa:m.provisional_cost_per_completion,_currency:m.currency,_measurement:m.measurement_status,_creator_visitors:cm.tracked?cm.visitors:'',_creator_signups:cm.tracked?cm.signups:'',_creator_completed:cm.tracked?cm.completed:'',_creator_cost:cm.costSeen?cm.cost:'',_creator_currency:cm.currency||'',_creator_cpa:cm.cpa===undefined?'':cm.cpa,_creator_measurement:cm.measurement_status||'no_content'};
  return c.fields.map(([k,label,type])=>{
    let value=c.reviewMode&&k==='creator_name'?creatorReviewLabel_(r):(k[0]==='_'?derived[k]:r[k]);
    if(type.startsWith('gtm_'))value=value?(ctx.refs[type][value]||'연결 확인 필요'):'';
    if(Array.isArray(value))value=value.join(', ');
    return value===null||value===undefined?'':value;
  });
}
function row_(r,c,ctx){const v=visible_(r,c,ctx);return v.concat(['저장됨',r.id,r.row_version,JSON.stringify(v),'','']);}
function dirty_(row,c){
  if(!row[c.fields.length+1])return c.fields.some((f,i)=>f[2]!=='read'&&row[i]!==''&&row[i]!==false);
  const baseline=JSON.parse(row[c.fields.length+3]||'[]');
  return c.fields.some((f,i)=>f[2]!=='read'&&String(row[i])!==String(baseline[i]===undefined?'':baseline[i]));
}
function rows_(sheet,c){return sheet.getLastRow()<6?[]:sheet.getRange(6,1,sheet.getLastRow()-5,c.fields.length+6).getValues();}
function textCell_(v){return typeof v==='string'&&/^[=+@]/.test(v)?"'"+v:v;}
function writeRows_(sheet,start,values){
  if(values.length)sheet.getRange(start,1,values.length,values[0].length).setValues(values.map(row=>row.map(textCell_)));
}
function workbook_(){
  return SpreadsheetApp.getActiveSpreadsheet()||SpreadsheetApp.openById(GTM_SPREADSHEET_ID);
}
function migrateLegacyRows_(sheet,c){
  const insertions=(c.legacyInsertions||[]).slice().sort((a,b)=>a-b);
  if(!insertions.length||sheet.getLastRow()<6)return 0;
  const oldFieldCount=c.fields.length-insertions.length;
  const oldWidth=oldFieldCount+6,newWidth=c.fields.length+6;
  if(sheet.getMaxColumns()<newWidth)sheet.insertColumnsAfter(sheet.getMaxColumns(),newWidth-sheet.getMaxColumns());
  const source=sheet.getRange(6,1,sheet.getLastRow()-5,oldWidth).getValues();
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let migrated=0;
  source.forEach((row,rowIndex)=>{
    const oldId=row[oldFieldCount+1],newId=row[c.fields.length+1];
    if(!uuid.test(String(oldId||''))||uuid.test(String(newId||'')))return;
    const visible=row.slice(0,oldFieldCount),meta=row.slice(oldFieldCount,oldFieldCount+6);
    let baseline;
    try{baseline=JSON.parse(meta[3]||'[]');}
    catch(error){throw Error(sheet.getName()+'의 기존 행 기준값을 읽을 수 없습니다. 편집을 유지한 채 관리자 확인이 필요합니다.');}
    insertions.forEach(index=>{visible.splice(index,0,'');baseline.splice(index,0,'');});
    meta[3]=JSON.stringify(baseline);
    sheet.getRange(rowIndex+6,1,1,newWidth).setValues([visible.concat(meta)]);
    migrated++;
  });
  return migrated;
}
function migrateFieldOrderRows_(sheet,c){
  const oldKeys=c.legacyFieldOrder||[],oldHeaders=c.legacyHeaders||[];
  if(!oldKeys.length||oldKeys.length!==oldHeaders.length||sheet.getLastRow()<5)return 0;
  const currentHeaders=sheet.getRange(5,1,1,oldHeaders.length).getValues()[0];
  if(oldHeaders.some((header,index)=>String(currentHeaders[index]||'')!==header))return 0;
  const oldWidth=oldKeys.length+6,newKeys=c.fields.map(field=>field[0]),newWidth=newKeys.length+6;
  if(sheet.getMaxColumns()<newWidth)sheet.insertColumnsAfter(sheet.getMaxColumns(),newWidth-sheet.getMaxColumns());
  const oldIndexes={};oldKeys.forEach((key,index)=>oldIndexes[key]=index);
  const source=sheet.getLastRow()<6?[]:sheet.getRange(6,1,sheet.getLastRow()-5,oldWidth).getValues();
  let migrated=0;
  source.forEach((row,rowIndex)=>{
    if(!row.some(value=>value!==''&&value!==null))return;
    const visible=row.slice(0,oldKeys.length),meta=row.slice(oldKeys.length,oldKeys.length+6);
    let baseline=[];
    if(meta[3]){
      try{baseline=JSON.parse(meta[3]);}
      catch(error){throw Error(sheet.getName()+'의 기존 행 기준값을 읽을 수 없습니다. 편집을 유지한 채 관리자 확인이 필요합니다.');}
    }
    const remap=values=>newKeys.map(key=>oldIndexes[key]===undefined?'':values[oldIndexes[key]]);
    meta[3]=JSON.stringify(remap(baseline));
    const target=sheet.getRange(rowIndex+6,1,1,Math.max(oldWidth,newWidth));
    target.clearContent();
    sheet.getRange(rowIndex+6,1,1,newWidth).setValues([remap(visible).concat(meta)]);
    migrated++;
  });
  return migrated;
}
function clearWarningOnlyProtections_(sheet){
  if(sheet.getName()!=='Creator Directory')return;
  [SpreadsheetApp.ProtectionType.RANGE,SpreadsheetApp.ProtectionType.SHEET].forEach(type=>{
    sheet.getProtections(type).forEach(protection=>{if(protection.isWarningOnly())protection.remove();});
  });
}
function a1Column_(column){
  let label='';
  while(column>0){column--;label=String.fromCharCode(65+column%26)+label;column=Math.floor(column/26);}
  return label;
}
function setReviewDecisionFormatting_(sheet,range,c){
  const sheetId=sheet.getSheetId(),column=range.getColumn(),startRow=range.getRow();
  const decisionColumn=a1Column_(column),sentColumn=a1Column_(fieldIndex_(c,'sent_at')+1);
  const rules=sheet.getConditionalFormatRules().filter(rule=>
    !rule.getRanges().some(existing=>
      existing.getSheet().getSheetId()===sheetId&&
      existing.getColumn()===column&&existing.getRow()===startRow
    )
  );
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=OR($'+decisionColumn+startRow+'="Approve & Send",$'+sentColumn+startRow+'<>"")')
      .setBackground('#d9ead3').setFontColor('#274e13').setBold(true)
      .setRanges([range]).build()
  );
  sheet.setConditionalFormatRules(rules);
}
function formatReviewRows_(sheet,c){
  const height=Math.max(1,sheet.getMaxRows()-5);
  sheet.getRange(6,1,height,c.fields.length+6)
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
    .setVerticalAlignment('middle');
  const creatorColumn=fieldIndex_(c,'creator_name')+1;
  sheet.getRange(6,creatorColumn,height,1)
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  const decisionColumn=fieldIndex_(c,'review_action')+1;
  const decisionRange=sheet.getRange(6,decisionColumn,height,1);
  decisionRange.setBackground('#fff2cc').setFontWeight('bold').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Approve & Send','Request Revision','Skip'],true).setAllowInvalid(false).build()
  );
  setReviewDecisionFormatting_(sheet,decisionRange,c);
  sheet.setRowHeightsForced(6,height,38);
}
function formatPricingStrategyRows_(sheet,c){
  if(c.entity!=='gtm_compensation_strategies')return;
  const height=Math.max(1,sheet.getMaxRows()-5),width=c.fields.length+1;
  const labelColumn=fieldIndex_(c,'recommended_label')+1;
  const rule=SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$A6="⭐ 현재 권장 실험안"')
    .setBackground('#fff2cc').setFontColor('#7f6000').setBold(true)
    .setRanges([sheet.getRange(6,1,height,width)]).build();
  sheet.setConditionalFormatRules([rule]);
  sheet.getRange(5,labelColumn).setBackground('#f4b400').setFontColor('#3d2c00')
    .setNote('새 Outreach에 우선 적용할 현재 권장 실험안입니다. 검증된 최적 ROI를 뜻하지 않으며, 새 성과가 쌓이면 추천 이유와 함께 갱신합니다.');
}
function prepareWorkbook(){
  const ss=workbook_(),properties=PropertiesService.getDocumentProperties();
  const schemaChanged=properties.getProperty('GTM_SHEET_SCHEMA_VERSION')!==GTM_SHEET_SCHEMA_VERSION;
  const meta=['Sync Status','Record ID','Row Version','Baseline','Request ID','Request Payload'];
  Object.keys(GTM_TABLES).forEach(name=>{
    const c=GTM_TABLES[name];
    let s=ss.getSheetByName(name);
    if(!s&&c.legacySheet&&ss.getSheetByName(c.legacySheet)){
      s=ss.getSheetByName(c.legacySheet);s.setName(name);
    }
    if(!s)s=ss.insertSheet(name);
    clearWarningOnlyProtections_(s);
    migrateFieldOrderRows_(s,c);
    migrateLegacyRows_(s,c);
    const width=c.fields.length+meta.length;
    if(s.getMaxColumns()<width)s.insertColumnsAfter(s.getMaxColumns(),width-s.getMaxColumns());
    if(s.getMaxRows()<6)s.insertRowsAfter(s.getMaxRows(),6-s.getMaxRows());
    s.showColumns(1,width);
    s.setFrozenRows(0);s.setFrozenColumns(0);
    s.getRange(1,1,5,s.getMaxColumns()).breakApart();
    s.getRange(1,1).setValue(name).setFontSize(15).setFontWeight('bold');
    s.getRange(2,1).setValue(c.helpText||(c.view?'Automatically synced operating view. Read-only fields are rebuilt from Supabase.':'Supabase is canonical. Edit allowed fields, then save the selected row.'));
    if(c.reviewMode){
      s.getRange(2,1,1,Math.max(1,c.frozenColumns||2)).merge().setBackground('#fff2cc').setFontColor('#7f6000')
        .setFontWeight('bold').setWrap(true).setVerticalAlignment('middle');
      s.setRowHeight(2,44);
    }
    s.getRange(4,1,2,s.getMaxColumns()).clearContent().clearFormat().clearDataValidations();
    s.getRange(5,1,1,width).setValues([c.fields.map(f=>f[1]).concat(meta)])
      .setBackground('#1f4e78').setFontColor('#ffffff').setFontWeight('bold').setWrap(true);
    s.setFrozenRows(5);s.setFrozenColumns(c.frozenColumns||2);
    const oldFilter=s.getFilter();if(oldFilter)oldFilter.remove();
    s.getRange(5,1,Math.max(2,s.getMaxRows()-4),c.fields.length+1).createFilter();
    const dataRange=s.getRange(6,1,Math.max(1,s.getMaxRows()-5),width);
    dataRange.clearDataValidations().setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
      .setVerticalAlignment('middle');
    s.setRowHeightsForced(6,Math.max(1,s.getMaxRows()-5),32);
    s.setColumnWidth(1,c.entity==='gtm_compensation_strategies'?180:80);
    if(c.fields.length>1)s.setColumnWidth(2,180);
    c.fields.forEach((field,index)=>{
      const key=field[0],col=index+1;
      if(key==='body')s.setColumnWidth(col,440);
      else if(key==='subject')s.setColumnWidth(col,300);
      else if(key==='performance_conclusion')s.setColumnWidth(col,360);
      else if(c.reviewMode&&key==='creator_name')s.setColumnWidth(col,240);
      else if(c.reviewMode&&key==='primary_profile_url')s.setColumnWidth(col,240);
      else if(key==='review_action')s.setColumnWidth(col,190);
      else if(/summary|history|notes|description|message|template|sequence|profile|offer|rule/.test(key))s.setColumnWidth(col,320);
      else if(/url|email|contact|audience|action|reason|hook|ask|link/.test(key))s.setColumnWidth(col,210);
      else if(col>2)s.setColumnWidth(col,145);
      if(key==='outreach_score'){
        s.getRange(5,col).setBackground('#fef3c7').setFontColor('#78350f');
        s.getRange(6,col,Math.max(1,s.getMaxRows()-5),1).setBackground('#fff9db');
      }else if(field[2]==='read')s.getRange(6,col,Math.max(1,s.getMaxRows()-5),1).setBackground('#f3f4f6');
      else if(field[2]==='decision'){
        s.getRange(5,col).setBackground('#f4b400').setFontColor('#3d2c00')
          .setNote('제목과 본문을 확인한 뒤 이 칼럼에서 결정을 선택하고, Contents Engine → Outreach Review 선택행 승인/반영을 실행하세요.');
      }
      else if(field[2]==='bool')s.getRange(6,col,Math.max(1,s.getMaxRows()-5),1).insertCheckboxes();
      if(c.entity==='gtm_compensation_strategies'&&key==='status'){
        s.getRange(6,col,Math.max(1,s.getMaxRows()-5),1).setDataValidation(
          SpreadsheetApp.newDataValidation().requireValueInList(['draft','active','retired'],true).setAllowInvalid(false).build()
        );
      }
      if(c.entity==='gtm_compensation_strategies'&&key==='pricing_model'){
        s.getRange(6,col,Math.max(1,s.getMaxRows()-5),1).setDataValidation(
          SpreadsheetApp.newDataValidation().requireValueInList(['fixed','base_plus_views'],true).setAllowInvalid(false).build()
        );
      }
      if(key==='performance_conclusion'){
        s.getRange(5,col).setNote('가장 최근에 저장된 성과 리뷰를 표시합니다. 🟢 Scale=확대·반복, 🟡 Retry=변경 후 재시도, 🟠 Hold=보류, 🔴 Stop=중단, ⚪=리뷰 전 또는 방향 미정입니다. 제안과 팀원이 채택한 결론을 구분하며, 조회수 같은 수치 임계값으로 자동 판정하지 않습니다.');
      }
    });
    if(c.reviewMode)formatReviewRows_(s,c);
    formatPricingStrategyRows_(s,c);
    s.hideColumns(c.fields.length+2,5);
    s.setTabColor(c.view?'#6b7280':'#2563eb');
  });
  properties.setProperty('GTM_SHEET_SCHEMA_VERSION',GTM_SHEET_SCHEMA_VERSION);
  ss.toast('운영 시트와 원장 시트 구조를 업데이트했습니다.','Contents Engine',8);
  return schemaChanged;
}
function mergeRefreshRows_(current,remote,c){
  const idIndex=c.fields.length+1,remoteIds={};
  remote.forEach(row=>{if(row[idIndex])remoteIds[String(row[idIndex])]=true;});
  const dirtyById={},dirtyWithoutId=[];
  current.forEach(row=>{
    if(!dirty_(row,c))return;
    const id=String(row[idIndex]||'');
    if(id)dirtyById[id]=row;else dirtyWithoutId.push(row);
  });
  const merged=remote.map(row=>dirtyById[String(row[idIndex]||'')]||row);
  Object.keys(dirtyById).forEach(id=>{
    if(remoteIds[id])return;
    const row=dirtyById[id].slice();
    row[c.fields.length]='미반영 · 서버 목록에서 사라진 행 · 저장 전 확인 필요';
    merged.push(row);
  });
  return {dirtyCount:Object.keys(dirtyById).length+dirtyWithoutId.length,rows:merged.concat(dirtyWithoutId)};
}
function refreshSheet_(s,c,remoteValues,ctx){
  const merged=mergeRefreshRows_(rows_(s,c),remoteValues,c),values=merged.rows;
  const count=Math.max(values.length,s.getLastRow()-5,1);
  if(s.getMaxRows()<count+5)s.insertRowsAfter(s.getMaxRows(),count+5-s.getMaxRows());
  s.getRange(6,1,count,c.fields.length+6).clearContent();
  writeRows_(s,6,values);
  if(c.reviewMode)formatReviewRows_(s,c);
  formatPricingStrategyRows_(s,c);
  s.getRange('A3').setValue(
    '정상 동기화 '+ctx.perf.generated_at+' · 조회 범위 '+ctx.perf.start_at+' ~ '+ctx.perf.end_at+
    (merged.dirtyCount?' · 미반영 편집 '+merged.dirtyCount+'행 보존':'')
  ).setBackground('#d9ead3').setFontColor('#274e13');
  s.hideColumns(c.fields.length+2,5);
  return merged.dirtyCount;
}
function installWorkbook(){
  const schemaChanged=prepareWorkbook();
  if(!schemaChanged)return;
  try{
    const ss=workbook_(),ctx=context_(),name='Outreach Review',c=GTM_TABLES[name],s=ss.getSheetByName(name);
    refreshSheet_(s,c,ctx.sheetRows[name].map(record=>row_(record,c,ctx)),ctx);
    ss.toast('시트 구조 업데이트와 Outreach Review 재동기화를 완료했습니다.','Contents Engine',8);
  }catch(error){
    PropertiesService.getDocumentProperties().deleteProperty('GTM_SHEET_SCHEMA_VERSION');
    throw error;
  }
}
function installAutoSync(){
  prepareWorkbook();
  const ss=workbook_(),handlers=['refreshAllFromTrigger','refreshOnOpen'];
  ScriptApp.getProjectTriggers().forEach(trigger=>{
    if(handlers.indexOf(trigger.getHandlerFunction())>=0)ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('refreshAllFromTrigger').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('refreshOnOpen').forSpreadsheet(ss).onOpen().create();
  refreshAllCore_(ss,true);
  ss.toast('1분 주기와 파일 열기 자동 동기화를 설치했습니다.','Contents Engine',8);
}
function refreshOnOpen(event){refreshAllFromTrigger(event);}
function refreshAllFromTrigger(event){
  const ss=event&&event.source?event.source:workbook_();
  try{refreshAllCore_(ss,false);}
  catch(error){markSyncFailure_(ss,error);console.error('Contents Engine automatic refresh failed: '+error.message);}
}
function refreshAll(){
  const ss=workbook_();
  try{refreshAllCore_(ss,true);}
  catch(error){markSyncFailure_(ss,error);throw error;}
}
function markSyncFailure_(ss,error){
  const message='동기화 실패 '+new Date().toISOString()+' · '+String(error&&error.message||error).slice(0,240);
  Object.keys(GTM_TABLES).forEach(name=>{
    const s=ss.getSheetByName(name);
    if(s)s.getRange('A3').setValue(message).setBackground('#f4cccc').setFontColor('#990000');
  });
  PropertiesService.getDocumentProperties().setProperty('GTM_LAST_SYNC_ERROR',message);
}
function refreshAllCore_(ss,showToast){
  const lock=LockService.getDocumentLock();lock.waitLock(30000);
  try{
    Object.keys(GTM_TABLES).forEach(name=>{
      if(!ss.getSheetByName(name))throw Error(name+' 시트가 없습니다. 먼저 시트 구조를 설치하세요.');
    });
    const ctx=context_();
    const preserved=[];
    Object.keys(GTM_TABLES).forEach(name=>{
      const c=GTM_TABLES[name],s=ss.getSheetByName(name),values=ctx.sheetRows[name].map(r=>row_(r,c,ctx));
      const dirtyCount=refreshSheet_(s,c,values,ctx);
      if(dirtyCount)preserved.push(name+' '+dirtyCount+'행');
    });
    renderPerformance_(ss.getSheetByName('전체 성과'),ctx.perf);
    renderPerformanceFeed_(ss,ctx);
    PropertiesService.getDocumentProperties().deleteProperty('GTM_LAST_SYNC_ERROR');
    if(showToast)ss.toast(
      preserved.length
        ? '갱신 완료 · DB 신규/변경 반영 · 로컬 편집 보존: '+preserved.join(', ')
        : '원장과 제품 성과 갱신 완료',
      'Contents Engine',8
    );
  }finally{lock.releaseLock();}
}
function renderPerformance_(s,p){
  const o=p.product_overall,a=p.actions;
  s.getRange('B3').setValue('UTC '+p.generated_at);
  s.getRange('B4').setValue(p.start_at+' ~ '+p.end_at);
  s.getRange('B7:B12').setValues([[o.landing_visitors],[o.signups],[o.signup_cohort_completed_7d],[a.outreach_sent],[a.published],[a.research_results]]);
  s.getRange('B15').setValue(o.onboarding_completion_events);
  s.getRange('B16').setValue(o.signup_cohort_matured);
  s.getRange('B17').setValue(o.signup_time_fallback);
  s.getRange('A22:D120').clearContent();
  writeRows_(s,22,p.daily.map(r=>[r.day,r.landing_visitors,r.signups,r.onboarding_completion_events]));
}
function byId_(rows){
  const index={};(rows||[]).forEach(row=>index[row.id]=row);return index;
}
function openActions_(record){
  return (record&&record.action_items||[]).filter(item=>item.status==='open');
}
function actionSummary_(record,key){
  const actions=openActions_(record);
  if(key==='text')return actions.map(item=>item.text).filter(Boolean).join(' / ');
  if(key==='owner')return [...new Set(actions.map(item=>item.owner_id).filter(Boolean))].join(', ');
  if(key==='due')return actions.map(item=>item.due_at).filter(Boolean).sort()[0]||'';
  return '';
}
function renderPerformanceFeed_(ss,ctx){
  const name='_Performance Feed';
  let s=ss.getSheetByName(name);if(!s)s=ss.insertSheet(name);
  const headers=[
    'Content ID','Content Ref','Content Name','Platform','Campaign Ref','Campaign','Format Ref','Format',
    'Cost','Currency','Attributed Visitors','Signups','D7 Completed','Content Count','Measurement Status','Published At',
    'Content Direction','Content Next Action','Content Owner','Content Due','Content Reviewed At',
    'Campaign Direction','Campaign Next Action','Campaign Owner','Campaign Due','Campaign Reviewed At',
    'Format Direction','Format Next Action','Format Owner','Format Due','Format Reviewed At',
    'Plan Direction','Plan Next Action','Plan Owner','Plan Due','Plan Reviewed At','Generated At'
  ];
  const contents=byId_(ctx.records.gtm_contents),accounts=byId_(ctx.records.gtm_accounts),campaigns=byId_(ctx.records.gtm_campaigns),formats=byId_(ctx.records.gtm_formats),plans=byId_(ctx.records.gtm_plans);
  const rows=ctx.perf.contents.map(metric=>{
    const content=contents[metric.id]||{},account=accounts[metric.account_id]||{},campaign=campaigns[metric.campaign_id]||{},format=formats[metric.format_id]||{},plan=plans[metric.plan_id]||{};
    return [
      metric.id,metric.ref,metric.title,account.platform||'',campaign.ref||'',campaign.name||'',format.ref||'',format.name||'',
      metric.allocated_lifetime_cost,metric.currency||'',metric.landing_visitors,metric.signups,metric.onboarding_completed_7d,1,metric.measurement_status||'',metric.published_at||'',
      ctx.reviews[metric.id]||'',actionSummary_(content,'text'),actionSummary_(content,'owner'),actionSummary_(content,'due'),ctx.reviewedAt[metric.id]||'',
      ctx.reviews[metric.campaign_id]||'',actionSummary_(campaign,'text'),actionSummary_(campaign,'owner'),actionSummary_(campaign,'due'),ctx.reviewedAt[metric.campaign_id]||'',
      ctx.reviews[metric.format_id]||'',actionSummary_(format,'text'),actionSummary_(format,'owner'),actionSummary_(format,'due'),ctx.reviewedAt[metric.format_id]||'',
      ctx.reviews[metric.plan_id]||'',actionSummary_(plan,'text'),actionSummary_(plan,'owner'),actionSummary_(plan,'due'),ctx.reviewedAt[metric.plan_id]||'',ctx.perf.generated_at
    ];
  });
  const height=Math.max(s.getLastRow(),rows.length+1,2),width=headers.length;
  if(s.getMaxColumns()<width)s.insertColumnsAfter(s.getMaxColumns(),width-s.getMaxColumns());
  if(s.getMaxRows()<height)s.insertRowsAfter(s.getMaxRows(),height-s.getMaxRows());
  s.getRange(1,1,height,width).clearContent();
  s.getRange(1,1,1,width).setValues([headers]).setBackground('#1f4e78').setFontColor('#ffffff').setFontWeight('bold');
  writeRows_(s,2,rows);
  s.setFrozenRows(1);
  if(!s.isSheetHidden())s.hideSheet();
}
function selection_(){
  const s=SpreadsheetApp.getActiveSheet(),c=GTM_TABLES[s.getName()],r=s.getActiveRange();
  if(!c||r.getRow()<6)throw Error('원장 탭의 데이터 행을 선택하세요.');
  return {s,c,r};
}
function saveSelected(){
  const lock=LockService.getDocumentLock();lock.waitLock(30000);
  try{
    const {s,c,r}=selection_(),ctx=context_();
    if(c.readOnly)throw Error('이 시트는 여러 원장을 합친 읽기 화면입니다. 원본 변경은 Creator Directory 또는 해당 원장 시트에서 하세요.');
    if(c.reviewMode){saveOutreachReviewRows_(s,c,r,ctx);return;}
    for(let rowIndex=r.getRow();rowIndex<=r.getLastRow();rowIndex++){
      const values=s.getRange(rowIndex,1,1,c.fields.length+6).getValues()[0];
      if(!dirty_(values,c))continue;
      const data={},baseline=JSON.parse(values[c.fields.length+3]||'[]');
      c.fields.forEach(([key,label,type],i)=>{
        if(type==='read'||String(values[i])===String(baseline[i]===undefined?'':baseline[i]))return;
        let value=values[i];
        if(type.startsWith('gtm_')&&value!==''){
          const result=rpc_({action:'list',entity:type,data:{filters:{ref:Number(value)},limit:2}});
          if(result.rows.length!==1)throw Error(label+': 존재하는 번호를 입력하세요.');value=result.rows[0].id;
        }else if(type==='number'&&value!==''){value=Number(value);if(!Number.isFinite(value))throw Error(label+': 숫자를 입력하세요.');}
        else if(type==='bool')value=value===true||String(value).toLowerCase()==='true';
        else if(type==='array')value=String(value).split(',').map(s=>s.trim()).filter(Boolean);
        else if(type==='date'&&value!==''){const d=new Date(value);if(!Number.isFinite(d.getTime()))throw Error(label+': 시간대를 포함한 ISO 시각을 입력하세요.');value=d.toISOString();}
        data[key]=value===''?null:value;
      });
      const request={action:'save',entity:c.entity,data:data};
      if(values[c.fields.length+1]){request.id=values[c.fields.length+1];request.expected_version=Number(values[c.fields.length+2]);}
      const signature=JSON.stringify(request);
      request.request_id=values[c.fields.length+5]===signature&&values[c.fields.length+4]?values[c.fields.length+4]:Utilities.getUuid();
      s.getRange(rowIndex,c.fields.length+5,1,2).setValues([[request.request_id,signature]]);
      SpreadsheetApp.flush();
      try{
        const result=c.saveRpc
          ?postRpc_(c.saveRpc,{id:request.id||null,expected_version:request.expected_version||null,data:request.data,request_id:request.request_id})
          :rpc_(request);
        const saved=getRecord_(c,result.record.id);
        ctx.refs[c.entity][saved.id]=saved.ref;writeRows_(s,rowIndex,[row_(saved,c,ctx)]);
      }catch(error){s.getRange(rowIndex,c.fields.length+1).setValue('미반영 · '+error.message);throw error;}
    }
    SpreadsheetApp.getActive().toast('선택행 저장·재조회 완료','Contents Engine',8);
  }finally{lock.releaseLock();}
}
function saveOutreachReviewSelected(){
  const active=SpreadsheetApp.getActiveSheet();
  if(active.getName()!=='Outreach Review')throw Error('Outreach Review 시트의 데이터 행을 선택하세요.');
  saveSelected();
}
function fieldIndex_(c,key){
  for(let i=0;i<c.fields.length;i++)if(c.fields[i][0]===key)return i;
  throw Error('시트 설정에 '+key+' 칼럼이 없습니다.');
}
function reviewAction_(value){
  const normalized=String(value||'').trim();
  if(normalized==='Approve & Send')return 'approve';
  if(normalized==='Request Revision')return 'request_revision';
  if(normalized==='Skip')return 'skip';
  throw Error('Review Decision에서 Approve & Send, Request Revision, Skip 중 하나를 선택하세요.');
}
function requestImmediateDispatch_(dispatchId){
  const result=postServer_('/api/internal/contents-engine/outreach/dispatch',{dispatchId:dispatchId});
  if(result.ok===false){
    const failure=result.results&&result.results[0]&&result.results[0].error;
    throw Error(failure||result.error||'Gmail 발송에 실패했습니다.');
  }
  return result;
}
function saveOutreachReviewRows_(s,c,r,ctx){
  const indexes={
    action:fieldIndex_(c,'review_action'),
    subject:fieldIndex_(c,'subject'),
    body:fieldIndex_(c,'body'),
    scheduled:fieldIndex_(c,'scheduled_at'),
    note:fieldIndex_(c,'review_note')
  };
  let approved=0,queued=0,changed=0;
  for(let rowIndex=r.getRow();rowIndex<=r.getLastRow();rowIndex++){
    const values=s.getRange(rowIndex,1,1,c.fields.length+6).getValues()[0];
    if(!dirty_(values,c))continue;
    if(!values[c.fields.length+1])throw Error('저장되지 않은 Outreach 행은 승인할 수 없습니다.');
    const action=reviewAction_(values[indexes.action]);
    let scheduledAt=null;
    if(values[indexes.scheduled]!==''){
      const scheduled=new Date(values[indexes.scheduled]);
      if(!Number.isFinite(scheduled.getTime()))throw Error('Send At은 시간대를 포함한 ISO 시각이어야 합니다.');
      scheduledAt=scheduled.toISOString();
    }
    const request={
      dispatch_id:values[c.fields.length+1],
      expected_version:Number(values[c.fields.length+2]),
      action:action,
      subject:String(values[indexes.subject]||''),
      body:String(values[indexes.body]||''),
      scheduled_at:scheduledAt,
      review_note:values[indexes.note]===''?null:String(values[indexes.note])
    };
    const signature=JSON.stringify(request);
    request.request_id=values[c.fields.length+5]===signature&&values[c.fields.length+4]
      ?values[c.fields.length+4]:Utilities.getUuid();
    s.getRange(rowIndex,c.fields.length+5,1,2).setValues([[request.request_id,signature]]);
    SpreadsheetApp.flush();
    try{
      const result=postRpc_('gtm_outreach_review',request);
      const saved=getRecord_(c,result.id);
      writeRows_(s,rowIndex,[row_(saved,c,ctx)]);
      changed++;
      if(action==='approve'){
        approved++;
        try{
          const delivery=requestImmediateDispatch_(result.id);
          if(delivery.queued)queued++;
          const delivered=getRecord_(c,result.id);
          writeRows_(s,rowIndex,[row_(delivered,c,ctx)]);
        }
        catch(error){
          queued++;
          s.getRange(rowIndex,c.fields.length+1).setValue('승인됨 · 자동 발송 대기 · '+error.message);
        }
      }
    }catch(error){
      s.getRange(rowIndex,c.fields.length+1).setValue('미반영 · '+error.message);
      throw error;
    }
  }
  SpreadsheetApp.getActive().toast(
    approved
      ?'검토 '+changed+'건 반영 · 승인 '+approved+'건'+(queued?' · 백그라운드 발송 대기 '+queued+'건':' · 즉시 발송 요청 완료')
      :'검토 '+changed+'건 반영 완료',
    'Contents Engine',8
  );
}
function showSelected(){
  const {s,c,r}=selection_(),id=s.getRange(r.getRow(),c.fields.length+2).getValue();
  if(!id)throw Error('먼저 이 행을 저장하세요.');
  const result=c.view
    ? postRpc_('gtm_sheet_view',{view:c.view,id:id})
    : rpc_({action:'get',entity:c.entity,id:id});
  const escaped=JSON.stringify(result,null,2).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutput('<div style="font:13px system-ui;padding:12px"><b>연결된 원장·기록</b><p>계정·대화·비용·후속 업무의 자세한 변경은 Agent에게 이 원장 번호와 함께 요청하세요.</p><pre style="white-space:pre-wrap;word-break:break-word">'+escaped+'</pre></div>').setTitle('Contents Engine 상세'));
}
function reloadSelected(){
  const {s,c,r}=selection_(),ui=SpreadsheetApp.getUi();
  if(ui.alert('선택한 행의 미반영 수정을 버리고 서버값으로 다시 읽을까요?',ui.ButtonSet.OK_CANCEL)!==ui.Button.OK)return;
  const ctx=context_();
  for(let n=r.getRow();n<=r.getLastRow();n++){
    const id=s.getRange(n,c.fields.length+2).getValue();
    if(!id)continue;
    const saved=getRecord_(c,id);
    if(saved)writeRows_(s,n,[row_(saved,c,ctx)]);
  }
}
function onEdit(event){
  if(!event||!event.range)return;
  const s=event.range.getSheet(),c=GTM_TABLES[s.getName()];
  if(!c||event.range.getLastRow()<6||event.range.getColumn()>c.fields.length)return;
  const changed=[];
  for(let col=event.range.getColumn();col<=Math.min(event.range.getLastColumn(),c.fields.length);col++){
    if(c.fields[col-1][2]!=='read')changed.push(col);
  }
  const status=c.readOnly||changed.length===0?'Read-only · Supabase sync will restore this value':'미반영 · 메뉴에서 선택행 저장';
  for(let r=Math.max(event.range.getRow(),6);r<=event.range.getLastRow();r++)s.getRange(r,c.fields.length+1).setValue(status);
}
