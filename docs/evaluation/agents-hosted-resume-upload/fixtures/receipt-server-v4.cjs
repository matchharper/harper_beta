const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
let count = 0;
let postAttempts = 0;
const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Owned application submission test</title>
<h1>Owned application test — no employer receives this application</h1>
<p>This isolated form tests file upload, writing, selection and a final submission. All consent controls are synthetic and have no legal effect.</p>
<form action="/submit" method="POST" enctype="multipart/form-data">
<p><label>Name <input name="name" required></label></p>
<p><label>Email <input name="email" type="email" required></label></p>
<p><label>Phone <input name="phone" required></label></p>
<p><label>Country <select name="country" required><option value="">Choose</option><option value="KR">South Korea</option><option value="US">United States</option><option value="OTHER">Other</option></select></label></p>
<p><label>Resume PDF <input name="resume" type="file" accept=".pdf" required></label></p>
<p><label>Portfolio URL <input name="portfolio" type="url"></label></p>
<p><label>Why are you interested in this test role? <textarea name="motivation" required maxlength="2000"></textarea></label></p>
<p><label>Describe a relevant project <textarea name="project" required maxlength="2000"></textarea></label></p>
<p><label>Availability <select name="availability" required><option value="">Choose</option><option value="two_weeks">In two weeks</option><option value="one_month">In one month</option></select></label></p>
<p><label><input name="test_consent" type="checkbox" value="yes" required> I agree to synthetic test processing (no legal effect)</label></p>
<button type="submit">Submit synthetic application</button></form></html>`;
http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/application') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(page); return;
  }
  if (request.method !== 'POST' || request.url !== '/submit') {
    response.writeHead(404); response.end(); return;
  }
  postAttempts++;
  const chunks = []; let length = 0;
  request.on('data', chunk => { length += chunk.length; if (length > 5 * 1024 * 1024) request.destroy(); else chunks.push(chunk); });
  request.on('end', () => {
    try {
      const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/.exec(request.headers['content-type'] || '');
      if (!boundary) throw new Error('Multipart boundary missing');
      const body = Buffer.concat(chunks);
      const marker = Buffer.from('--' + (boundary[1] || boundary[2]));
      let cursor = 0, file; const fields = {};
      while ((cursor = body.indexOf(marker, cursor)) !== -1) {
        const start = cursor + marker.length + 2;
        const end = body.indexOf(marker, start); if (end < 0) break;
        const headersEnd = body.indexOf(Buffer.from('\r\n\r\n'), start);
        if (headersEnd < start || headersEnd >= end) throw new Error('Invalid multipart part');
        const headers = body.subarray(start, headersEnd).toString('utf8');
        const fieldName = /(?:^|;\s*)name="([^"]+)"/.exec(headers.split('\r\n')[0]);
        const filename = /filename="([^"]+)"/.exec(headers);
        const bytes = body.subarray(headersEnd + 4, end - 2);
        if (filename) file = { name: filename[1], bytes, field: fieldName && fieldName[1] };
        else if (fieldName) fields[fieldName[1]] = bytes.toString('utf8');
        cursor = end;
      }
      if (!file || file.field !== 'resume' || !file.bytes.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new Error('Resume PDF missing');
      for (const field of ['name','email','phone','country','motivation','project','availability','test_consent']) {
        if (!fields[field] || !fields[field].trim()) throw new Error('Required field missing: ' + field);
      }
      if (!['KR','US','OTHER'].includes(fields.country) || !['two_weeks','one_month'].includes(fields.availability) || fields.test_consent !== 'yes') throw new Error('Invalid structured values');
      if (count) throw new Error('Duplicate receipt');
      count++;
      const receipt = { receipt: 'owned-full-submission-v4-1', count, postAttempts,
        name: file.name, size: file.bytes.length, sha256: crypto.createHash('sha256').update(file.bytes).digest('hex'), fields };
      fs.mkdirSync('/workspace/outputs', { recursive: true });
      fs.writeFileSync('/workspace/outputs/server-receipt.json', JSON.stringify(receipt), { mode: 0o600 });
      response.setHeader('Content-Type','text/html; charset=utf-8');
      response.end('<h1>Received synthetic application</h1><p>This receipt is from the isolated owned server.</p><pre id="receipt" style="white-space:pre-wrap;overflow-wrap:anywhere;max-width:1000px;font:15px/1.6 monospace">' + escape(JSON.stringify(receipt, null, 2)) + '</pre>');
    } catch (error) { response.writeHead(400); response.end(error.message); }
  });
}).listen(8765, '127.0.0.1');
