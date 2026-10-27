import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { NextRequest } from "next/server";

test("single-document refresh checks the signed-in owner and does not cache URLs", async (t) => {
  let authenticated = true;
  let exists = true;
  let signs = 0;
  const nodeModule = Module as any;
  const originalLoad = nodeModule._load;
  t.mock.method(nodeModule, "_load", function (this: unknown, name: string, ...args: unknown[]) {
    if (name === "@/lib/supabaseServer") return { getRequestUser: async () => authenticated ? { id: "owner" } : null };
    if (name === "@/lib/talentOnboarding/server") return {
      getTalentSupabaseAdmin: () => ({}),
      fetchTalentDocument: async ({ userId, documentId }: { userId: string; documentId: string }) => {
        assert.equal(userId, "owner");
        assert.equal(documentId, "resume-1");
        return exists ? { id: documentId } : null;
      },
      serializeTalentDocuments: async ({ documents }: { documents: { id: string }[] }) => {
        signs++;
        return documents.map((d) => ({ ...d, downloadUrl: `fresh-${signs}` }));
      },
    };
    if (name === "@/lib/talentOnboarding/errorLogs") return {};
    return originalLoad.call(this, name, ...args);
  });
  const { GET } = await import("./route");
  const read = () => GET(new NextRequest("https://fixture.invalid/api/talent/documents?documentId=resume-1"));
  for (const number of [1, 2]) {
    const response = await read();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal((await response.json()).documents[0].downloadUrl, `fresh-${number}`);
  }
  exists = false;
  assert.equal((await read()).status, 404);
  authenticated = false;
  assert.equal((await read()).status, 401);
  assert.equal(signs, 2);
});
