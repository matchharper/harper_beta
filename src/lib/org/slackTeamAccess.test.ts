import assert from "node:assert/strict";
import test from "node:test";
import { canShareOrgTeamSlackAudience, findSlackMemberChannel } from "./slackTeamAccess";

const members = [
  { company_user_id: "owner", authority: "owner", access_scope: "organization", team_id: null },
  { company_user_id: "a", authority: "admin", access_scope: "team", team_id: "a" },
  { company_user_id: "b", authority: "admin", access_scope: "team", team_id: "b" },
];
function fixture(teamId: string | null = "a", roster = members) {
  return { from(table: string) {
    let allowed: string[] = [];
    const query: any = { select: () => query, eq: () => query, maybeSingle: () => query,
      in: (_key: string, ids: string[]) => { allowed = ids; return query; },
      then: (resolve: any, reject: any) => Promise.resolve({ error: null, data:
        table === "company_user_workspace" ? roster : table === "company_roles" ? { company_internal_roles: { team_id: teamId } }
          : allowed.map(id => ({ email: `${id}@example.invalid` })) }).then(resolve, reject) };
    return query;
  } } as any;
}
const base = { workspaceId: "workspace", roleId: "role", botUserId: "harper-bot", channelId: "channel",
  readEmail: async (id: string) => `${id}@example.invalid` };

test("Slack role delivery accepts Owner and the assigned team, rejects sibling/unknown recipients", async () => {
  for (const [recipients, expected] of [ [["owner", "a", "harper-bot"], true], [["a", "b"], false], [["unknown"], false] ] as const) {
    assert.equal(await canShareOrgTeamSlackAudience({ ...base, admin: fixture(), readMembers: async () => ({ members: [...recipients] }) }), expected);
  }
});
test("general Owner replies and unassigned Roles require organization access for every recipient", async () => {
  assert.equal(await canShareOrgTeamSlackAudience({ ...base, admin: fixture(null), readMembers: async () => ({ members: ["owner", "a"] }) }), false);
  assert.equal(await canShareOrgTeamSlackAudience({ ...base, roleId: null, accessTeamId: "a", admin: fixture(), readMembers: async () => ({ members: ["owner", "a"] }) }), true);
});
test("all pages are checked; unavailable audience does not authorize delivery", async () => {
  assert.equal(await canShareOrgTeamSlackAudience({ ...base, admin: fixture(), readMembers: async cursor => cursor ? { members: ["b"] } : { members: ["a"], response_metadata: { next_cursor: "next" } } }), false);
  assert.equal(await canShareOrgTeamSlackAudience({ ...base, admin: fixture(), readMembers: async () => ({}) }), false);
});
test("organizations without restricted teams retain existing channel behavior without Slack lookups", async () => {
  assert.equal(await canShareOrgTeamSlackAudience({ ...base, admin: fixture(null, [members[0]]), readMembers: async () => { throw Error("unexpected Slack read"); } }), true);
});

test("member destination skips unjoined channels and keeps the existing channel order", async () => {
  const channels = ["a", "b", "c"].map(channelId => ({ channelId }));
  const visited: string[] = [];
  const result = await findSlackMemberChannel({ channels, slackUserId: "new-teammate",
    readMembers: async id => {
      visited.push(id);
      return { members: id === "a" ? ["another-teammate"] : ["new-teammate"] };
    },
  });
  assert.equal(result?.channelId, "b");
  assert.deepEqual(visited, ["a", "b"]);
});

test("member destination checks later pages and skips channels the bot cannot read", async () => {
  const result = await findSlackMemberChannel({
    channels: [{ channelId: "private" }, { channelId: "large" }], slackUserId: "new-teammate",
    readMembers: async (id, cursor) => {
      if (id === "private") throw Error("not_in_channel");
      return cursor ? { members: ["new-teammate"] }
        : { members: ["another-teammate"], response_metadata: { next_cursor: "page-2" } };
    },
  });
  assert.equal(result?.channelId, "large");
});

test("no confirmed membership means no channel destination", async () => {
  assert.equal(await findSlackMemberChannel({ channels: [{ channelId: "a" }], slackUserId: "new-teammate",
    readMembers: async () => ({ members: ["another-teammate"] }),
  }), null);
});
