import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  applyAction,
  validateBackup,
} from "../server/domain.mjs";
import { occupancyDays, outreachGapReason } from "../server/availability.mjs";
import { approvalBasis } from "../server/automation.mjs";
const now = Date.parse("2026-10-01T10:00:00Z");
const entry = (id, status = "inquiry", extra = {}) => ({
  id,
  name: "Fictional traveler",
  start: "2026-10-01",
  end: "2026-10-31",
  status,
  precision: "approximate",
  people: 1,
  reviewed: false,
  sourceUrl: "https://www.workaway.info/en/workawayer/fixture",
  summary: "Flexible proposed stay",
  evidence: [{ messageId: "123", quote: "I could arrive in October." }],
  ...extra,
});
const act = (s, type, payload) =>
  applyAction(s, { type, payload }, new Date(now).toISOString());
function planned() {
  const s = initialState();
  Object.assign(s.profile, { start: "2026-10-01", end: "2026-12-31" });
  Object.assign(s.availability.gapPolicy, {
    enabled: true,
    reviewedThrough: "2026-12-31",
    reviewedAt: new Date(now).toISOString(),
  });
  return s;
}
test("imports do not arm gap outreach; inquiries remain possible occupancy until reviewed", () => {
  let s = initialState();
  s = act(s, "availability.import", {
    entries: [entry("one")],
    coverage: {
      readAt: new Date(now).toISOString(),
      threads: 1,
      messages: 1,
      scope: "Test fixture",
    },
  });
  assert.equal(s.availability.gapPolicy.enabled, false);
  assert.equal(
    occupancyDays(s.availability, "2026-10-01", "2026-10-01")[0].confirmed,
    0,
  );
  assert.equal(
    occupancyDays(s.availability, "2026-10-01", "2026-10-01")[0].possible,
    1,
  );
  assert.throws(
    () =>
      act(s, "availability.review", {
        id: "one",
        status: "confirmed",
        precision: "approximate",
        people: 1,
        start: "2026-10-01",
        end: "2026-10-31",
      }),
    /exacte/,
  );
  s = act(s, "availability.review", {
    id: "one",
    status: "confirmed",
    precision: "day",
    people: 1,
    start: "2026-10-01",
    end: "2026-10-31",
  });
  assert.equal(
    occupancyDays(s.availability, "2026-10-01", "2026-10-01")[0].confirmed,
    1,
  );
  assert.equal(validateBackup(s).availability.entries[0].status, "confirmed");
  s = act(s, "availability.import", {
    entries: [entry("one")],
    coverage: null,
  });
  assert.equal(
    s.availability.entries[0].status,
    "confirmed",
    "re-import preserves reviewed corrections",
  );
});
test("re-import preserves the user's gap toggle but expires its review", () => {
  let s = planned();
  s.availability.gapPolicy.minimumDays = 10;
  s = act(s, "availability.import", {
    entries: [entry("one")],
    coverage: {
      readAt: new Date(now).toISOString(),
      threads: 1,
      messages: 1,
      scope: "Test fixture",
    },
  });
  assert.equal(s.availability.gapPolicy.enabled, true);
  assert.equal(s.availability.gapPolicy.reviewedThrough, "");
  assert.equal(s.availability.gapPolicy.reviewedAt, "");
  assert.match(
    outreachGapReason(s, entry("candidate"), now),
    /Controleer de bezetting/,
  );
});
test("gap control reserves tentative arrivals, checks consecutive days, horizon and fresh completeness", () => {
  const s = planned(),
    candidate = { start: "2026-10-01", end: "2026-10-31" };
  assert.equal(outreachGapReason(s, candidate, now), "");
  s.availability.entries = [entry("a"), entry("b", "tentative")];
  assert.match(outreachGapReason(s, candidate, now), /Geen passend/);
  assert.equal(
    outreachGapReason(s, { start: "2026-11-01", end: "2026-11-30" }, now),
    "",
    "can prepare for a future gap",
  );
  s.availability.entries = [
    entry("a", "confirmed", { people: 2, precision: "day", reviewed: true }),
  ];
  assert.match(outreachGapReason(s, candidate, now), /Geen passend/);
  s.availability.entries = [];
  assert.match(
    outreachGapReason(s, { start: "2026-10-01", end: "2026-10-13" }, now),
    /Geen passend/,
  );
  s.availability.gapPolicy.lookAheadDays = 14;
  assert.match(
    outreachGapReason(s, { start: "2026-11-01", end: "2026-11-30" }, now),
    /Geen passend/,
  );
  s.availability.gapPolicy.reviewedAt = "2026-09-20T10:00:00Z";
  assert.match(outreachGapReason(s, candidate, now), /opnieuw/);
});
test("undated active requests hold outreach; edits pause and invalidate approval basis and completeness", () => {
  let s = planned();
  s.availability.entries = [
    entry("unclear", "unknown", { start: "", end: "" }),
  ];
  assert.match(outreachGapReason(s, {}, now), /zonder betrouwbare datums/);
  s.candidates = [
    { id: "c", url: "https://www.workaway.info/en/workawayer/fixture" },
  ];
  s.messages = [
    {
      id: "m",
      candidateId: "c",
      body: "Test personalized invitation",
      kind: "initial",
    },
  ];
  const basis = approvalBasis(s, "m");
  s.automation.active = true;
  s = act(s, "availability.capacity", { capacity: 3 });
  assert.equal(s.automation.active, false);
  assert.equal(s.availability.gapPolicy.reviewedThrough, "");
  assert.notEqual(approvalBasis(s, "m"), basis);
  assert.throws(
    () =>
      act(s, "availability.gaps", {
        enabled: true,
        reviewedThrough: "2026-12-31",
        lookAheadDays: 90,
        minimumDays: 14,
      }),
    /Controleer/,
  );
});
test("manual off-platform bookings can occupy multiple places and closed requests release capacity", () => {
  let s = initialState();
  s = act(s, "availability.add", {
    name: "Fictional couple",
    start: "2026-11-01",
    end: "2026-11-30",
    people: 2,
    status: "confirmed",
    precision: "day",
  });
  assert.equal(
    occupancyDays(s.availability, "2026-11-01", "2026-11-01")[0].remaining,
    0,
  );
  s = act(s, "availability.review", {
    id: s.availability.entries[0].id,
    start: "2026-11-01",
    end: "2026-11-30",
    people: 2,
    status: "closed",
    precision: "day",
  });
  assert.equal(
    occupancyDays(s.availability, "2026-11-01", "2026-11-01")[0].remaining,
    2,
  );
});
