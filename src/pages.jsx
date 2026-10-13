import { useState } from "react";
import { match } from "../server/matching.mjs";
import {
  Field,
  Empty,
  ProfileForm,
  WorkawayLink,
  Conflict,
} from "./components.jsx";
import { useDraft } from "./drafts.jsx";
import { statusLabel, showTags, localDate, dateInput } from "./labels.js";
import { Messages, Planner, Preferences } from "./workflows.jsx";
export { Messages, Planner, Preferences };
export function Candidates({ state, action, busy, selected, setSelected }) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("active"),
    [edit, setEdit] = useState(false);
  const all = state.candidates.map((c) => ({
    ...c,
    match: match(state.profile, c),
  }));
  const filtered = all
    .filter(
      (c) =>
        (status === "all" || status === "active"
          ? !["archived", "do-not-contact", "declined"].includes(c.status) ||
            status === "all"
          : c.status === status) &&
        `${c.name} ${c.location} ${c.skills.join(" ")} ${showTags(c.skills)} ${showTags(c.languages)}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.match.eligible) - Number(a.match.eligible) ||
        b.match.score - a.match.score,
    );
  const c = all.find((c) => c.id === selected);
  return (
    <>
      <div className="toolbar">
        <Field
          label="Zoek kandidaten"
          value={query}
          placeholder="Naam, vaardigheid, taal of bestemming"
          onChange={(e) => setQuery(e.target.value)}
        />
        <Field label="Filter op status">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Actief</option>
            <option value="all">Alle kandidaten</option>
            {Object.entries(statusLabel)
              .filter(([k]) =>
                [
                  "new",
                  "shortlisted",
                  "contacted",
                  "replied",
                  "declined",
                  "do-not-contact",
                  "archived",
                ].includes(k),
              )
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
        </Field>
        <small>
          {filtered.length} kandidaat{filtered.length === 1 ? "" : "en"}
        </small>
      </div>
      <section className="panel table-panel">
        {filtered.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Kandidaat</th>
                  <th>Overeenkomsten</th>
                  <th>Match</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className={selected === item.id ? "selected" : ""}
                  >
                    <td>
                      <button
                        className="person-button"
                        onClick={() => {
                          setSelected(item.id);
                          setEdit(false);
                        }}
                      >
                        <span className="avatar">{item.name.slice(0, 1)}</span>
                        <span>
                          <strong>{item.name}</strong>
                          <small>{item.location || "Locatie onbekend"}</small>
                        </span>
                      </button>
                    </td>
                    <td>
                      {showTags(item.match.sharedSkills) ||
                        "Geen gedeelde vaardigheden vastgelegd"}
                    </td>
                    <td>
                      <strong className="score">
                        {Math.round(item.match.score)}%
                      </strong>
                      <small>{item.match.coverage}% gegevensdekking</small>
                      {!item.match.eligible && <small>Eisen controleren</small>}
                    </td>
                    <td>
                      <span className={`status ${item.status}`}>
                        {statusLabel[item.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Geen kandidaten in deze selectie.">
            Voeg een kandidaat toe of pas de filters aan.
          </Empty>
        )}
      </section>
      {c && (
        <section className="panel">
          <div className="section-heading">
            <h2>Dossier: {c.name}</h2>
            <button className="text-button" onClick={() => setSelected("")}>
              Dossier sluiten
            </button>
          </div>
          <div className="actions">
            <WorkawayLink url={c.url} />
            <button className="secondary" onClick={() => setEdit((x) => !x)}>
              {edit ? "Profielbewerking sluiten" : "Profiel bewerken"}
            </button>
            <Field label="Kandidaatstatus">
              <select
                value={c.status}
                disabled={busy}
                onChange={(e) =>
                  action("candidate.status", {
                    candidateId: c.id,
                    status: e.target.value,
                  })
                }
              >
                {[
                  "new",
                  "shortlisted",
                  "contacted",
                  "replied",
                  "declined",
                  "do-not-contact",
                  "archived",
                ].map((k) => (
                  <option key={k} value={k}>
                    {statusLabel[k]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {edit && (
            <ProfileForm
              key={c.id}
              initial={state.candidates.find((x) => x.id === c.id)}
              busy={busy}
              onSave={async (p) => {
                const ok = await action("candidate.save", p);
                if (ok) setEdit(false);
                return ok;
              }}
            />
          )}
          <p className="prewrap">{c.description}</p>
          <div className="match-box">
            <strong>
              {Math.round(c.match.score)}% match · {c.match.coverage}%
              gegevensdekking
            </strong>
            <p>
              Vaardigheden 60% · beschikbaarheid 25% · taal 15%. Onbekende
              gegevens krijgen geen punten.
            </p>
            <p>
              {c.match.overlaps.length
                ? `Gedeelde periodes: ${c.match.overlaps.map((p) => `${p.start} t/m ${p.end}`).join("; ")}. Langste aaneengesloten periode: ${c.match.longestDays} dagen.`
                : "Geen overlappende periode bevestigd."}
            </p>
            {c.match.unmet.map((r, i) => (
              <p key={i}>
                Niet voldaan: {r.type} — {showTags([r.value])}
              </p>
            ))}
            {c.match.unconfirmed.map((r, i) => (
              <p key={i}>
                Nog onbevestigd: {r.type} — {showTags([r.value])}
              </p>
            ))}
          </div>
          {c.sourceText && (
            <details>
              <summary>Oorspronkelijke bron</summary>
              <p className="prewrap">{c.sourceText}</p>
            </details>
          )}
          {c.notes && <p className="prewrap">Privénotities: {c.notes}</p>}
          {["new", "shortlisted"].includes(c.status) && (
            <Introduction
              key={"intro-" + c.id}
              c={c}
              state={state}
              action={action}
              busy={busy}
            />
          )}
          <Dossier key={c.id} c={c} state={state} action={action} busy={busy} />
        </section>
      )}
    </>
  );
}
function Introduction({ c, state, action, busy }) {
  const [form, set, clear] = useDraft("intro-" + c.id, {
    language: "nl",
    personalNote: "",
  });
  const exists = state.messages.some(
    (m) => m.candidateId === c.id && ["draft", "sent"].includes(m.status),
  );
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await action("message.draft", { candidateId: c.id, ...form }))
          clear();
      }}
    >
      <h3>Persoonlijke introductie</h3>
      <Field label="Berichttaal">
        <select
          value={form.language}
          onChange={(e) => set((f) => ({ ...f, language: e.target.value }))}
        >
          <option value="nl">Nederlands</option>
          <option value="en">Engels</option>
        </select>
      </Field>
      <Field label="Wat spreekt je specifiek aan in deze persoon?">
        <textarea
          rows={3}
          required
          minLength={10}
          value={form.personalNote}
          onChange={(e) => set((f) => ({ ...f, personalNote: e.target.value }))}
        />
      </Field>
      <button
        className="primary"
        disabled={busy || !c.match.eligible || exists}
      >
        Concept voorbereiden
      </button>
      <p className="muted">
        {exists
          ? "Er bestaat al een concept of vastgelegd verzonden bericht. Bekijk Berichten."
          : "Controleer het resultaat bij Berichten. Er wordt niets verzonden."}
      </p>
    </form>
  );
}
function Dossier({ c, state, action, busy }) {
  const initial = {
    kind: "note",
    body: "",
    at: "",
    dueAt: "",
    confirmed: false,
  };
  const [form, set, clear] = useDraft("journal-" + c.id, initial);
  const change = (key, value) => set((f) => ({ ...f, [key]: value }));
  const timeline = [
    ...state.messages
      .filter((m) => m.candidateId === c.id)
      .map((m) => ({
        ...m,
        at: m.sentAt || m.createdAt,
        label: statusLabel[m.status],
      })),
    ...(state.journal || [])
      .filter((j) => j.candidateId === c.id)
      .map((j) => ({
        ...j,
        label: {
          note: "Notitie",
          reply: "Ontvangen reactie",
          task: "Volgende actie",
          status: "Statuswijziging",
        }[j.kind],
      })),
    ...state.events
      .filter((e) => e.candidateId === c.id)
      .map((e) => ({
        ...e,
        at: e.start,
        body: e.title,
        label: `Afspraak · ${statusLabel[e.status || "planned"]}`,
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="grid two dossier-grid">
      <section>
        <h3>Contact of notitie vastleggen</h3>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await action("journal.add", {
                candidateId: c.id,
                ...form,
                at: new Date(form.at).toISOString(),
                dueAt: form.dueAt
                  ? new Date(form.dueAt).toISOString()
                  : undefined,
              })
            )
              clear();
          }}
        >
          <Field label="Soort dossierregel">
            <select
              value={form.kind}
              onChange={(e) => change("kind", e.target.value)}
            >
              <option value="note">Privénotitie</option>
              <option value="reply">Ontvangen reactie</option>
              <option value="outgoing">Eerder verzonden bericht</option>
              <option value="task">Volgende actie</option>
            </select>
          </Field>
          <Field
            label="Datum en tijd contactmoment"
            type="datetime-local"
            required
            max={dateInput()}
            value={form.at}
            onChange={(e) => change("at", e.target.value)}
          />
          <Field label="Tekst voor het dossier">
            <textarea
              rows={5}
              required
              maxLength={10000}
              value={form.body}
              onChange={(e) => change("body", e.target.value)}
            />
          </Field>
          {form.kind === "task" && (
            <Field
              label="Actie uitvoeren op"
              type="datetime-local"
              required
              value={form.dueAt}
              onChange={(e) => change("dueAt", e.target.value)}
            />
          )}
          {form.kind === "outgoing" && (
            <label className="checkbox">
              <input
                type="checkbox"
                required
                checked={form.confirmed}
                onChange={(e) => change("confirmed", e.target.checked)}
              />
              Ik heb dit bericht zelf op deze datum verzonden.
            </label>
          )}
          <button className="primary" disabled={busy}>
            Dossierregel opslaan
          </button>
        </form>
      </section>
      <section>
        <h3>Gespreksgeschiedenis</h3>
        {timeline.length ? (
          timeline.map((item) => (
            <article key={item.id} className="event">
              <strong>{item.label}</strong>
              <small>{localDate(item.at)}</small>
              <p className="prewrap">
                {item.kind === "status"
                  ? statusLabel[item.body] || item.body
                  : item.body}
              </p>
              {item.kind === "task" && (
                <>
                  <small>
                    Gepland: {localDate(item.dueAt)}
                    {item.completedAt ? " · Afgerond" : ""}
                  </small>
                  {!item.completedAt && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        action("journal.complete", { id: item.id })
                      }
                    >
                      Actie afronden
                    </button>
                  )}
                </>
              )}
            </article>
          ))
        ) : (
          <Empty title="Nog geen contactgeschiedenis.">
            Notities, berichten en afspraken komen hier samen.
          </Empty>
        )}
      </section>
    </div>
  );
}
