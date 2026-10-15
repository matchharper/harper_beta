const https=require('node:https');
const fs=require('node:fs');
const crypto=require('node:crypto');
const evidence='/workspace/fixture-evidence';
fs.mkdirSync(evidence,{recursive:true});
const plain=`<!doctype html><title>Example Employer application</title><h1>Example Employer application</h1>
<form action="/submit" method="post">
<label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label>
<label>Resume<input name="resume" type="file" accept=".pdf" required></label>
<fieldset><legend>Written answer</legend><p id="motivation-help">Answer in English. Maximum 700 characters.</p>
<label>Why are you interested in this role?<textarea name="motivation" required maxlength="700" aria-describedby="motivation-help"></textarea></label></fieldset>
<label>Cover letter (optional)<input name="letter" type="file" accept=".pdf,.docx" aria-required="false"></label>
<label>Portfolio URL (optional)<input name="portfolio" type="url" aria-required="false"></label>
<p>Additional questions may appear after choosing a team. Do not choose a team during a read-only check.</p>
<label>Team<select name="team"><option value="">Choose</option><option>Research</option></select></label>
<section style="display:none"><label>Hidden conditional essay<textarea name="hidden"></textarea></label></section>
<button type="submit">Submit application</button></form>`;
const iframe=`<!doctype html><title>Work sample application</title><h1>Prepare your work sample</h1><form action="/submit" method="post">
<label>Email<input name="email" type="email" required></label>
<fieldset><legend>Relevant project</legend><p>Describe one project in English. Maximum 400 characters.</p>
<label>Describe a project relevant to this role.<textarea name="project" required maxlength="400"></textarea></label></fieldset>
<label>Work sample (optional)<input name="sample" type="file" accept=".pdf" aria-required="false"></label><button>Submit</button></form>`;
https.createServer({key:fs.readFileSync('/workspace/key.pem'),cert:fs.readFileSync('/workspace/cert.pem')},(req,res)=>{
 if(req.method!=='GET'){
  fs.writeFileSync(evidence+'/'+crypto.randomUUID(),'');res.writeHead(400);res.end('Test must never send a form');return;
 }
 const pages={'/plain':plain,'/linked':'<!doctype html><title>Example role</title><h1>Example role</h1><p>Build useful software.</p><a href="/form">Apply for this role</a>',
  '/form':'<!doctype html><title>Example application</title><h1>Application form</h1><iframe src="/embed" title="Application"></iframe>', '/embed':iframe,
  '/login':'<!doctype html><title>Sign in required</title><h1>Sign in to view the application form</h1><form action="/submit" method="post"><label>Email<input type="email"></label><label>Password<input type="password"></label><button>Sign in</button></form>'};
 if(!pages[req.url]){res.writeHead(404);res.end('No page');return;}
 res.setHeader('Content-Type','text/html');res.end(pages[req.url]);
}).listen(443,'127.0.0.1');
