// Local E2E observer only. Capture actual model inputs/outputs without headers,
// replacing requests, or injecting facts/instructions into the product runtime.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dir = process.env.HARPER_APPLICATION_MEMORY_TRACE_DIR;
if (process.env.HARPER_LOCAL_E2E === '1' && dir) {
  const originalFetch = globalThis.fetch;
  const hosts = new Set(['api.openai.com', 'api.anthropic.com', 'openrouter.ai']);
  const save = (id, suffix, value) => {
    try {
      fs.writeFileSync(path.join(dir, `provider-${id}-${suffix}.json`), JSON.stringify(value), { mode: 0o600 });
    } catch { /* Observability must not change execution. */ }
  };
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (!hosts.has(url.hostname) || !/\/(chat\/completions|responses|messages)$/.test(url.pathname)) return originalFetch(input, init);
    const id = `${Date.now()}-${crypto.randomUUID()}`;
    const body = typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : '';
    let request;
    try { request = JSON.parse(body); } catch { request = body; }
    save(id, 'request', { at: new Date().toISOString(), endpoint: url.origin + url.pathname, request });
    try {
      const response = await originalFetch(input, init);
      const copy = response.clone();
      void copy.text().then(body => {
        let decoded;
        try { decoded = JSON.parse(body); } catch { decoded = body; }
        save(id, 'response', { at: new Date().toISOString(), status: response.status, response: decoded });
      }).catch(() => {});
      return response;
    } catch (error) {
      save(id, 'error', { error: String(error) });
      throw error;
    }
  };
}
