import test from "node:test";
import assert from "node:assert/strict";
import { match, suggestProfile } from "../server/matching.mjs";
import {
  initialState,
  applyAction,
  validateBackup,
  calendar,
  followUps,
} from "../server/domain.mjs";
const now = "2026-09-12T12:00:00.000Z";
const act = (s, type, payload) => applyAction(s, { type, payload }, now);
const host = {
  name: "Host",
  location: "NL",
  description: "Een moestuin.",
  skills: ["tuinieren"],
  languages: ["Engels"],
  periods: [
    { start: "2026-10-01", end: "2026-10-07" },
    { start: "2026-11-01", end: "2026-11-30" },
  ],
  requiredSkills: ["gardening"],
  minOverlapDays: 10,
};
const candidate = {
  name: "Reiziger",
  skills: ["gardening"],
  languages: ["english"],
  periods: [
    { start: "2026-10-01", end: "2026-10-07" },
    { start: "2026-11-10", end: "2026-11-25" },
  ],
};
function workspace() {
  return act(
    act(initialState(), "profile.save", host),
    "candidate.save",
    candidate,
  );
}

test("synonyms and multiple periods respect consecutive-day requirements", () => {
  const s = workspace(),
    m = match(s.profile, s.candidates[0]);
  assert.equal(m.score, 100);
  assert.equal(m.longestDays, 16);
  assert.equal(m.start, "2026-11-10");
  assert.equal(m.overlaps.length, 2);
  assert.equal(m.eligible, true);
  const short = match({ ...s.profile, minOverlapDays: 20 }, s.candidates[0]);
  assert.equal(short.eligible, false);
  assert.equal(short.conflict, true);
  const unknown = match(s.profile, { ...s.candidates[0], skills: [] });
  assert.equal(unknown.unconfirmed.length, 1);
  assert.equal(unknown.eligible, false);
});
test("overlapping ranges are merged without double counting", () => {
  const p = {
    skills: [],
    languages: [],
    periods: [
      { start: "2026-10-01", end: "2026-10-10" },
      { start: "2026-10-05", end: "2026-10-15" },
    ],
  };
  const m = match(p, p);
  assert.equal(m.longestDays, 15);
  assert.equal(m.overlaps.length, 1);
});
test("profile extraction returns evidence, not silent assignments; negation and ambiguous dates stay unconfirmed", () => {
  const result = suggestProfile(
    "Naam: Noor\nLocatie: Nederland\nIk kan tuinieren en koken.\nTalen: Engels\nBeschikbaar 12-10-2026 tot 31-10-2026\nIk spreek geen Duits.\n2026-02-30 tot 2026-03-10\nOktober tot november",
  );
  assert.equal(result.proposals.find((p) => p.field === "name").value, "Noor");
  assert.equal(
    result.proposals.find((p) => p.field === "periods").value.start,
    "2026-10-12",
  );
  assert(
    result.proposals.some(
      (p) => p.value === "gardening" && p.evidence.includes("tuinieren"),
    ),
  );
  assert(!result.proposals.some((p) => p.value === "german"));
  assert.equal(result.warnings.length, 2);
});
test("historic outgoing/reply chronology preserves suppression and stops pending drafts", () => {
  let s = workspace(),
    id = s.candidates[0].id;
  s = act(s, "journal.add", {
    candidateId: id,
    kind: "outgoing",
    body: "Eerder zelf verzonden.",
    confirmed: true,
    at: "2026-09-03T12:00:00Z",
  });
  assert.equal(s.candidates[0].status, "contacted");
  assert.equal(followUps(s, Date.parse(now))[0].due, true);
  s = act(s, "journal.add", {
    candidateId: id,
    kind: "reply",
    body: "Een oudere reactie.",
    at: "2026-09-02T12:00:00Z",
  });
  assert.equal(s.candidates[0].status, "contacted");
  s = act(s, "message.followup", {
    candidateId: id,
    body: "Een persoonlijk vervolg over onze moestuin.",
  });
  s = act(s, "journal.add", {
    candidateId: id,
    kind: "reply",
    body: "Bedankt voor je uitnodiging.",
    at: "2026-09-04T12:00:00Z",
  });
  assert.equal(s.candidates[0].status, "replied");
  assert.equal(s.messages.at(-1).status, "cancelled");
  assert.equal(followUps(s).length, 0);
  s = act(s, "candidate.status", { candidateId: id, status: "do-not-contact" });
  s = act(s, "journal.add", {
    candidateId: id,
    kind: "outgoing",
    body: "Nog een historisch bericht.",
    confirmed: true,
    at: "2026-09-05T12:00:00Z",
  });
  assert.equal(s.candidates[0].status, "do-not-contact");
  assert.throws(() =>
    act(s, "journal.add", {
      candidateId: id,
      kind: "reply",
      body: "Toekomst",
      at: "2099-01-01T00:00:00Z",
    }),
  );
});
test("calendar changes retain UID and publish cancellation with new sequence", () => {
  let s = workspace(),
    candidateId = s.candidates[0].id;
  s = act(s, "event.save", {
    candidateId,
    title: "Gesprek",
    start: "2026-10-01T12:00:00Z",
    duration: 30,
  });
  const id = s.events[0].id;
  s = act(s, "event.save", {
    id,
    candidateId,
    title: "Gewijzigd",
    start: "2026-10-02T12:00:00Z",
    duration: 45,
  });
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].id, id);
  assert.equal(s.events[0].sequence, 1);
  s = act(s, "event.cancel", { id });
  assert.match(calendar(s), /STATUS:CANCELLED/);
  assert.match(calendar(s), /SEQUENCE:2/);
});
test("full backups preserve history and reject broken links, malformed notes and invalid tasks", () => {
  let s = workspace();
  s = act(s, "journal.add", {
    candidateId: s.candidates[0].id,
    kind: "task",
    body: "Gesprek plannen",
    at: now,
    dueAt: "2026-09-13T10:00:00Z",
  });
  const restored = validateBackup(s);
  assert.deepEqual(restored.journal, s.journal);
  assert.equal(restored.candidates[0].name, "Reiziger");
  for (const change of [
    (x) => (x.journal[0].candidateId = "unknown"),
    (x) => (x.candidates[0].notes = {}),
    (x) => delete x.journal[0].dueAt,
    (x) => (x.revision = "bad"),
  ]) {
    const bad = structuredClone(s);
    change(bad);
    assert.throws(() => validateBackup(bad));
  }
  assert.deepEqual(validateBackup(initialState()), initialState());
});
