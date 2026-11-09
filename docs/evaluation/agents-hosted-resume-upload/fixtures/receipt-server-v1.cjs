const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
let received = 0;
const page = `<!doctype html><title>Synthetic Application Test</title>
<h1>Synthetic application — never sent to an employer</h1>
<form action="/submit" method="POST" enctype="multipart/form-data">
<label>Name <input name="name" required></label>
<label>Email <input name="email" type="email" required></label>
<label>Resume PDF <input name="resume" type="file" accept=".pdf" required></label>
<button type="submit">Submit synthetic test</button></form>`;
http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/application') {
    response.setHeader('Content-Type', 'text/html'); response.end(page); return;
  }
  if (request.method !== 'POST' || request.url !== '/submit') {
    response.writeHead(404); response.end(); return;
  }
  const chunks = []; let length = 0;
  request.on('data', chunk => { length += chunk.length; if (length > 100000) request.destroy(); else chunks.push(chunk); });
  request.on('end', () => {
    try {
      const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/.exec(request.headers['content-type'] || '');
      if (!boundary) throw new Error('Multipart boundary missing');
      const body = Buffer.concat(chunks);
      const marker = Buffer.from('--' + (boundary[1] || boundary[2]));
      let cursor = 0, file;
      while ((cursor = body.indexOf(marker, cursor)) !== -1) {
        const start = cursor + marker.length + 2;
        const end = body.indexOf(marker, start); if (end < 0) break;
        const headersEnd = body.indexOf(Buffer.from('\r\n\r\n'), start);
        const headers = body.subarray(start, headersEnd).toString('utf8');
        const filename = /filename="([^"]+)"/.exec(headers);
        if (filename) file = { name: filename[1], bytes: body.subarray(headersEnd + 4, end - 2) };
        cursor = end;
      }
      if (!file || !file.bytes.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new Error('PDF missing');
      if (received) throw new Error('Duplicate receipt');
      received++;
      const receipt = { receipt: 'synthetic-only-1', count: received, name: file.name, size: file.bytes.length,
        sha256: crypto.createHash('sha256').update(file.bytes).digest('hex') };
      fs.mkdirSync('/workspace/outputs', { recursive: true });
      fs.writeFileSync('/workspace/outputs/server-receipt.json', JSON.stringify(receipt), { mode: 0o600 });
      response.setHeader('Content-Type','text/html');
      response.end('<h1>Received synthetic application</h1><pre id="receipt">' + JSON.stringify(receipt) + '</pre>');
    } catch (error) { response.writeHead(400); response.end(error.message); }
  });
}).listen(8765, '127.0.0.1');
