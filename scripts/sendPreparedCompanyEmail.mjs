// Default is read-only. --test sends only the manifest's test copies.
// --send-customers requires a separate explicit human customer-send request.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const manifestPath = resolve(process.argv[2]);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const mode = process.argv.includes('--test') ? 'test' : process.argv.includes('--send-customers') ? 'production' : null;
if (!mode) {
  console.log(`Prepared: ${manifest.production.length} customer emails, ${manifest.test.length} test emails. Nothing sent.`);
  process.exit(0);
}
const ledgerPath = resolve(dirname(manifestPath), `receipts-${mode}.json`);
const receipts = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : {};
for (const row of manifest[mode]) {
  if (receipts[row.file]) { console.log(`Already sent ${row.file}: ${receipts[row.file].id}`); continue; }
  const mail = JSON.parse(readFileSync(resolve(dirname(manifestPath), row.file), 'utf8'));
  if (mail.to.length !== 1 || mail.to[0] !== row.to) throw new Error('Manifest recipient mismatch');
  const key = createHash('sha256').update(`${manifest.campaign}:${mode}:${row.file}:${row.to}`).digest('hex');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(mail),
  });
  const result = await response.json();
  if (!response.ok || !result.id) throw new Error(`Email failed: HTTP ${response.status} ${result.message ?? ''}`);
  receipts[row.file] = { id: result.id, to: row.to, sentAt: new Date().toISOString() };
  writeFileSync(ledgerPath, JSON.stringify(receipts, null, 2), { mode: 0o600 });
  console.log(`Accepted ${row.file}: ${result.id}`);
  await new Promise(r => setTimeout(r, 600));
}
