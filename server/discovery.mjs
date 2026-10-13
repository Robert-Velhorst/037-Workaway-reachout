import { ranges } from "./matching.mjs";
import { profileURL } from "./automation.mjs";

const check = (ok, message) => {
  if (!ok) throw new Error(message);
};
const month = (v) =>
  typeof v === "string" && /^20\d{2}-(0[1-9]|1[0-2])$/.test(v);
const date = (v) =>
  typeof v === "string" &&
  /^20\d{2}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const timestamp = (v) =>
  typeof v === "string" &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
const text = (v, max) => {
  check(typeof v === "string" && v.length <= max, "Ongeldige zoekgegevens.");
  return v.trim();
};
export const discoveryState = () => ({ run: null, results: [] });
export const discoveryBasis = (state) => JSON.stringify(ranges(state.profile));
export function invalidateDiscovery(state) {
  const r = state.discovery?.run;
  if (
    r &&
    ["queued", "running"].includes(r.status) &&
    r.source === "local" &&
    r.basis !== discoveryBasis(state)
  ) {
    r.status = "paused";
    r.reason =
      "Jullie beschikbaarheid is gewijzigd. Start een nieuwe zoekronde.";
  }
}
export function validateDiscovery(state) {
  const d = state.discovery;
  check(
    d && Array.isArray(d.results) && d.results.length <= 5000,
    "Ongeldige kandidatenzoeklijst.",
  );
  const urls = new Set();
  for (const item of d.results) {
    check(
      item.url && profileURL(item.url) === item.url && !urls.has(item.url),
      "Dubbel of ongeldig zoekprofiel.",
    );
    urls.add(item.url);
    check(
      text(item.name, 120) &&
        text(item.description, 3000) !== undefined &&
        text(item.travelLabel, 120),
      "Onvolledig zoekprofiel.",
    );
    check(
      (!item.startMonth && !item.endMonth) ||
        (month(item.startMonth) &&
          month(item.endMonth) &&
          item.startMonth <= item.endMonth),
      "Ongeldige reismaanden.",
    );
    check(
      ["pending", "added", "dismissed"].includes(item.status) &&
        timestamp(item.seenAt),
      "Ongeldige zoekstatus.",
    );
    check(
      Array.isArray(item.overlapMonths) &&
        item.overlapMonths.length <= 120 &&
        item.overlapMonths.every(month),
      "Ongeldige overlapmaanden.",
    );
  }
  const r = d.run;
  if (!r) return;
  check(
    typeof r.id === "string" &&
      /^[\w-]{1,100}$/.test(r.id) &&
      profileURL(r.account, "host") === r.account &&
      r.account,
    "Ongeldige zoekronde.",
  );
  check(
    ["queued", "running", "paused", "done", "error", "limited"].includes(
      r.status,
    ) &&
      ["workaway", "local"].includes(r.source) &&
      typeof r.includeEnquire === "boolean",
    "Ongeldige zoekinstellingen.",
  );
  check(
    timestamp(r.startedAt) &&
      typeof r.basis === "string" &&
      r.basis.length <= 4000,
    "Ongeldige zoekbasis.",
  );
  text(r.reason, 1000);
  check(
    r.nextPage === undefined ||
      (Number.isInteger(r.nextPage) &&
        r.nextPage >= 1 &&
        r.nextPage <= r.pages + 1),
    "Ongeldige vervolgpagina.",
  );
  for (const k of ["periodIndex", "pages", "scanned", "total"])
    check(Number.isSafeInteger(r[k]) && r[k] >= 0, "Ongeldige zoekvoortgang.");
  check(
    Number.isInteger(r.maxPages) &&
      r.maxPages >= 1 &&
      r.maxPages <= 200 &&
      r.pages <= r.maxPages,
    "Gebruik maximaal 200 zoekpagina’s per ronde.",
  );
  check(
    Array.isArray(r.periods) &&
      r.periods.length <= 30 &&
      r.periodIndex <= r.periods.length,
    "Ongeldige zoekperiodes.",
  );
  for (const p of r.periods)
    check(
      date(p.start) &&
        date(p.end) &&
        p.start <= p.end &&
        ["day", "month"].includes(p.precision),
      "Ongeldige zoekperiode.",
    );
}
export function startDiscovery(state, payload, account, now) {
  check(
    !state.automation.active,
    "Pauzeer eerst de verzending voordat je kandidaten zoekt.",
  );
  check(
    ["workaway", "local"].includes(payload.source),
    "Kies de Workaway-kalender of jullie exacte periodes.",
  );
  check(
    !["queued", "running"].includes(state.discovery.run?.status),
    "Er loopt al een zoekronde.",
  );
  const periods =
    payload.source === "local"
      ? ranges(state.profile).map((p) => ({ ...p, precision: "day" }))
      : [];
  check(
    payload.source !== "local" || periods.length,
    "Vul eerst jullie beschikbaarheid in bij Mijn profiel.",
  );
  const maxPages = Number(payload.maxPages ?? 100);
  check(
    Number.isInteger(maxPages) && maxPages >= 1 && maxPages <= 200,
    "Gebruik 1–200 zoekpagina’s per ronde.",
  );
  state.discovery.run = {
    id: crypto.randomUUID(),
    account,
    source: payload.source,
    includeEnquire: payload.includeEnquire === true,
    maxPages,
    basis: discoveryBasis(state),
    periods,
    periodIndex: 0,
    pages: 0,
    scanned: 0,
    total: 0,
    status: "queued",
    reason:
      "Wacht op de gekoppelde extensie. Herlaad de extensie na een update.",
    startedAt: now,
  };
}
export function initializeDiscovery(state, payload, now) {
  const r = state.discovery.run;
  check(
    r?.id === payload.runId && r.status === "queued",
    "Deze zoekronde is niet meer actief.",
  );
  if (r.source === "workaway") {
    check(
      Array.isArray(payload.calendar) && payload.calendar.length <= 12,
      "De zichtbare hostkalender ontbreekt.",
    );
    const todayMonth = now.slice(0, 7),
      used = new Set();
    r.periods = payload.calendar
      .filter((p) => {
        check(
          month(p.month) &&
            ["needed", "enquire", "unavailable"].includes(p.status) &&
            !used.has(p.month),
          "De hostkalender is gewijzigd of onbekend.",
        );
        used.add(p.month);
        return (
          p.month >= todayMonth &&
          (p.status === "needed" ||
            (r.includeEnquire && p.status === "enquire"))
        );
      })
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((p) => ({
        start: p.month + "-01",
        end: new Date(
          Date.UTC(Number(p.month.slice(0, 4)), Number(p.month.slice(5, 7)), 0),
        )
          .toISOString()
          .slice(0, 10),
        precision: "month",
      }));
  }
  r.periods = r.periods
    .filter((p) => p.end >= now.slice(0, 10))
    .map((p) => ({
      ...p,
      start: p.start < now.slice(0, 10) ? now.slice(0, 10) : p.start,
    }));
  check(
    r.periods.length,
    "Geen beschikbare toekomstige maanden gevonden. Controleer jullie kalender of gebruik exacte periodes.",
  );
  r.status = "running";
  r.reason =
    "Zoekt reisplannen naar Nederland. Exacte verblijfsdatums blijven onbevestigd.";
}
export function discoveryTask(state, account) {
  invalidateDiscovery(state);
  const r = state.discovery.run;
  return r && r.account === account && ["queued", "running"].includes(r.status)
    ? structuredClone(r)
    : null;
}
export function acceptDiscoveryPage(state, payload, now) {
  const r = state.discovery.run;
  check(
    r?.id === payload.runId &&
      r.status === "running" &&
      payload.periodIndex === r.periodIndex,
    "De zoekronde is gepauzeerd of gewijzigd.",
  );
  check(
    payload.destination === "Netherlands" && payload.coincide === true,
    "De reisbestemming of datumfilter is niet bevestigd.",
  );
  const period = r.periods[r.periodIndex];
  check(
    payload.start === period.start && payload.end === period.end,
    "De zoekdatums wijken af.",
  );
  check(
    Number.isInteger(payload.page) &&
      payload.page >= 1 &&
      payload.page <= 10000 &&
      payload.page === (r.nextPage || 1),
    "De zoekpagina wijkt af.",
  );
  check(
    Number.isInteger(payload.total) &&
      payload.total >= 0 &&
      payload.total <= 1000000 &&
      typeof payload.hasNext === "boolean",
    "Ongeldige zoekdekking.",
  );
  check(
    Array.isArray(payload.items) &&
      payload.items.length <= 50 &&
      (payload.items.length || payload.total === 0),
    "De zoekresultaten ontbreken.",
  );
  for (const input of payload.items) {
    const url = profileURL(input.url),
      name = text(input.name, 120),
      description = text(input.description, 3000),
      travelLabel = text(input.travelLabel, 120);
    check(
      url &&
        name &&
        ((!input.startMonth && !input.endMonth) ||
          (month(input.startMonth) &&
            month(input.endMonth) &&
            input.startMonth <= input.endMonth)),
      "Onbekende profielkaart of reisdatums.",
    );
    r.scanned++;
    const overlapMonths = [];
    for (const p of r.periods) {
      let m = p.start.slice(0, 7),
        last = p.end.slice(0, 7);
      while (m <= last && overlapMonths.length < 120) {
        if (
          (!input.startMonth ||
            (m >= input.startMonth && m <= input.endMonth)) &&
          !overlapMonths.includes(m)
        )
          overlapMonths.push(m);
        const y = Number(m.slice(0, 4)),
          n = Number(m.slice(5, 7));
        m = n === 12 ? `${y + 1}-01` : `${y}-${String(n + 1).padStart(2, "0")}`;
      }
    }
    if (!overlapMonths.length) continue;
    const old = state.discovery.results.find((x) => x.url === url);
    if (!old && state.discovery.results.length >= 5000) {
      r.status = "limited";
      r.reason =
        "De beoordelingslijst bevat 5000 profielen. Geen volledige dekking.";
      return;
    }
    const result = {
      url,
      name,
      description,
      travelLabel,
      startMonth: input.startMonth,
      endMonth: input.endMonth,
      overlapMonths,
      seenAt: now,
      status: old?.status || "pending",
    };
    if (old) Object.assign(old, result);
    else state.discovery.results.push(result);
  }
  r.pages++;
  r.total = payload.total;
  if (payload.hasNext) r.nextPage = payload.page + 1;
  else {
    r.periodIndex++;
    r.nextPage = 1;
  }
  if (r.periodIndex >= r.periods.length) {
    r.status = "done";
    r.reason =
      "Alle zichtbare zoekpagina’s van de gekozen periodes doorlopen. De resultaten kunnen tijdens het zoeken wijzigen.";
  } else if (r.pages >= r.maxPages) {
    r.status = "limited";
    r.reason =
      "Het ingestelde paginalimiet is bereikt. Geen volledige dekking.";
  }
}
