export const vocabulary = {
  gardening: ["gardening", "tuinieren", "tuinwerk", "moestuin"],
  cooking: ["cooking", "koken"],
  "animal care": ["animal care", "dierenverzorging", "dieren verzorgen"],
  childcare: ["childcare", "kinderopvang"],
  teaching: ["teaching", "lesgeven", "onderwijs"],
  carpentry: ["carpentry", "timmeren", "timmerwerk"],
  cleaning: ["cleaning", "schoonmaken"],
  painting: ["painting", "schilderen"],
  farming: ["farming", "landbouw"],
  english: ["english", "engels"],
  dutch: ["dutch", "nederlands"],
  german: ["german", "duits"],
  french: ["french", "frans"],
  spanish: ["spanish", "spaans"],
  italian: ["italian", "italiaans"],
};
export const canonical = (value) => {
  const text = String(value).trim().toLowerCase();
  return (
    Object.entries(vocabulary).find(([, words]) => words.includes(text))?.[0] ||
    text
  );
};
export const normalizeTags = (values) => [
  ...new Set(
    (Array.isArray(values) ? values : String(values || "").split(","))
      .map(canonical)
      .filter(Boolean),
  ),
];
export function ranges(p) {
  return (
    p.periods?.length
      ? p.periods
      : p.start && p.end
        ? [{ start: p.start, end: p.end }]
        : []
  )
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
}
export function match(profile, candidate) {
  const skills = normalizeTags(profile.skills),
    other = normalizeTags(candidate.skills);
  const langs = normalizeTags(profile.languages),
    otherLangs = normalizeTags(candidate.languages);
  const sharedSkills = skills.filter((s) => other.includes(s)),
    sharedLanguages = langs.filter((s) => otherLangs.includes(s));
  const a = ranges(profile),
    b = ranges(candidate),
    knownDates = !!(a.length && b.length);
  const intersections = [];
  for (const x of a)
    for (const y of b) {
      const start = x.start > y.start ? x.start : y.start,
        end = x.end < y.end ? x.end : y.end;
      if (start <= end) intersections.push({ start, end });
    }
  const merged = [];
  for (const p of intersections.sort((a, b) =>
    a.start.localeCompare(b.start),
  )) {
    const last = merged.at(-1);
    if (last && Date.parse(p.start) <= Date.parse(last.end) + 86400000)
      last.end = p.end > last.end ? p.end : last.end;
    else merged.push({ ...p });
  }
  const days = (p) =>
    Math.round((Date.parse(p.end) - Date.parse(p.start)) / 86400000) + 1;
  const longestDays = merged.length ? Math.max(...merged.map(days)) : 0;
  const minDays = profile.minOverlapDays || 1;
  const overlap = longestDays >= minDays;
  const requirements = [
    ...normalizeTags(profile.requiredSkills).map((value) => ({
      type: "Vaardigheid",
      value,
      known: other.length > 0,
      met: other.includes(value),
    })),
    ...normalizeTags(profile.requiredLanguages).map((value) => ({
      type: "Taal",
      value,
      known: otherLangs.length > 0,
      met: otherLangs.includes(value),
    })),
  ];
  const unmet = requirements.filter((r) => r.known && !r.met),
    unconfirmed = requirements.filter((r) => !r.known);
  if (knownDates && !overlap)
    unmet.push({
      type: "Beschikbaarheid",
      value: `minimaal ${minDays} aaneengesloten dagen`,
    });
  if (!knownDates && minDays > 1)
    unconfirmed.push({
      type: "Beschikbaarheid",
      value: `minimaal ${minDays} aaneengesloten dagen`,
    });
  const checks = [
    {
      label: "Skills",
      weight: 60,
      known: !!(skills.length && other.length),
      value: skills.length ? sharedSkills.length / skills.length : 0,
    },
    {
      label: "Language",
      weight: 15,
      known: !!(langs.length && otherLangs.length),
      value: sharedLanguages.length ? 1 : 0,
    },
    {
      label: "Availability",
      weight: 25,
      known: knownDates,
      value: overlap ? 1 : 0,
    },
  ];
  const best = merged.find((p) => days(p) >= minDays) || merged[0];
  return {
    score: checks.reduce((n, c) => n + (c.known ? c.weight * c.value : 0), 0),
    coverage: checks.reduce((n, c) => n + (c.known ? c.weight : 0), 0),
    sharedSkills,
    sharedLanguages,
    overlap,
    start: best?.start || "",
    end: best?.end || "",
    overlaps: merged,
    longestDays,
    conflict: knownDates && !overlap,
    unmet,
    unconfirmed,
    eligible: !unmet.length && !unconfirmed.length,
    unknown: checks.filter((c) => !c.known).map((c) => c.label),
  };
}
export function suggestProfile(text) {
  if (typeof text !== "string" || text.length > 50000)
    throw new Error("Gebruik maximaal 50.000 tekens.");
  const proposals = [],
    warnings = [];
  const add = (field, value, evidence) =>
    proposals.push({ field, value, evidence });
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    const negated = /\b(no|not|never|without|geen|niet|nooit|zonder)\b/i.test(
      line,
    );
    const meta = line.match(
      /^(naam|name|locatie|location|bestemming|destination)\s*:\s*(.{1,200})$/i,
    );
    if (meta)
      add(/naam|name/i.test(meta[1]) ? "name" : "location", meta[2], line);
    if (negated) {
      warnings.push(`Controleer ontkenning: ${line}`);
      continue;
    }
    for (const [value, words] of Object.entries(vocabulary)) {
      const isLanguage = [
        "english",
        "dutch",
        "german",
        "french",
        "spanish",
        "italian",
      ].includes(value);
      const evidence = words.some((word) =>
        new RegExp(`(^|[^\\p{L}])${word}([^\\p{L}]|$)`, "iu").test(lower),
      );
      if (
        evidence &&
        !proposals.some(
          (p) =>
            p.field === (isLanguage ? "languages" : "skills") &&
            p.value === value,
        )
      )
        add(isLanguage ? "languages" : "skills", value, line);
    }
    const dates = [
      ...line.matchAll(/\b(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})\b/g),
    ].map((m) => {
      const t = m[0];
      return /^\d{4}/.test(t) ? t : t.split("-").reverse().join("-");
    });
    if (dates.length) {
      const valid =
        dates.length === 2 &&
        dates.every(
          (d) =>
            Number.isFinite(Date.parse(d)) &&
            new Date(d).toISOString().slice(0, 10) === d,
        ) &&
        dates[0] <= dates[1];
      if (valid) add("periods", { start: dates[0], end: dates[1] }, line);
      else warnings.push(`Datums niet eenduidig: ${line}`);
    }
  }
  return {
    proposals,
    warnings,
    notice:
      "Dit zijn tekstsuggesties, geen bevestigde feiten. Controleer de bron en selecteer alleen wat klopt. Bestaande velden worden pas na jouw keuze aangepast.",
  };
}
