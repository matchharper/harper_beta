// Exact public Ashby file-ticket operation; no application/draft mutation allowed.
export const ashbyFileTicketQuery=`mutation ApiCreateFileUploadHandle($organizationHostedJobsPageName: String!, $fileUploadContext: FileUploadContext!, $filename: String!, $contentType: String!, $contentLength: Int!) {
  fileUploadHandle: createFileUploadHandle(organizationHostedJobsPageName: $organizationHostedJobsPageName, fileUploadContext: $fileUploadContext, filename: $filename, contentType: $contentType, contentLength: $contentLength) { handle url fields __typename }
}`;
// Test-only hard authorization boundary. Unknown writes fail closed and are
// reported as harness restrictions, never mislabeled as a website failure.
export function requestDecision({method,url,contentType='',body=Buffer.alloc(0)},candidate,docs,uploadWindow=false){
  const u=new URL(url);
  if(u.protocol!=='https:')return {allow:false,reason:'non-https'};
  const raw=body.toString('utf8');
  // Authorized document contents may contain the synthetic candidate's name.
  // Exclude only those exact bytes from the field-transmission check; the
  // separate file-only request checks below still have to pass.
  let fieldBody=raw;
  for(const d of Object.values(docs))if(d.buffer?.length)fieldBody=fieldBody.split(d.buffer.toString('utf8')).join('');
  let decoded=fieldBody+' '+u.href;
  try{decoded=decodeURIComponent(decoded.replaceAll('+',' '));}catch{}
  for(const key of ['firstName','lastName','email','phone'])if(decoded.includes(candidate[key]))return {allow:false,reason:'applicant-data transmission prevented'};
  if(['GET','HEAD','OPTIONS'].includes(method))return {allow:true,reason:'read'};
  if(method==='POST'&&['api.hcaptcha.com','api2.hcaptcha.com','hcaptcha.com'].includes(u.hostname)&&u.pathname==='/checksiteconfig'&&!body.length)return {allow:true,reason:'observed CAPTCHA configuration read'};
  if(method==='POST'&&u.hostname==='jobs.lever.co'&&u.pathname.startsWith('/cdn-cgi/challenge-platform/'))return {allow:true,reason:'observed browser challenge response, not application endpoint'};
  let json;try{json=JSON.parse(raw);}catch{}
  if(json&&typeof json.query==='string'&&/^\s*query(?:\s|\(|\{)/.test(json.query))return {allow:true,reason:'GraphQL read query'};
  if(!uploadWindow)return {allow:false,reason:'write outside authorized attachment operation'};
  const values=Object.values(docs);
  if(method==='POST'&&u.hostname==='jobs.ashbyhq.com'&&u.pathname==='/api/non-user-graphql'&&json?.operationName==='ApiCreateFileUploadHandle'&&json.query?.replace(/[\s,]+/g,'')===ashbyFileTicketQuery.replace(/[\s,]+/g,'')){
    const v=json.variables;
    if(v&&Object.keys(v).length===5&&typeof v.organizationHostedJobsPageName==='string'&&typeof v.fileUploadContext==='string'&&values.some(d=>v.filename===d.name&&v.contentType===d.mimeType&&v.contentLength===d.buffer.length))return {allow:true,reason:'exact observed Ashby file-only upload ticket'};
  }
  if(body.length&&values.some(d=>body.equals(d.buffer)))return {allow:true,reason:'exact approved file bytes'};
  if(contentType.startsWith('multipart/form-data')){
    // Observed Greenhouse file-object storage destination. An S3 object upload
    // cannot itself call the ATS application submission endpoint.
    if(['grnhse-prod-jben-us-east-1.s3.amazonaws.com','ninehire-file-prd-ceb1da88.s3-accelerate.amazonaws.com','ashbyhq-infra-prd-main-app-uploaded-files-us-east-1.s3.us-east-1.amazonaws.com'].includes(u.hostname)&&values.some(d=>body.includes(d.buffer)))return {allow:true,reason:'approved document to observed S3 upload bucket'};
    const names=[...raw.matchAll(/Content-Disposition:\s*form-data;\s*name="([^"]+)"/gi)].map(m=>m[1]);
    if(u.hostname==='jobs.lever.co'&&u.pathname==='/parseResume'&&names.length===2&&names.includes('resume')&&names.includes('accountId')&&values.some(d=>body.includes(d.buffer)))return {allow:true,reason:'observed file-only resume parsing request'};
    const metadata=new Set(['file','files','files[]','resume','attachment','document','key','policy','Content-Type','content-type','acl','success_action_status','x-amz-algorithm','x-amz-credential','x-amz-date','x-amz-signature','x-amz-security-token']);
    if(names.length&&names.every(n=>metadata.has(n))&&values.some(d=>body.includes(d.buffer)))return {allow:true,reason:'approved file multipart without application fields'};
  }
  const metadata=Array.isArray(json)&&json.length===1?json[0]:json;
  if(metadata&&typeof metadata==='object'&&!Array.isArray(metadata)){
    // Greeting's observed Next action asks for a file ticket with no applicant facts.
    if(u.hostname.endsWith('.career.greetinghr.com')&&Object.keys(metadata).length===3&&typeof metadata.usage==='string'&&metadata.usage.length<80&&values.some(d=>metadata.filename===d.name&&metadata.fileSize===d.buffer.length))return {allow:true,reason:'observed file metadata ticket request'};
    const keys=new Set(['name','filename','fileName','file_name','originalFileName','type','fileType','file_type','mimeType','mime_type','contentType','content_type','size','fileSize','file_size','contentLength','content_length']);
    const leaf=Object.values(metadata);
    if(Object.keys(metadata).length&&Object.keys(metadata).every(k=>keys.has(k))&&values.some(d=>leaf.includes(d.name))&&leaf.every(v=>values.some(d=>[d.name,d.mimeType,d.buffer.length].includes(v))))return {allow:true,reason:'file metadata ticket request'};
  }
  return {allow:false,reason:'unrecognized write; final submission not authorized'};
}
