import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  applyAction,
  match,
  followUps,
  profileUrl,
  calendar,
} from "../server/domain.mjs";

const host = {
  name: "Host test",
  location: "Netherlands",
  description: "We grow vegetables and share meals.",
  skills: ["gardening", "cooking"],
  languages: ["english"],
  start: "2026-10-01",
  end: "2026-10-31",
};
const traveler = {
  name: "Traveler test",
  location: "Netherlands",
  description: "I enjoy growing food.",
  skills: ["gardening"],
  languages: ["english"],
  start: "2026-10-10",
  end: "2026-11-01",
  url: "https://www.workaway.info/en/workawayer/test-person",
};
function workspace() {
  let s = applyAction(initialState(), { type: "profile.save", payload: host });
  return applyAction(s, { type: "candidate.save", payload: traveler });
}
const act = (s, type, payload, now) => applyAction(s, { type, payload }, now);
function withDraft() {
  let s = workspace();
  return act(s, "message.draft", {
    candidateId: s.candidates[0].id,
    language: "en",
    personalNote: "I enjoyed reading about your vegetable garden.",
  });
}
test("match uses exact skill overlap and date intersection, with explicit missing coverage", () => {
  let s = workspace(),
    m = match(s.profile, s.candidates[0]);
  assert.equal(m.score, 70);
  assert.equal(m.coverage, 100);
  assert.equal(m.start, "2026-10-10");
  assert.equal(m.end, "2026-10-31");
  m = match(s.profile, {
    ...s.candidates[0],
    start: "",
    end: "",
    languages: [],
  });
  assert.equal(m.score, 30);
  assert.equal(m.coverage, 60);
  assert.deepEqual(m.unknown, ["Language", "Availability"]);
});
test("invalid dates, partial dates, reversed ranges and external URLs are rejected", () => {
  for (const change of [
    { start: "2026-02-30" },
    { end: "" },
    { end: "2026-09-01" },
    { url: "javascript:alert(1)" },
    { url: "https://workaway.info.evil.test/profile" },
    { url: "https://user:pass@workaway.info/profile" },
  ])
    assert.throws(() =>
      act(initialState(), "profile.save", { ...host, ...change }),
    );
  assert.equal(
    profileUrl("https://workaway.info/en/host/123/?tracking=foo#top"),
    "https://www.workaway.info/en/host/123",
  );
});
test("personalized draft includes real source fields, duplicate outreach is blocked", () => {
  let s = withDraft();
  assert.match(s.messages[0].body, /vegetable garden/);
  assert.match(s.messages[0].body, /2026-10-10 to 2026-10-31/);
  assert.equal(s.messages[0].status, "draft");
  assert.throws(
    () =>
      act(s, "message.draft", {
        candidateId: s.candidates[0].id,
        language: "en",
        personalNote: "A different personal note.",
      }),
    /already exists/,
  );
});
test("date conflict blocks drafting and a missing personal note fails", () => {
  let s = workspace();
  s.candidates[0].start = "2026-12-01";
  s.candidates[0].end = "2026-12-10";
  assert.throws(
    () =>
      act(s, "message.draft", {
        candidateId: s.candidates[0].id,
        language: "en",
        personalNote: "A personal note.",
      }),
    /does not overlap/,
  );
  s = workspace();
  assert.throws(
    () =>
      act(s, "message.draft", {
        candidateId: s.candidates[0].id,
        language: "en",
        personalNote: "",
      }),
    /personal note/,
  );
});
test("copy/draft never means sent; explicit manual confirmation is required", () => {
  const s = withDraft(),
    m = s.messages[0];
  assert.equal(followUps(s).length, 0);
  assert.throws(
    () => act(s, "message.sent", { id: m.id, body: m.body }),
    /Confirm/,
  );
  const sent = act(
    s,
    "message.sent",
    { id: m.id, body: m.body, confirmed: true },
    "2026-09-01T12:00:00.000Z",
  );
  assert.equal(sent.candidates[0].status, "contacted");
  assert.equal(sent.messages[0].sentAt, "2026-09-01T12:00:00.000Z");
  assert.throws(
    () =>
      act(sent, "message.sent", { id: m.id, body: m.body, confirmed: true }),
    /existing draft/,
  );
});
test("followups observe delay, limit and reply suppression", () => {
  let s = withDraft();
  const m = s.messages[0],
    id = s.candidates[0].id;
  s = act(
    s,
    "message.sent",
    { id: m.id, body: m.body, confirmed: true },
    "2026-09-01T12:00:00.000Z",
  );
  assert.equal(followUps(s, Date.parse("2026-09-08T11:59:59Z"))[0].due, false);
  assert.throws(
    () =>
      act(
        s,
        "message.followup",
        { candidateId: id, body: "Just checking whether these dates work." },
        "2026-09-02T12:00:00.000Z",
      ),
    /No follow-up/,
  );
  s = act(
    s,
    "message.followup",
    {
      candidateId: id,
      body: "Just checking whether these dates work for you.",
    },
    "2026-09-08T12:00:00.000Z",
  );
  const reply = act(s, "candidate.status", {
    candidateId: id,
    status: "replied",
  });
  assert.equal(followUps(reply).length, 0);
  assert.equal(reply.messages[1].status, "cancelled");
  const blocked = act(s, "candidate.status", {
    candidateId: id,
    status: "do-not-contact",
  });
  assert.equal(followUps(blocked).length, 0);
  assert.equal(blocked.messages[1].status, "cancelled");
  s = act(
    s,
    "message.sent",
    { id: s.messages[1].id, body: s.messages[1].body, confirmed: true },
    "2026-09-08T12:00:00.000Z",
  );
  assert.equal(followUps(s, Date.parse("2026-10-01")).length, 0);
});
test("templates validate variables and preserve individual personalization", () => {
  const s = workspace();
  assert.throws(
    () =>
      act(s, "template.save", {
        language: "en",
        body: "Hello {unknown}, {personalNote}",
      }),
    /Unknown template/,
  );
  assert.throws(
    () =>
      act(s, "template.save", {
        language: "en",
        body: "A template without a personal note.",
      }),
    /personalNote/,
  );
});
test("imports are atomic, additive and never import messaging claims", () => {
  const s = withDraft();
  let result = act(s, "backup.merge", {
    backup: {
      version: 1,
      candidates: [
        s.candidates[0],
        {
          ...traveler,
          url: "https://www.workaway.info/en/workawayer/another",
          status: "contacted",
        },
      ],
    },
  });
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[1].status, "new");
  assert.deepEqual(result.messages, s.messages);
  assert.throws(() =>
    act(s, "backup.merge", {
      backup: {
        version: 1,
        candidates: [
          { ...traveler, url: "https://www.workaway.info/en/workawayer/new" },
          { ...traveler, name: "" },
        ],
      },
    }),
  );
  assert.equal(s.candidates.length, 1);
});
test("calendar exports UTC and escapes content without injected events", () => {
  let s = workspace();
  s = act(s, "event.save", {
    candidateId: s.candidates[0].id,
    title: "Hello; world\nBEGIN:VEVENT",
    start: "2026-10-05T14:00:00+02:00",
    duration: 30,
  });
  const output = calendar(s);
  assert.match(output, /DTSTART:20261005T120000Z/);
  assert.match(output, /DTEND:20261005T123000Z/);
  assert.equal(output.split("\r\nBEGIN:VEVENT").length, 2);
  assert.match(output, /Hello\\; world\\nBEGIN:VEVENT/);
});
test("repeated imports of profiles without URLs are idempotent", () => {
  const backup = {
    version: 1,
    candidates: [{ ...traveler, id: "stable-import-id", url: "" }],
  };
  const first = act(initialState(), "backup.merge", { backup });
  const again = act(first, "backup.merge", { backup });
  assert.equal(again.candidates.length, 1);
  assert.equal(again.candidates[0].id, "stable-import-id");
});
