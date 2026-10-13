import { ranges } from "./matching.mjs";
const check = (ok, msg) => {
  if (!ok) throw new Error(msg);
};
const day = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const text = (v, max = 1000) => {
  check(
    typeof v === "string" && v.length <= max,
    "Ongeldige bezettingsindicatie.",
  );
  return v.trim();
};
export const gapPolicy = () => ({
  enabled: false,
  reviewedThrough: "",
  reviewedAt: "",
  lookAheadDays: 90,
  minimumDays: 14,
});
export const availabilityState = () => ({
  capacity: 2,
  entries: [],
  coverage: null,
  gapPolicy: gapPolicy(),
});
export function validateAvailability(state) {
  const a = state.availability;
  const g = a?.gapPolicy;
  check(
    g &&
      typeof g.enabled === "boolean" &&
      (!g.reviewedThrough || day(g.reviewedThrough)) &&
      (!g.reviewedAt || Number.isFinite(Date.parse(g.reviewedAt))) &&
      Number.isInteger(g.lookAheadDays) &&
      g.lookAheadDays >= 14 &&
      g.lookAheadDays <= 366 &&
      Number.isInteger(g.minimumDays) &&
      g.minimumDays >= 1 &&
      g.minimumDays <= 90,
    "Ongeldige instellingen voor rustige periodes.",
  );
  check(
    a &&
      Number.isInteger(a.capacity) &&
      a.capacity >= 1 &&
      a.capacity <= 20 &&
      Array.isArray(a.entries) &&
      a.entries.length <= 1000,
    "Ongeldige bezettingsplanning.",
  );
  const ids = new Set();
  for (const e of a.entries) {
    check(
      typeof e.id === "string" && /^[\w-]{1,100}$/.test(e.id) && !ids.has(e.id),
      "Dubbele bezettingsregel.",
    );
    ids.add(e.id);
    check(
      text(e.name, 120) &&
        ["inquiry", "tentative", "confirmed", "closed", "unknown"].includes(
          e.status,
        ) &&
        typeof e.reviewed === "boolean",
      "Ongeldige verblijfsstatus.",
    );
    check(
      (!e.start && !e.end) || (day(e.start) && day(e.end) && e.start <= e.end),
      "Vul beide verblijfsdatums in of laat beide leeg.",
    );
    check(
      Number.isInteger(e.people) && e.people >= 1 && e.people <= 20,
      "Ongeldig aantal gasten.",
    );
    check(
      ["day", "approximate", "unknown"].includes(e.precision),
      "Ongeldige datumnauwkeurigheid.",
    );
    check(
      e.status !== "confirmed" ||
        (e.reviewed && e.start && e.precision === "day"),
      "Een bevestigd verblijf vereist gecontroleerde exacte datums.",
    );
    check(
      typeof e.sourceUrl === "string" &&
        /^https:\/\/www\.workaway\.info\/en\/(?:messenger(?:\/\d+)?|workawayer\/[\w-]+)$/.test(
          e.sourceUrl,
        ),
      "Ongeldige correspondentiebron.",
    );
    text(e.summary, 3000);
    check(
      e.sourceReadAt === undefined ||
        (typeof e.sourceReadAt === "string" &&
          Number.isFinite(Date.parse(e.sourceReadAt))),
      "Ongeldige broncontroledatum.",
    );
    check(
      Array.isArray(e.evidence) && e.evidence.length <= 20,
      "Ongeldige broncitaten.",
    );
    for (const p of e.evidence) {
      check(/^\d+$/.test(p.messageId), "Ongeldige berichtbron.");
      text(p.quote, 5000);
    }
  }
  if (a.coverage) {
    check(
      Number.isFinite(Date.parse(a.coverage.readAt)) &&
        Number.isInteger(a.coverage.threads) &&
        a.coverage.threads >= 0 &&
        Number.isInteger(a.coverage.messages) &&
        a.coverage.messages >= 0,
      "Ongeldige correspondentie-dekking.",
    );
    text(a.coverage.scope, 1000);
  }
}
export function applyAvailability(
  state,
  action,
  now = new Date().toISOString(),
) {
  const p = action.payload || {},
    a = state.availability;
  if (action.type === "availability.import") {
    const incoming = structuredClone(p);
    validateAvailability({
      availability: {
        capacity: a.capacity,
        entries: incoming.entries,
        coverage: incoming.coverage,
        gapPolicy: a.gapPolicy,
      },
    });
    for (const e of incoming.entries) {
      const old = a.entries.find((x) => x.id === e.id);
      if (!old) a.entries.push(e);
      else if (!old.reviewed) Object.assign(old, e);
    }
    a.coverage = incoming.coverage;
    a.gapPolicy.enabled = true;
  } else if (action.type === "availability.gaps") {
    check(
      p.confirmed === true,
      "Controleer eerst ook afspraken buiten Workaway.",
    );
    a.gapPolicy = {
      enabled: p.enabled === true,
      reviewedThrough: p.reviewedThrough || "",
      lookAheadDays: Number(p.lookAheadDays),
      minimumDays: Number(p.minimumDays),
      reviewedAt: now,
    };
  } else if (action.type === "availability.capacity")
    a.capacity = Number(p.capacity);
  else if (action.type === "availability.add") {
    a.entries.push({
      id: crypto.randomUUID(),
      name: text(p.name, 120),
      start: p.start || "",
      end: p.end || "",
      status: p.status || "tentative",
      precision: p.precision || "approximate",
      people: Number(p.people || 1),
      reviewed: true,
      sourceUrl: "https://www.workaway.info/en/messenger",
      summary:
        "Handmatig bijgewerkte afspraak, inclusief afspraken buiten Workaway.",
      evidence: [],
    });
  } else if (action.type === "availability.review") {
    const e = a.entries.find((x) => x.id === p.id);
    check(e, "Verblijfsindicatie ontbreekt.");
    Object.assign(e, {
      start: p.start || "",
      end: p.end || "",
      status: p.status,
      precision: p.precision,
      people: Number(p.people),
      reviewed: true,
    });
  } else throw new Error("Onbekende bezettingsactie.");
  validateAvailability(state);
  state.automation.active = false;
  if (action.type !== "availability.gaps") {
    a.gapPolicy.reviewedThrough = "";
    a.gapPolicy.reviewedAt = "";
  }
}

// Pending arrivals reserve capacity conservatively; no inference is a booking.
export function outreachGapReason(state, candidate, now = Date.now()) {
  const a = state.availability,
    g = a?.gapPolicy;
  if (!g?.enabled) return "";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: state.automation.policy.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  if (
    !day(g.reviewedThrough) ||
    g.reviewedThrough < today ||
    !g.reviewedAt ||
    Date.parse(g.reviewedAt) > now ||
    now - Date.parse(g.reviewedAt) > 7 * 86400000
  )
    return "Controleer de bezetting en lopende aanvragen opnieuw bij Agenda (maximaal zeven dagen geldig).";
  if (a.entries.some((e) => e.status !== "closed" && (!e.start || !e.end)))
    return "Er is een lopende aanvraag zonder betrouwbare datums. Stem deze eerst af bij Agenda.";
  const host = ranges(state.profile),
    travel = ranges(candidate);
  if (!host.length)
    return "Vul exacte hostperiodes in om outreach aan een bezettingsgat te koppelen.";
  const horizon = new Date(Date.parse(today) + g.lookAheadDays * 86400000)
    .toISOString()
    .slice(0, 10);
  const limit = horizon < g.reviewedThrough ? horizon : g.reviewedThrough;
  const suitable = new Set();
  for (const h of host)
    for (const c of travel.length ? travel : [h]) {
      const start = [h.start, c.start, today].sort().at(-1),
        end = [h.end, c.end, limit].sort()[0];
      for (const d of occupancyDays(a, start, end))
        if (d.remaining - d.possible >= 1) suitable.add(d.date);
    }
  let run = 0,
    previous = "";
  for (const date of [...suitable].sort()) {
    run =
      previous && Date.parse(date) - Date.parse(previous) === 86400000
        ? run + 1
        : 1;
    if (run >= Math.max(g.minimumDays, state.profile.minOverlapDays || 1))
      return "";
    previous = date;
  }
  return "Geen passend rustig verblijf binnen de gecontroleerde planning. Bezetting of lopende aanvragen vullen deze periode al.";
}
// Only reviewed exact stays count. An inquiry never becomes a booking.
export function occupancyDays(availability, start, end) {
  if (!day(start) || !day(end) || start > end) return [];
  const result = [];
  for (
    let t = Date.parse(start);
    t <= Date.parse(end) && result.length < 366;
    t += 86400000
  ) {
    const date = new Date(t).toISOString().slice(0, 10),
      active = availability.entries.filter(
        (e) =>
          e.start && e.start <= date && e.end >= date && e.status !== "closed",
      );
    const confirmed = active
      .filter(
        (e) => e.status === "confirmed" && e.reviewed && e.precision === "day",
      )
      .reduce((n, e) => n + e.people, 0);
    const possible = active
      .filter((e) => e.status !== "confirmed")
      .reduce((n, e) => n + e.people, 0);
    result.push({
      date,
      confirmed,
      possible,
      remaining: Math.max(0, availability.capacity - confirmed),
      names: active.map((e) => e.name),
    });
  }
  return result;
}
