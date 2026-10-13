import { match } from "./matching.mjs";
import { outreachGapReason } from "./availability.mjs";

export function profileURL(value, type = "workawayer") {
  try {
    const url = new URL(value);
    const m = url.pathname.match(
      /^\/(?:[a-z]{2}\/)?(workawayer|host)\/([\w-]+)(?:\/overview)?\/?$/,
    );
    if (
      url.origin !== "https://www.workaway.info" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !m ||
      m[1] !== type
    )
      return "";
    return `https://www.workaway.info/en/${m[1]}/${m[2]}`;
  } catch {
    return "";
  }
}

const check = (ok, message) => {
  if (!ok) throw new Error(message);
};
const text = (value, max = 200) => {
  check(
    typeof value === "string" && value.length <= max,
    "Ongeldige automatiseringsinvoer.",
  );
  return value.trim();
};
export const automationState = () => ({
  active: false,
  policyVersion: 0,
  policy: {
    approvalMode: "message",
    account: "",
    allowlist: [],
    dailyLimit: 3,
    hourlyLimit: 1,
    gapMinutes: 60,
    timezone: "Europe/Amsterdam",
    weekdays: [1, 2, 3, 4, 5],
    windowStart: "09:00",
    windowEnd: "18:00",
    minimumScore: 0,
    allowFollowUps: false,
    approvalHours: 24,
  },
  jobs: [],
});

export function validatePolicy(input) {
  check(input && typeof input === "object", "Verzendinstellingen ontbreken.");
  check(
    ["message", "campaign", "rules"].includes(input.approvalMode),
    "Kies een geldige goedkeuringswijze.",
  );
  const policy = {
    ...input,
    account: text(input.account),
    timezone: text(input.timezone, 100),
  };
  check(
    !policy.account || profileURL(policy.account, "host"),
    "Gebruik de URL van het verwachte hostprofiel.",
  );
  if (policy.account) policy.account = profileURL(policy.account, "host");
  try {
    new Intl.DateTimeFormat("nl", { timeZone: policy.timezone }).format();
  } catch {
    throw new Error(
      "Kies een geldige tijdzone, bijvoorbeeld Europe/Amsterdam.",
    );
  }
  for (const [key, min, max] of [
    ["dailyLimit", 1, 100],
    ["hourlyLimit", 1, 20],
    ["gapMinutes", 1, 1440],
    ["minimumScore", 0, 100],
    ["approvalHours", 1, 168],
  ])
    check(
      Number.isInteger(policy[key]) && policy[key] >= min && policy[key] <= max,
      `Ongeldige waarde voor ${key}.`,
    );
  check(
    policy.hourlyLimit <= policy.dailyLimit,
    "Het uurlimiet mag niet groter zijn dan het daglimiet.",
  );
  check(
    Array.isArray(input.allowlist) &&
      input.allowlist.length <= 5000 &&
      input.allowlist.every(
        (id) => typeof id === "string" && /^[\w-]{1,100}$/.test(id),
      ),
    "Ongeldige ontvangerslijst.",
  );
  policy.allowlist = [...new Set(input.allowlist)];
  check(
    Array.isArray(input.weekdays) &&
      input.weekdays.length > 0 &&
      input.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    "Kies minstens één verzenddag.",
  );
  policy.weekdays = [...new Set(input.weekdays)];
  for (const value of [policy.windowStart, policy.windowEnd])
    check(
      typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value),
      "Gebruik geldige verzendtijden.",
    );
  check(
    policy.windowStart < policy.windowEnd,
    "De eindtijd moet na de begintijd liggen. Gebruik één venster binnen dezelfde dag.",
  );
  check(
    typeof policy.allowFollowUps === "boolean",
    "Kies of vervolgberichten zijn toegestaan.",
  );
  return Object.fromEntries(
    Object.keys(automationState().policy).map((key) => [key, policy[key]]),
  );
}

export function approvalBasis(state, messageId, subject = "") {
  const message = state.messages.find((m) => m.id === messageId);
  const candidate = state.candidates.find((c) => c.id === message?.candidateId);
  if (!message || !candidate) return null;
  // Exact text, destination and the facts used to prepare it are bound together.
  return JSON.stringify({
    messageId,
    subject,
    body: message.body,
    kind: message.kind,
    candidate,
    profile: state.profile,
    policy: state.automation.policy,
    policyVersion: state.automation.policyVersion,
    availability: state.availability && {
      capacity: state.availability.capacity,
      gapPolicy: state.availability.gapPolicy,
      entries: state.availability.entries.map(
        ({ id, start, end, status, precision, people, reviewed }) => ({
          id,
          start,
          end,
          status,
          precision,
          people,
          reviewed,
        }),
      ),
    },
  });
}

export function jobBlockReason(
  state,
  job,
  now = Date.now(),
  followupDue = false,
) {
  const automation = state.automation;
  const message = state.messages.find((m) => m.id === job.messageId);
  const candidate = state.candidates.find((c) => c.id === message?.candidateId);
  if (!message || !candidate || message.status !== "draft")
    return "Het concept of de ontvanger is niet meer beschikbaar.";
  if (!profileURL(candidate.url))
    return "Voeg een specifieke Workaway-workawayer-profiel-URL toe.";
  if (!automation.policy.allowlist.includes(candidate.id))
    return "Deze ontvanger is niet toegestaan voor automatische verzending.";
  if (
    ["replied", "declined", "do-not-contact", "archived"].includes(
      candidate.status,
    )
  )
    return "Benadering is gestopt voor deze ontvanger.";
  if (message.body.trim().length < 20 || /\{\w+\}/.test(message.body))
    return "Controleer de berichttekst en ontbrekende sjabloonvelden.";
  if (!automation.policy.account)
    return "Stel de URL van het verwachte Workaway-hostprofiel in.";
  const gapReason = outreachGapReason(state, candidate, now);
  if (gapReason) return gapReason;
  if (message.kind === "initial") {
    if (
      typeof job.subject !== "string" ||
      job.subject.trim().length < 3 ||
      job.subject.length > 200 ||
      /[\r\n]/.test(job.subject)
    )
      return "Vul een persoonlijk onderwerp in (3–200 tekens, één regel).";
    if (!["new", "shortlisted"].includes(candidate.status))
      return "De ontvanger is al benaderd.";
    if (
      state.messages.some(
        (m) => m.candidateId === candidate.id && m.status === "sent",
      )
    )
      return "Voor deze ontvanger bestaat al een verzonden bericht.";
    const result = match(state.profile, candidate);
    if (
      !result.eligible ||
      result.conflict ||
      result.score < automation.policy.minimumScore
    )
      return "De kandidaat voldoet niet aan de ingestelde matchvoorwaarden.";
  } else if (
    message.kind !== "followup" ||
    !automation.policy.allowFollowUps ||
    !followupDue
  )
    return "Dit vervolgbericht is niet toegestaan of nog niet aan de beurt.";
  if (
    job.basis &&
    job.basis !== approvalBasis(state, job.messageId, job.subject)
  )
    return "Gegevens, bericht of regels zijn gewijzigd. Keur opnieuw goed.";
  if (job.expiresAt && Date.parse(job.expiresAt) <= now)
    return "De goedkeuring is verlopen. Keur opnieuw goed.";
  if (Date.parse(job.notBefore) > now)
    return "De geplande verzendtijd is nog niet bereikt.";
  return "";
}

export function scheduleBlockReason(state, attempts, now = Date.now()) {
  const policy = state.automation.policy;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: policy.timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    parts.weekday,
  );
  const time = `${parts.hour}:${parts.minute}`;
  if (
    !policy.weekdays.includes(weekday) ||
    time < policy.windowStart ||
    time >= policy.windowEnd
  )
    return "Buiten het ingestelde verzendvenster.";
  const dayKey = (at) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: policy.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  const effective = attempts.filter((a) => Number.isFinite(Date.parse(a.at)));
  if (
    effective.filter((a) => dayKey(Date.parse(a.at)) === dayKey(now)).length >=
    policy.dailyLimit
  )
    return "Het daglimiet is bereikt.";
  if (
    effective.filter((a) => Date.parse(a.at) > now - 3600000).length >=
    policy.hourlyLimit
  )
    return "Het uurlimiet is bereikt.";
  if (effective.some((a) => now - Date.parse(a.at) < policy.gapMinutes * 60000))
    return "De minimale tijd tussen berichten is nog niet verstreken.";
  return "";
}

export function applyAutomation(state, action, now, followupDue) {
  const automation = state.automation,
    payload = action.payload || {};
  switch (action.type) {
    case "automation.policy": {
      const policy = validatePolicy(payload);
      check(
        policy.approvalMode !== "rules" || payload.rulesConfirmed === true,
        "Bevestig dat klaargezette concepten zonder afzonderlijke goedkeuring mogen worden verzonden.",
      );
      check(
        policy.allowlist.every((id) =>
          state.candidates.some((c) => c.id === id),
        ),
        "Een toegestane ontvanger bestaat niet meer.",
      );
      automation.policy = policy;
      automation.policyVersion++;
      automation.active = false;
      automation.jobs
        .filter((j) => ["approved", "queued"].includes(j.status))
        .forEach((j) => {
          j.status = "stale";
          j.reason = "De verzendregels zijn gewijzigd.";
        });
      break;
    }
    case "automation.enqueue": {
      const notBefore = payload.notBefore
        ? new Date(payload.notBefore).toISOString()
        : now;
      const message = state.messages.find((m) => m.id === payload.messageId);
      check(
        message && message.status === "draft",
        "Kies een bestaand conceptbericht.",
      );
      check(
        !automation.jobs.some(
          (j) =>
            j.messageId === message.id &&
            !["cancelled", "stale", "blocked"].includes(j.status),
        ),
        "Dit bericht staat al in de verzendwachtrij.",
      );
      const job = {
        id: globalThis.crypto.randomUUID(),
        messageId: message.id,
        candidateId: message.candidateId,
        subject: message.kind === "initial" ? text(payload.subject, 200) : "",
        notBefore,
        createdAt: now,
        status: "queued",
        reason: "",
      };
      const reason = jobBlockReason(
        state,
        { ...job, notBefore: now },
        Date.parse(now),
        followupDue(message.candidateId),
      );
      check(!reason, reason);
      if (automation.policy.approvalMode === "rules") {
        job.status = "approved";
        job.basis = approvalBasis(state, message.id, job.subject);
        job.approvedAt = now;
        job.expiresAt = new Date(
          Date.parse(now) + automation.policy.approvalHours * 3600000,
        ).toISOString();
      }
      automation.jobs.push(job);
      break;
    }
    case "automation.approve": {
      check(
        payload.confirmed === true,
        "Bevestig de exacte ontvangers en berichtteksten.",
      );
      check(
        Array.isArray(payload.jobIds) &&
          payload.jobIds.length > 0 &&
          payload.jobIds.length <= 100,
        "Kies de berichten die je goedkeurt.",
      );
      check(
        automation.policy.approvalMode !== "message" ||
          payload.jobIds.length === 1,
        "Keur in deze modus één bericht tegelijk goed.",
      );
      for (const id of payload.jobIds) {
        const job = automation.jobs.find((j) => j.id === id);
        check(
          job && ["queued", "stale", "blocked"].includes(job.status),
          "Dit wachtrij-item kan niet worden goedgekeurd.",
        );
        const reason = jobBlockReason(
          state,
          { ...job, basis: null, expiresAt: null, notBefore: now },
          Date.parse(now),
          followupDue(job.candidateId),
        );
        check(!reason, reason);
        job.basis = approvalBasis(state, job.messageId, job.subject);
        job.approvedAt = now;
        job.expiresAt = new Date(
          Date.parse(now) + automation.policy.approvalHours * 3600000,
        ).toISOString();
        job.status = "approved";
        job.reason = "";
      }
      break;
    }
    case "automation.cancel": {
      const job = automation.jobs.find((j) => j.id === payload.id);
      check(
        job && !["attempted", "delivered", "uncertain"].includes(job.status),
        "Een lopende of uitgevoerde verzending kan niet worden teruggedraaid.",
      );
      job.status = "cancelled";
      break;
    }
    case "automation.pause":
      automation.active = false;
      if (["queued", "running"].includes(state.discovery?.run?.status)) {
        state.discovery.run.status = "paused";
        state.discovery.run.reason = "Zoeken gestopt via de noodstop.";
      }
      break;
    case "automation.start":
      throw new Error(
        "Automatisch zoeken en berichten sturen via Workaway is uitgeschakeld. Voeg kandidaten zelf toe en verstuur berichten zelf in Workaway.",
      );
    default:
      throw new Error("Onbekende automatiseringsactie.");
  }
}

export function invalidateApprovals(state, now = Date.now()) {
  for (const job of state.automation.jobs)
    if (
      job.status === "approved" &&
      (job.basis !== approvalBasis(state, job.messageId, job.subject) ||
        Date.parse(job.expiresAt) <= now)
    ) {
      job.status = "stale";
      job.reason =
        "De goedkeuring is verlopen of gegevens, bericht of regels zijn gewijzigd. Keur opnieuw goed.";
    }
}

export function validateAutomation(state) {
  const automation = state.automation;
  check(
    automation &&
      typeof automation.active === "boolean" &&
      Number.isSafeInteger(automation.policyVersion) &&
      automation.policyVersion >= 0,
    "Ongeldige verzendinstellingen in back-up.",
  );
  validatePolicy(automation.policy);
  check(
    automation.policy.allowlist.every((id) =>
      state.candidates.some((c) => c.id === id),
    ),
    "Een toegestane ontvanger ontbreekt.",
  );
  check(
    Array.isArray(automation.jobs) && automation.jobs.length <= 50000,
    "Ongeldige verzendwachtrij.",
  );
  const ids = new Set();
  for (const job of automation.jobs) {
    check(
      typeof job.id === "string" &&
        /^[\w-]{1,100}$/.test(job.id) &&
        !ids.has(job.id),
      "Ongeldig verzend-ID.",
    );
    ids.add(job.id);
    check(
      typeof job.createdAt === "string" && typeof job.notBefore === "string",
      "De geplande verzendtijd ontbreekt.",
    );
    check(
      state.messages.some(
        (m) => m.id === job.messageId && m.candidateId === job.candidateId,
      ),
      "Ongeldige berichtverwijzing in wachtrij.",
    );
    check(
      [
        "queued",
        "approved",
        "stale",
        "blocked",
        "cancelled",
        "attempted",
        "delivered",
        "uncertain",
      ].includes(job.status),
      "Ongeldige verzendstatus.",
    );
    for (const value of [
      job.createdAt,
      job.notBefore,
      job.approvedAt,
      job.expiresAt,
      job.attemptedAt,
      job.deliveredAt,
    ].filter((x) => x !== undefined))
      check(
        typeof value === "string" &&
          /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
            value,
          ) &&
          new Date(value.slice(0, 10) + "T00:00:00Z")
            .toISOString()
            .slice(0, 10) === value.slice(0, 10) &&
          Number.isFinite(Date.parse(value)),
        "Ongeldig verzendtijdstip.",
      );
    if (job.status === "approved")
      check(
        typeof job.basis === "string" && job.approvedAt && job.expiresAt,
        "Goedkeuring ontbreekt.",
      );
    if (job.basis !== undefined) text(job.basis, 250000);
    if (job.subject !== undefined) text(job.subject, 200);
    if (job.reason !== undefined) text(job.reason, 1000);
  }
}

export function disarmRestoredAutomation(state) {
  state.automation.active = false;
  for (const job of state.automation.jobs) {
    if (job.status === "attempted") job.status = "uncertain";
    if (job.status === "approved") {
      job.status = "stale";
      job.reason =
        "Hersteld uit back-up. Controleer de echte Workaway-inbox en keur opnieuw goed.";
    }
  }
  return state;
}
