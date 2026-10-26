import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RichText from "@/components/ui/rich-text";
import { OrgTalentReferenceBadge } from "./OrgTalentReferenceBadge";
import { orgTalentReferenceHref, readOrgTalentReferenceHref, remarkOrgTalentReferences } from "@/lib/org/agent/talentReference";

test("raw UUID Markdown renders the same accessible candidate badge as a named mention", () => {
  const talentId = "a1234567-1234-1234-1234-123456789abc";
  const href = orgTalentReferenceHref({ talentId, workspaceId: "workspace", roleId: "role" });
  const renderLink = ({ href, text }: { href: string; text: string }) => {
    const reference = readOrgTalentReferenceHref(href, "workspace");
    if (!reference) return undefined;
    return <OrgTalentReferenceBadge href={href} talentId={reference.talentId}
      label={text} onClick={() => {}} />;
  };
  const html = renderToStaticMarkup(<RichText content={`후보 ${talentId}와 [이름](${href})`}
    additionalRemarkPlugins={[[remarkOrgTalentReferences, { workspaceId: "workspace", roleId: "role" }]]}
    renderLink={renderLink} />);
  assert.equal((html.match(/data-talent-reference=/g) ?? []).length, 2);
  assert.match(html, /후보자<\/span>/);
  assert.match(html, /이름<\/span>/);
  assert.match(html, /detailRoleId=role/);
  assert.doesNotMatch(html, new RegExp(`>${talentId}<`));
});
