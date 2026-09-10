import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveRoleStageMeetingDefaultsUpdate,
  RoleStageMeetingDefaultsValidationError,
} from "./roleStageMeetingDefaults";

const current = {
  candidateMessage: "기술적인 경험을 중심으로 이야기할 예정입니다.",
  durationMinutes: 60,
  meetingPurpose: "기술 인터뷰",
};

test("a duration-only update preserves the other stage meeting defaults", () => {
  const result = resolveRoleStageMeetingDefaultsUpdate({
    current,
    input: { meetingDurationMinutes: 45 },
  });

  assert.deepEqual(result.patch, { meeting_duration_minutes: 45 });
  assert.deepEqual(result.value, { ...current, durationMinutes: 45 });
  assert.equal(result.changed, true);
});

test("a partial update cannot create an incomplete purpose-duration pair", () => {
  assert.throws(
    () =>
      resolveRoleStageMeetingDefaultsUpdate({
        current: {
          candidateMessage: null,
          durationMinutes: null,
          meetingPurpose: null,
        },
        input: { meetingDurationMinutes: 45 },
      }),
    RoleStageMeetingDefaultsValidationError
  );
});

test("purpose and duration can be cleared together without erasing the candidate note", () => {
  const result = resolveRoleStageMeetingDefaultsUpdate({
    current,
    input: {
      meetingDurationMinutes: null,
      meetingPurpose: null,
    },
  });

  assert.deepEqual(result.patch, {
    meeting_duration_minutes: null,
    meeting_purpose: null,
  });
  assert.deepEqual(result.value, {
    candidateMessage: current.candidateMessage,
    durationMinutes: null,
    meetingPurpose: null,
  });
});

test("an unchanged explicit meeting default is an idempotent no-op", () => {
  const result = resolveRoleStageMeetingDefaultsUpdate({
    current,
    input: { meetingDurationMinutes: 60 },
  });

  assert.equal(result.changed, false);
  assert.deepEqual(result.patch, { meeting_duration_minutes: 60 });
});
