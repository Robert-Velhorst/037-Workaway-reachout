import { match, normalizeTags, vocabulary } from "./matching.mjs";
import {
  availabilityState,
  validateAvailability,
  applyAvailability,
  gapPolicy,
} from "./availability.mjs";
import {
  discoveryState,
  validateDiscovery,
  invalidateDiscovery,
} from "./discovery.mjs";
import {
  automationState,
  applyAutomation,
  invalidateApprovals,
  validateAutomation,
} from "./automation.mjs";
export { match } from "./matching.mjs";
const randomUUID = () => globalThis.crypto.randomUUID();

export const templates = {
  en: "Hi {name},\n\nI’m {hostName}, based in {location}. {project}\n\nYour experience with {sharedSkills} caught my attention. {personalNote}\n\n{availability}\n\nWould you be interested in talking about a possible exchange?\n\nBest wishes,\n{hostName}",
  nl: "Hoi {name},\n\nIk ben {hostName} en woon in {location}. {project}\n\nJe ervaring met {sharedSkills} viel me op. {personalNote}\n\n{availability}\n\nLijkt het je leuk om een mogelijke uitwisseling te bespreken?\n\nHartelijke groet,\n{hostName}",
};
export const blankProfile = {
  name: "",
  url: "",
  location: "",
  description: "",
  skills: [],
  languages: [],
  start: "",
  end: "",
  sourceText: "",
};
export const initialState = () => ({
  version: 1,
  revision: 0,
  profile: { ...blankProfile },
  candidates: [],
  messages: [],
  events: [],
  templates: { ...templates },
  settings: { followUpDays: 7, maxFollowUps: 1 },
  audit: [],
  journal: [],
  automation: automationState(),
  discovery: discoveryState(),
  availability: availabilityState(),
});
export function migrateState(input) {
  const state = structuredClone(input);
  state.journal ||= [];
  state.automation ||= automationState();
  state.discovery ||= discoveryState();
  state.availability ||= availabilityState();
  state.availability.gapPolicy ||= gapPolicy();
  return state;
}
function validatePeriods(input = []) {
  assert(
    Array.isArray(input) && input.length <= 30,
    "Gebruik maximaal 30 beschikbaarheidsperiodes.",
  );
  return input.map((p) => {
    const start = date(p.start),
      end = date(p.end);
    assert(
      start && end && start <= end,
      "Vul een geldige begin- en einddatum in voor iedere periode.",
    );
    return { start, end };
  });
}
function timestamp(value, message = "Ongeldige datum en tijd.") {
  assert(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        value,
      ),
    message,
  );
  date(value.slice(0, 10));
  assert(Number.isFinite(Date.parse(value)), message);
  return new Date(value).toISOString();
}
export function validateBackup(input) {
  assert(input?.version === 1, "Onbekende back-upversie.");
  assert(
    Number.isSafeInteger(input.revision) && input.revision >= 0,
    "Ongeldige back-uprevisie.",
  );
  for (const key of ["candidates", "messages", "events", "audit"])
    assert(
      Array.isArray(input[key]) && input[key].length <= 50000,
      "Ongeldige back-up: " + key,
    );
  const s = migrateState(input);
  assert(
    Array.isArray(s.journal) && s.journal.length <= 50000,
    "Ongeldig dossier.",
  );
  if (s.profile?.name)
    s.profile = { ...s.profile, ...validateProfile(s.profile) };
  else
    assert(
      s.profile &&
        Object.keys(s.profile).length === Object.keys(blankProfile).length &&
        Object.entries(blankProfile).every(
          ([key, value]) =>
            JSON.stringify(s.profile[key]) === JSON.stringify(value),
        ),
      "Ongeldig leeg profiel.",
    );
  const ids = new Set();
  for (const c of s.candidates) {
    Object.assign(c, validateProfile(c));
    c.notes = str(c.notes || "");
    c.createdAt = timestamp(c.createdAt, "Ongeldige aanmaakdatum.");
    if (c.updatedAt)
      c.updatedAt = timestamp(c.updatedAt, "Ongeldige wijzigingsdatum.");
    assert(
      typeof c.id === "string" && /^[\w-]{1,100}$/.test(c.id) && !ids.has(c.id),
      "Dubbele of ongeldige kandidaat.",
    );
    ids.add(c.id);
    assert(
      [
        "new",
        "shortlisted",
        "contacted",
        "replied",
        "declined",
        "do-not-contact",
        "archived",
      ].includes(c.status),
      "Ongeldige kandidaatstatus.",
    );
  }
  for (const a of s.audit) {
    str(a.id, 100);
    str(a.type, 100);
    a.at = timestamp(a.at, "Ongeldige activiteit.");
  }
  for (const key of ["messages", "events", "journal"]) {
    const itemIds = new Set();
    for (const item of s[key]) {
      assert(
        typeof item.id === "string" &&
          /^[\w-]{1,100}$/.test(item.id) &&
          !itemIds.has(item.id) &&
          ids.has(item.candidateId),
        "Ongeldige dossierverwijzing.",
      );
      itemIds.add(item.id);
      item.createdAt = timestamp(item.createdAt, "Ongeldige vastlegdatum.");
      if (key === "messages") {
        str(item.body);
        assert(
          ["draft", "sent", "cancelled"].includes(item.status) &&
            ["initial", "followup", "historical"].includes(item.kind),
          "Ongeldig bericht.",
        );
        if (item.status === "sent")
          item.sentAt = timestamp(item.sentAt, "Ongeldige verzenddatum.");
      }
      if (key === "events") {
        str(item.title, 200);
        assert(
          Number.isInteger(item.duration) &&
            item.duration >= 5 &&
            item.duration <= 480,
          "Ongeldige afspraak.",
        );
        item.start = timestamp(item.start, "Ongeldige afspraak.");
        assert(item.title.trim(), "Afspraaktitel ontbreekt.");
        assert(
          !item.status || ["planned", "cancelled"].includes(item.status),
          "Ongeldige afspraakstatus.",
        );
        assert(
          item.sequence === undefined ||
            (Number.isSafeInteger(item.sequence) && item.sequence >= 0),
          "Ongeldige afspraakversie.",
        );
        if (item.updatedAt)
          item.updatedAt = timestamp(
            item.updatedAt,
            "Ongeldige wijzigingsdatum.",
          );
      }
      if (key === "journal") {
        str(item.body);
        assert(
          ["reply", "note", "task", "status"].includes(item.kind),
          "Ongeldige dossierregel.",
        );
        item.at = timestamp(item.at, "Ongeldige dossierregel.");
        if (item.dueAt)
          item.dueAt = timestamp(item.dueAt, "Ongeldige actiedatum.");
        if (item.kind === "task")
          item.dueAt = timestamp(item.dueAt, "Actiedatum ontbreekt.");
        if (item.completedAt)
          item.completedAt = timestamp(
            item.completedAt,
            "Ongeldige afrondingsdatum.",
          );
      }
    }
  }
  assert(s.settings && s.templates, "Instellingen ontbreken.");
  applyAction(initialState(), { type: "settings.save", payload: s.settings });
  for (const language of ["en", "nl"])
    applyAction(initialState(), {
      type: "template.save",
      payload: { language, body: s.templates[language] },
    });
  validateAutomation(s);
  validateDiscovery(s);
  validateAvailability(s);
  return s;
}
function assert(ok, message) {
  if (!ok) throw new Error(message);
}
const str = (x, max = 10000) => {
  assert(typeof x === "string" && x.length <= max, "Invalid or oversized text");
  return x.trim();
};
export const tags = (value) =>
  [
    ...new Set(
      (Array.isArray(value) ? value : str(value || "").split(","))
        .map((x) => str(x, 100).toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 40);
export function profileUrl(value) {
  if (!value) return "";
  const url = new URL(str(value, 1000));
  assert(
    url.protocol === "https:" &&
      ["workaway.info", "www.workaway.info"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port,
    "Use an HTTPS workaway.info profile link",
  );
  url.search = "";
  url.hash = "";
  url.hostname = "www.workaway.info";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.href;
}
function date(value) {
  value = str(value || "", 10);
  assert(
    !value ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value),
    "Invalid date",
  );
  return value;
}
export function validateProfile(input) {
  assert(input && typeof input === "object", "Profile is required");
  const p = {
    name: str(input.name, 120),
    url: profileUrl(input.url),
    location: str(input.location || "", 200),
    description: str(input.description || ""),
    skills: normalizeTags(tags(input.skills)),
    requiredSkills: normalizeTags(tags(input.requiredSkills)),
    requiredLanguages: normalizeTags(tags(input.requiredLanguages)),
    minOverlapDays: Number(input.minOverlapDays ?? 1),
    periods: validatePeriods(input.periods),
    languages: normalizeTags(tags(input.languages)),
    start: date(input.start),
    end: date(input.end),
    sourceText: str(input.sourceText || "", 50000),
  };
  assert(p.name, "Name is required");
  assert(
    Number.isInteger(p.minOverlapDays) &&
      p.minOverlapDays >= 1 &&
      p.minOverlapDays <= 365,
    "Gebruik 1–365 dagen voor de minimale verblijfsduur.",
  );
  assert(
    Boolean(p.start) === Boolean(p.end),
    "Provide both availability dates or leave both empty",
  );
  assert(!p.start || p.end >= p.start, "End date must be after start date");
  return p;
}
export function draft(state, candidate, language, personalNote) {
  assert(["en", "nl"].includes(language), "Unsupported language");
  const p = state.profile;
  assert(
    p.name && p.location && p.description,
    "Complete your name, location and project description first",
  );
  const note = str(personalNote, 3000);
  assert(
    note.length >= 10,
    "Add a specific personal note of at least 10 characters",
  );
  const m = match(p, candidate);
  assert(
    !m.conflict,
    "Availability does not overlap; update the dates before drafting",
  );
  assert(
    m.eligible,
    "Controleer eerst de ontbrekende of onbevestigde harde eisen.",
  );
  const values = {
    name: candidate.name,
    hostName: p.name,
    location: p.location,
    project: p.description,
    sharedSkills:
      m.sharedSkills
        .map((s) => (language === "nl" ? vocabulary[s]?.[1] || s : s))
        .join(", ") ||
      (language === "nl"
        ? "de activiteiten op je profiel"
        : "the activities on your profile"),
    personalNote: note,
    availability: m.overlap
      ? language === "nl"
        ? `Onze data overlappen van ${m.start} tot ${m.end}.`
        : `Our dates overlap from ${m.start} to ${m.end}.`
      : language === "nl"
        ? "Welke data zouden voor jou passen?"
        : "Which dates would work for you?",
  };
  return state.templates[language].replace(/\{(\w+)\}/g, (_, key) => {
    assert(Object.hasOwn(values, key), `Unknown template field: ${key}`);
    return values[key];
  });
}
const DAY = 86400000;
export function followUps(state, now = Date.now()) {
  return state.candidates
    .filter((c) => c.status === "contacted")
    .flatMap((c) => {
      const sent = state.messages
        .filter((m) => m.candidateId === c.id && m.status === "sent")
        .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
      const last = sent.at(-1);
      if (
        !last ||
        hasCurrentReply(state, c.id, last.sentAt) ||
        sent.filter((m) => m.kind === "followup").length >=
          state.settings.maxFollowUps
      )
        return [];
      const dueAt = new Date(
        Date.parse(last.sentAt) + state.settings.followUpDays * DAY,
      ).toISOString();
      return [{ candidateId: c.id, dueAt, due: Date.parse(dueAt) <= now }];
    });
}
function hasCurrentReply(state, candidateId, sentAt) {
  return (state.journal || []).some(
    (j) =>
      j.candidateId === candidateId &&
      j.kind === "reply" &&
      Date.parse(j.at) >= Math.floor(Date.parse(sentAt) / 60000) * 60000,
  );
}
export function applyAction(current, action, now = new Date().toISOString()) {
  const s = migrateState(current);
  const p = action.payload || {};
  const candidate = () => {
    const c = s.candidates.find((c) => c.id === p.candidateId);
    assert(c, "Candidate not found");
    return c;
  };
  switch (action.type) {
    case "discovery.pause": {
      if (s.discovery.run) {
        s.discovery.run.status = "paused";
        s.discovery.run.reason = "Door jou gepauzeerd.";
      }
      break;
    }
    case "discovery.dismiss": {
      const result = s.discovery.results.find((x) => x.url === p.url);
      assert(result, "Zoekprofiel ontbreekt.");
      result.status = "dismissed";
      break;
    }
    case "discovery.add": {
      const result = s.discovery.results.find((x) => x.url === p.url);
      assert(
        result && result.status === "pending",
        "Zoekprofiel ontbreekt of is al beoordeeld.",
      );
      if (!s.candidates.some((c) => c.url === result.url))
        s.candidates.push({
          ...validateProfile({
            name: result.name,
            url: result.url,
            description: result.description,
            location: "Reisplan: Nederland",
            sourceText: `Workaway-zoekkaart, gelezen ${result.seenAt}\n${result.travelLabel}\nMogelijke overlap: ${result.overlapMonths.join(", ")}\nReismaanden zijn geen bevestigde verblijfsdatums.\n${result.description}`,
          }),
          id: randomUUID(),
          status: "new",
          notes:
            "Exacte verblijfsdatums en persoonlijke aansluiting nog controleren.",
          createdAt: now,
          updatedAt: now,
        });
      result.status = "added";
      break;
    }
    case "journal.add": {
      const c = candidate();
      assert(
        ["reply", "note", "task", "outgoing"].includes(p.kind),
        "Kies een geldig contacttype.",
      );
      const body = str(p.body),
        at = timestamp(p.at);
      assert(
        body && Date.parse(at) <= Date.parse(now),
        "Een contactmoment moet tekst hebben en mag niet in de toekomst liggen.",
      );
      if (p.kind === "outgoing") {
        assert(
          p.confirmed === true,
          "Bevestig dat je dit bericht zelf hebt verzonden.",
        );
        s.messages.push({
          id: randomUUID(),
          candidateId: c.id,
          kind: "historical",
          status: "sent",
          body,
          sentAt: at,
          createdAt: now,
        });
        const latestReply = s.journal
          .filter((j) => j.candidateId === c.id && j.kind === "reply")
          .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
          .at(-1);
        if (
          ["new", "shortlisted", "contacted"].includes(c.status) &&
          (!latestReply || Date.parse(at) > Date.parse(latestReply.at))
        )
          c.status = "contacted";
      } else {
        const dueAt = p.kind === "task" ? timestamp(p.dueAt) : undefined;
        s.journal.push({
          id: randomUUID(),
          candidateId: c.id,
          kind: p.kind,
          body,
          at,
          dueAt,
          createdAt: now,
        });
        const lastSent = s.messages
          .filter((m) => m.candidateId === c.id && m.status === "sent")
          .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))
          .at(-1);
        // A manually recorded minute has no trustworthy sub-minute ordering.
        // Suppress outreach when a reply is recorded in the same minute.
        if (
          p.kind === "reply" &&
          (!lastSent ||
            Date.parse(at) >=
              Math.floor(Date.parse(lastSent.sentAt) / 60000) * 60000)
        ) {
          if (!["declined", "do-not-contact", "archived"].includes(c.status))
            c.status = "replied";
          s.messages
            .filter((m) => m.candidateId === c.id && m.status === "draft")
            .forEach((m) => (m.status = "cancelled"));
        }
      }
      break;
    }
    case "journal.complete": {
      const entry = s.journal.find((j) => j.id === p.id && j.kind === "task");
      assert(entry, "Actie niet gevonden.");
      entry.completedAt = now;
      break;
    }
    case "event.cancel": {
      const e = s.events.find((e) => e.id === p.id);
      assert(e, "Afspraak niet gevonden.");
      e.status = "cancelled";
      e.updatedAt = now;
      e.sequence = (e.sequence || 0) + 1;
      break;
    }
    case "profile.save":
      s.profile = validateProfile(p);
      break;
    case "candidate.save": {
      const clean = validateProfile(p);
      const old = p.id ? s.candidates.find((c) => c.id === p.id) : null;
      assert(!p.id || old, "Candidate not found");
      assert(
        !clean.url ||
          !s.candidates.some((c) => c.id !== p.id && c.url === clean.url),
        "This profile is already saved",
      );
      const item = {
        ...old,
        ...clean,
        id: old?.id || randomUUID(),
        status: old?.status || "new",
        notes: str(p.notes || "", 10000),
        createdAt: old?.createdAt || now,
        updatedAt: now,
      };
      if (old) s.candidates[s.candidates.indexOf(old)] = item;
      else s.candidates.push(item);
      break;
    }
    case "candidate.status": {
      assert(
        [
          "new",
          "shortlisted",
          "contacted",
          "replied",
          "declined",
          "do-not-contact",
          "archived",
        ].includes(p.status),
        "Invalid status",
      );
      const c = candidate();
      assert(
        p.status !== "contacted" ||
          s.messages.some((m) => m.candidateId === c.id && m.status === "sent"),
        "Record a sent message first",
      );
      c.status = p.status;
      s.journal.push({
        id: randomUUID(),
        candidateId: c.id,
        kind: "status",
        body: p.status,
        at: now,
        createdAt: now,
      });
      if (
        ["replied", "declined", "do-not-contact", "archived"].includes(p.status)
      )
        s.messages
          .filter((m) => m.candidateId === c.id && m.status === "draft")
          .forEach((m) => (m.status = "cancelled"));
      break;
    }
    case "message.draft": {
      const c = candidate();
      assert(
        ["new", "shortlisted"].includes(c.status),
        "Initial outreach is only available for new or shortlisted candidates",
      );
      assert(
        !s.messages.some(
          (m) => m.candidateId === c.id && ["draft", "sent"].includes(m.status),
        ),
        "An outreach message already exists",
      );
      s.messages.push({
        id: randomUUID(),
        candidateId: c.id,
        kind: "initial",
        language: p.language,
        status: "draft",
        body: draft(s, c, p.language, p.personalNote),
        createdAt: now,
      });
      break;
    }
    case "message.followup": {
      const c = candidate();
      assert(
        followUps(s, Date.parse(now)).some(
          (f) => f.candidateId === c.id && f.due,
        ),
        "No follow-up is due",
      );
      assert(
        !s.messages.some((m) => m.candidateId === c.id && m.status === "draft"),
        "A draft already exists",
      );
      const body = str(p.body, 10000);
      assert(
        body.length >= 20,
        "Write a personal follow-up of at least 20 characters",
      );
      s.messages.push({
        id: randomUUID(),
        candidateId: c.id,
        kind: "followup",
        status: "draft",
        body,
        createdAt: now,
      });
      break;
    }
    case "message.save":
    case "message.sent":
    case "message.cancel": {
      const m = s.messages.find((m) => m.id === p.id);
      assert(
        !s.automation.jobs.some(
          (j) =>
            j.messageId === p.id &&
            ["attempted", "uncertain"].includes(j.status),
        ),
        "Controleer eerst de lopende of onzekere verzending. Het bericht blijft behouden.",
      );
      assert(
        m && m.status === "draft",
        "Only an existing draft can be changed",
      );
      if (action.type === "message.cancel") {
        m.status = "cancelled";
        break;
      }
      const c = s.candidates.find((c) => c.id === m.candidateId);
      assert(
        !["replied", "declined", "do-not-contact", "archived"].includes(
          c.status,
        ),
        "Outreach is stopped for this candidate",
      );
      m.body = str(p.body, 10000);
      assert(
        m.body.length >= 20,
        "Message must contain at least 20 characters",
      );
      assert(!/\{\w+\}/.test(m.body), "Resolve all template fields first");
      if (action.type === "message.sent") {
        assert(
          p.confirmed === true,
          "Confirm that you sent this message in Workaway",
        );
        if (m.kind === "followup")
          assert(
            followUps(s, Date.parse(now)).some(
              (f) => f.candidateId === c.id && f.due,
            ),
            "Follow-up is no longer due",
          );
        m.status = "sent";
        m.sentAt = now;
        c.status = "contacted";
      }
      break;
    }
    case "template.save": {
      assert(["en", "nl"].includes(p.language), "Unsupported language");
      const body = str(p.body, 10000);
      assert(body.length >= 20, "Template is too short");
      const allowed = [
        "name",
        "hostName",
        "location",
        "project",
        "sharedSkills",
        "personalNote",
        "availability",
      ];
      for (const match of body.matchAll(/\{(\w+)\}/g))
        assert(
          allowed.includes(match[1]),
          `Unknown template field: ${match[1]}`,
        );
      assert(
        body.includes("{personalNote}"),
        "Include {personalNote} for individual personalization",
      );
      s.templates[p.language] = body;
      break;
    }
    case "settings.save":
      assert(
        Number.isInteger(p.followUpDays) &&
          p.followUpDays >= 1 &&
          p.followUpDays <= 90,
        "Reminder interval must be 1–90 days",
      );
      assert(
        Number.isInteger(p.maxFollowUps) &&
          p.maxFollowUps >= 0 &&
          p.maxFollowUps <= 3,
        "Follow-up limit must be 0–3",
      );
      s.settings = {
        followUpDays: p.followUpDays,
        maxFollowUps: p.maxFollowUps,
      };
      break;
    case "event.save": {
      const c = candidate();
      const title = str(p.title, 200);
      assert(title, "Event title is required");
      assert(Number.isFinite(Date.parse(p.start)), "Invalid event time");
      const duration = Number(p.duration);
      assert(
        Number.isInteger(duration) && duration >= 5 && duration <= 480,
        "Duration must be 5–480 minutes",
      );
      const existing = p.id ? s.events.find((e) => e.id === p.id) : null;
      assert(!p.id || existing, "Afspraak niet gevonden.");
      const event = {
        id: existing?.id || randomUUID(),
        candidateId: c.id,
        title,
        start: new Date(p.start).toISOString(),
        duration,
        status: existing?.status || "planned",
        sequence: (existing?.sequence || 0) + (existing ? 1 : 0),
        updatedAt: now,
        createdAt: existing?.createdAt || now,
      };
      if (existing) s.events[s.events.indexOf(existing)] = event;
      else s.events.push(event);
      break;
    }
    case "backup.merge": {
      const backup = p.backup;
      assert(
        backup?.version === 1 && Array.isArray(backup.candidates),
        "Unsupported backup",
      );
      assert(backup.candidates.length <= 5000, "Too many profiles");
      // Import profiles only: never import sent/replied claims or replace local history.
      for (const incoming of backup.candidates) {
        const clean = validateProfile(incoming);
        const id = incoming.id ? str(incoming.id, 100) : randomUUID();
        if (
          s.candidates.some(
            (c) =>
              c.id === id ||
              (clean.url && c.url === clean.url) ||
              (!clean.url &&
                JSON.stringify(validateProfile(c)) === JSON.stringify(clean)),
          )
        )
          continue;
        s.candidates.push({
          ...clean,
          id,
          status: "new",
          notes: str(incoming.notes || ""),
          createdAt: now,
          updatedAt: now,
        });
      }
      break;
    }
    default:
      if (action.type?.startsWith("availability."))
        applyAvailability(s, action, now);
      else if (action.type?.startsWith("automation."))
        applyAutomation(s, action, now, (id) =>
          followUps(s, Date.parse(now)).some(
            (f) => f.candidateId === id && f.due,
          ),
        );
      else throw new Error("Unknown action");
  }
  invalidateApprovals(s, Date.parse(now));
  invalidateDiscovery(s);
  s.revision++;
  s.audit.push({ id: randomUUID(), at: now, type: action.type });
  return s;
}
const escapeICS = (s) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\r/g, "");
export function calendar(state) {
  const stamp = (iso) =>
    new Date(iso)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Reach Out//Personal Planner//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const e of state.events)
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@reach-out.local`,
      `DTSTAMP:${stamp(e.updatedAt || e.createdAt)}`,
      `SEQUENCE:${e.sequence || 0}`,
      `STATUS:${e.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(new Date(Date.parse(e.start) + e.duration * 60000).toISOString())}`,
      `SUMMARY:${escapeICS(e.title)}`,
      "END:VEVENT",
    );
  lines.push("END:VCALENDAR");
  return (
    lines
      .flatMap((line) => {
        let parts = [],
          chunk = "";
        for (const char of line) {
          if (Buffer.byteLength(chunk + char) > 74) {
            parts.push(chunk);
            chunk = " " + char;
          } else chunk += char;
        }
        parts.push(chunk);
        return parts;
      })
      .join("\r\n") + "\r\n"
  );
}
