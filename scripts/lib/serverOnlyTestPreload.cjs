// Unit-test imports only: no real credentials or network, no Next.js server bundle.
const Module = require("node:module");
const load = Module._load;
Module._load = function (request, parent, isMain) {
  return request === "server-only" ? {} : load.call(this, request, parent, isMain);
};
Object.assign(process.env, {
  OPENAI_API_KEY: "unit-test",
  OPENROUTER_API_KEY: "unit-test",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "unit-test",
  SUPABASE_SERVICE_ROLE_KEY: "unit-test",
});
globalThis.fetch = async () => { throw new Error("Unit tests must mock network calls"); };
