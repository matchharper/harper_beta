import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ROLE_CREATION_FILES,
  ROLE_CREATION_FILE_ACCEPT,
  ROLE_CREATION_FILE_EXTENSIONS,
  isRoleCreationFileMimeAllowed,
  isRoleCreationFileNameAllowed,
  isRoleCreationMediaMime,
} from "@/lib/org/agent/roleCreationDocumentTypes";

test("role creation accepts only the documented non-media file extensions", () => {
  assert.equal(MAX_ROLE_CREATION_FILES, 3);
  assert.equal(
    ROLE_CREATION_FILE_ACCEPT,
    ROLE_CREATION_FILE_EXTENSIONS.map((extension) => `.${extension}`).join(",")
  );
  for (const extension of ROLE_CREATION_FILE_EXTENSIONS) {
    assert.equal(isRoleCreationFileNameAllowed(`JD.${extension}`), true);
  }
  assert.equal(isRoleCreationFileNameAllowed("photo.png"), false);
  assert.equal(isRoleCreationFileNameAllowed("video.mp4"), false);
  assert.equal(isRoleCreationMediaMime("image/png"), true);
  assert.equal(isRoleCreationMediaMime("video/mp4"), true);
  assert.equal(isRoleCreationMediaMime("audio/mpeg"), true);
  assert.equal(isRoleCreationMediaMime("application/pdf"), false);
  assert.equal(
    isRoleCreationFileMimeAllowed("role.pdf", "application/pdf"),
    true
  );
  assert.equal(
    isRoleCreationFileMimeAllowed("role.pdf", "application/x-msdownload"),
    false
  );
  assert.equal(
    isRoleCreationFileMimeAllowed("role.docx", "application/zip"),
    false
  );
  assert.equal(isRoleCreationFileMimeAllowed("role.txt", ""), true);
});
