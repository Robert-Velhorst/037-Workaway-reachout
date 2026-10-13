import { errorText } from "./errors.js";
import { useEffect, useState } from "react";
import { followUps, validateBackup } from "../server/domain.mjs";
import {
  Field,
  Empty,
  WorkawayLink,
  Download,
  Conflict,
} from "./components.jsx";
import { useDraft } from "./drafts.jsx";
import { MAX_WORKSPACE_BYTES } from "../server/limits.mjs";
import { statusLabel, localDate, dateInput } from "./labels.js";
export function Messages(props) {
  const { state, action, busy, onDossier } = props;
  const [filter, setFilter] = useState("draft");
  const due = followUps(state).filter(
    (f) =>
      f.due &&
      !state.messages.some(
        (m) => m.candidateId === f.candidateId && m.status === "draft",
      ),
  );
  return (
    <>
      <div className="info-strip">
        Controleer ieder concept en verstuur het zelf in Workaway. Reach Out
        bewaart alleen de status die jij vastlegt en controleert geen reacties.
        Leg antwoorden zelf vast in het dossier.
      </div>
      {due.length > 0 && (
        <section className="panel">
          <h2>Tijd voor een vervolg</h2>
          {due.map((f) => (
            <FollowUp
              key={f.candidateId}
              {...props}
              candidate={state.candidates.find((c) => c.id === f.candidateId)}
              due={f.dueAt}
            />
          ))}
        </section>
      )}
      <div className="tabs" role="group" aria-label="Berichtstatus">
        {["draft", "sent", "cancelled"].map((x) => (
          <button
            key={x}
            className={filter === x ? "active" : ""}
            onClick={() => setFilter(x)}
          >
            {statusLabel[x]}{" "}
            <span>{state.messages.filter((m) => m.status === x).length}</span>
          </button>
        ))}
      </div>
      <div className="message-list">
        {state.messages.filter((m) => m.status === filter).length ? (
          state.messages
            .filter((m) => m.status === filter)
            .slice()
            .reverse()
            .map((m) => (
              <MessageEditor
                key={m.id}
                {...props}
                message={m}
                candidate={state.candidates.find((c) => c.id === m.candidateId)}
              />
            ))
        ) : (
          <section className="panel">
            <Empty title="Geen berichten in deze selectie.">
              Bereid een introductie voor vanuit een kandidaatdossier.
            </Empty>
          </section>
        )}
      </div>
      {state.candidates.some((c) => c.status === "contacted") && (
        <section className="panel">
          <h2>Wachten op een reactie</h2>
          {state.candidates
            .filter((c) => c.status === "contacted")
            .map((c) => (
              <div className="waiting-row" key={c.id}>
                <div>
                  <strong>{c.name}</strong>
                  <small>
                    {(() => {
                      const f = followUps(state).find(
                        (f) => f.candidateId === c.id,
                      );
                      return f
                        ? `Volgende herinnering: ${localDate(f.dueAt)}`
                        : "Geen verdere herinnering gepland";
                    })()}
                  </small>
                </div>
                <div className="actions">
                  <button className="secondary" onClick={() => onDossier(c.id)}>
                    Reactie in dossier vastleggen
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      action("candidate.status", {
                        candidateId: c.id,
                        status: "do-not-contact",
                      })
                    }
                  >
                    Niet meer benaderen
                  </button>
                </div>
              </div>
            ))}
        </section>
      )}
    </>
  );
}
function MessageEditor({
  message,
  candidate,
  action,
  busy,
  notify,
  onDossier,
}) {
  const [body, setBody, clear, draft] = useDraft(
    "message-" + message.id,
    message.body,
  );
  const [confirmed, setConfirmed] = useState(false);
  return (
    <article className="panel">
      <div className="section-heading">
        <h2>{candidate.name}</h2>
        <WorkawayLink url={candidate.url} />
      </div>
      <small>
        {message.kind === "followup"
          ? "Vervolgbericht"
          : message.kind === "historical"
            ? "Eerder verzonden bericht"
            : "Eerste introductie"}{" "}
        · {statusLabel[message.status]}
      </small>
      {message.status === "draft" ? (
        <>
          <Conflict draft={draft} clear={clear} />
          <Field label={`Bericht aan ${candidate.name}`}>
            <textarea
              rows={10}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setConfirmed(false);
              }}
            />
          </Field>
          <div className="actions">
            <button
              className="secondary"
              disabled={busy || draft.conflict}
              onClick={async () => {
                if (await action("message.save", { id: message.id, body }))
                  clear();
              }}
            >
              Bewerkingen opslaan
            </button>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(body);
                  notify("Gekopieerd. Verstuur het bericht zelf in Workaway.");
                } catch {
                  notify(
                    "Kopiëren lukt niet. Selecteer en kopieer de tekst handmatig.",
                  );
                }
              }}
            >
              Bericht kopiëren
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                if (await action("message.cancel", { id: message.id })) clear();
              }}
            >
              Concept annuleren
            </button>
          </div>
          <div className="send-record">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Ik heb dit exacte bericht in Workaway verzonden.
            </label>
            <button
              className="primary"
              disabled={!confirmed || busy || draft.conflict}
              onClick={async () => {
                if (
                  await action("message.sent", {
                    id: message.id,
                    body,
                    confirmed,
                  })
                )
                  clear();
              }}
            >
              Als verzonden vastleggen
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="prewrap">{message.body}</p>
          <small>
            {message.sentAt
              ? `Verzonden op ${localDate(message.sentAt)} · door jou vastgelegd`
              : ""}
          </small>
        </>
      )}
      <button className="text-button" onClick={() => onDossier(candidate.id)}>
        Gespreksdossier openen
      </button>
    </article>
  );
}
function FollowUp({ candidate, due, action, busy, onDossier }) {
  const [body, setBody, clear] = useDraft("followup-" + candidate.id, "");
  return (
    <form
      className="followup-row"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await action("message.followup", { candidateId: candidate.id, body })
        )
          clear();
      }}
    >
      <strong>{candidate.name}</strong>
      <small>Vanaf {localDate(due)}. Controleer eerst de Workaway-inbox.</small>
      <Field label={`Vervolgbericht aan ${candidate.name}`}>
        <textarea
          required
          minLength={20}
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <div className="actions">
        <button className="primary" disabled={busy}>
          Vervolgconcept voorbereiden
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => onDossier(candidate.id)}
        >
          Reactie vastleggen
        </button>
      </div>
    </form>
  );
}
export function Planner(props) {
  const { state, action, busy } = props;
  const [editing, setEditing] = useState("");
  const existing = state.events.find((e) => e.id === editing);
  return (
    <div className="grid two">
      <section className="panel">
        <h2>{existing ? "Afspraak wijzigen" : "Een gesprek plannen"}</h2>
        <p className="muted">
          Tijden gebruiken jouw computertijdzone. Exporteren verstuurt geen
          uitnodigingen.
        </p>
        {state.candidates.length ? (
          <EventForm
            key={editing || "new"}
            {...props}
            existing={existing}
            done={() => setEditing("")}
          />
        ) : (
          <Empty title="Voeg eerst een kandidaat toe.">
            Daarna kun je een afspraak plannen.
          </Empty>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Jouw afspraken</h2>
          <Download href="/api/calendar">Agenda exporteren</Download>
        </div>
        {state.events.length ? (
          state.events
            .slice()
            .sort((a, b) => a.start.localeCompare(b.start))
            .map((e) => (
              <article className="event" key={e.id}>
                <strong>{e.title}</strong>
                <small>
                  {state.candidates.find((c) => c.id === e.candidateId)?.name} ·{" "}
                  {statusLabel[e.status || "planned"]}
                </small>
                <p>
                  {localDate(e.start)} · {e.duration} minuten
                </p>
                {e.status !== "cancelled" && (
                  <div className="actions">
                    <button
                      className="secondary"
                      onClick={() => setEditing(e.id)}
                    >
                      Wijzigen
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => action("event.cancel", { id: e.id })}
                    >
                      Afspraak annuleren
                    </button>
                  </div>
                )}
              </article>
            ))
        ) : (
          <Empty title="Nog geen afspraken.">
            Plan hier een gesprek of uitwisseling.
          </Empty>
        )}
      </section>
    </div>
  );
}
function EventForm({ state, action, busy, existing, done }) {
  const initial = {
    candidateId: existing?.candidateId || state.candidates[0]?.id || "",
    title: existing?.title || "",
    start: existing ? dateInput(existing.start) : "",
    duration: existing?.duration || 30,
  };
  const [form, set, clear, draft] = useDraft(
    "event-" + (existing?.id || "new"),
    initial,
  );
  const change = (k, v) => set((f) => ({ ...f, [k]: v }));
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await action("event.save", {
            ...form,
            id: existing?.id,
            start: new Date(form.start).toISOString(),
            duration: Number(form.duration),
          })
        ) {
          clear();
          done();
        }
      }}
    >
      <Conflict draft={draft} clear={clear} />
      <Field label="Kandidaat voor afspraak">
        <select
          value={form.candidateId}
          onChange={(e) => change("candidateId", e.target.value)}
        >
          {state.candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Titel afspraak"
        required
        value={form.title}
        onChange={(e) => change("title", e.target.value)}
      />
      <Field
        label="Datum en tijd afspraak"
        required
        type="datetime-local"
        value={form.start}
        onChange={(e) => change("start", e.target.value)}
      />
      <Field
        label="Duur in minuten"
        required
        type="number"
        min={5}
        max={480}
        value={form.duration}
        onChange={(e) => change("duration", e.target.value)}
      />
      <div className="actions">
        <button className="primary" disabled={busy || draft.conflict}>
          Afspraak opslaan
        </button>
        {existing && (
          <button type="button" className="text-button" onClick={done}>
            Bewerking sluiten
          </button>
        )}
      </div>
    </form>
  );
}
export function Preferences(props) {
  const { state, action, busy } = props;
  const [form, set, clear, draft] = useDraft("preferences", state.settings);
  return (
    <div className="form-stack">
      <section className="panel">
        <h2>Herinneringen</h2>
        <p className="muted">
          Herinneringen worden berekend terwijl de app openstaat. Een reactie of
          niet-benaderenstatus stopt verdere herinneringen.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await action("settings.save", form)) clear();
          }}
        >
          <Conflict draft={draft} clear={clear} />
          <div className="grid two">
            <Field
              label="Dagen na het laatste bericht"
              type="number"
              min={1}
              max={90}
              required
              value={form.followUpDays}
              onChange={(e) =>
                set((f) => ({ ...f, followUpDays: Number(e.target.value) }))
              }
            />
            <Field
              label="Maximaal aantal vervolgberichten"
              type="number"
              min={0}
              max={3}
              required
              value={form.maxFollowUps}
              onChange={(e) =>
                set((f) => ({ ...f, maxFollowUps: Number(e.target.value) }))
              }
            />
          </div>
          <button className="primary" disabled={busy || draft.conflict}>
            Voorkeuren opslaan
          </button>
        </form>
      </section>
      <Templates {...props} />
      <Backups {...props} />
      <section className="panel">
        <h2>Workaway-platformstatus</h2>
        <p>
          Deze app heeft geen browserkoppeling met Workaway. Voeg kandidaten
          zelf toe, controleer hun profiel op het platform en verstuur berichten
          zelf. Tekstsuggesties en matching werken lokaal; er wordt geen
          AI-dienst aangeroepen.
        </p>
        <a
          href="https://www.workaway.info/en/info/terms-conditions"
          target="_blank"
          rel="noreferrer"
        >
          Voorwaarden van Workaway bekijken
        </a>
      </section>
    </div>
  );
}
function Templates(props) {
  const [language, setLanguage] = useState("nl");
  return (
    <section className="panel">
      <h2>Berichtsjablonen</h2>
      <Field label="Sjabloontaal">
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="nl">Nederlands</option>
          <option value="en">Engels</option>
        </select>
      </Field>
      <TemplateEditor key={language} {...props} language={language} />
    </section>
  );
}
function TemplateEditor({ state, action, busy, language }) {
  const [body, setBody, clear, draft] = useDraft(
    "template-" + language,
    state.templates[language],
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (await action("template.save", { language, body })) clear();
      }}
    >
      <Conflict draft={draft} clear={clear} />
      <Field label="Sjabloontekst">
        <textarea
          required
          rows={10}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <p className="muted">
        Velden:{" "}
        {
          "{name}, {hostName}, {location}, {project}, {sharedSkills}, {personalNote}, {availability}"
        }
        . Een persoonlijke notitie is verplicht. Profielteksten worden niet
        automatisch vertaald.
      </p>
      <button className="primary" disabled={busy || draft.conflict}>
        Sjabloon opslaan
      </button>
    </form>
  );
}
function Backups({ state, action, busy, notify }) {
  const [backups, setBackups] = useState([]),
    [selection, setSelection] = useState(null),
    [upload, setUpload] = useState(null),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/backups")
      .then(async (r) => {
        if (!r.ok) throw new Error("Herstelpunten laden mislukt.");
        return r.json();
      })
      .then((b) => {
        if (active) setBackups(b);
      })
      .catch((e) => {
        if (active) setError(errorText(e.message));
      });
    return () => {
      active = false;
    };
  }, [state.revision]);
  const chosen = selection ? backups.find((b) => b.id === selection) : upload;
  return (
    <section className="panel">
      <h2>Back-ups en volledig herstel</h2>
      <p>
        Vóór iedere opgeslagen wijziging wordt automatisch een herstelpunt
        bewaard in de lokale gegevensmap. Herstel vervangt de werkruimte door
        jouw gekozen momentopname, inclusief berichten en statussen. De huidige
        toestand krijgt eerst een eigen herstelpunt.
      </p>
      <Download href="/api/export">Volledige back-up downloaden</Download>
      <Field
        label="Back-upbestand kiezen"
        type="file"
        accept=".json,application/json"
        onChange={async (e) => {
          setUpload(null);
          setSelection(null);
          setConfirmed(false);
          setError("");
          try {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > MAX_WORKSPACE_BYTES)
              throw new Error("Gebruik een back-up van maximaal 32 MB.");
            const b = validateBackup(JSON.parse(await file.text()));
            setUpload(b);
          } catch (e) {
            setError(errorText(e.message));
          }
        }}
      />
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <Field label="Automatisch herstelpunt">
        <select
          value={selection || ""}
          onChange={(e) => {
            setSelection(e.target.value || null);
            setUpload(null);
            setConfirmed(false);
          }}
        >
          <option value="">Kies een herstelpunt</option>
          {backups.map((b) => (
            <option key={b.id} value={b.id} disabled={b.invalid}>
              {b.invalid
                ? "Beschadigd herstelpunt"
                : `Versie ${b.revision} · ${b.at ? localDate(b.at) : "Lege beginstand"} · ${b.candidates} kandidaten`}
            </option>
          ))}
        </select>
      </Field>
      {chosen && (
        <div className="restore-preview">
          <h3>Controle vóór herstel</h3>
          <table>
            <thead>
              <tr>
                <th>Gegevens</th>
                <th>Nu</th>
                <th>Na herstel</th>
              </tr>
            </thead>
            <tbody>
              {["candidates", "messages", "events"].map((key, i) => (
                <tr key={key}>
                  <td>{["Kandidaten", "Berichten", "Afspraken"][i]}</td>
                  <td>{state[key].length}</td>
                  <td>
                    {Array.isArray(chosen[key])
                      ? chosen[key].length
                      : chosen[key]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Ik wil deze volledige back-up terugzetten, inclusief
            contactgeschiedenis en statussen.
          </label>
          <div className="actions">
            <button
              className="primary"
              disabled={!confirmed || busy}
              onClick={async () => {
                if (
                  await action("backup.restore", {
                    backupId: selection || undefined,
                    backup: selection ? undefined : upload,
                    confirmed,
                  })
                ) {
                  setSelection(null);
                  setUpload(null);
                  setConfirmed(false);
                  notify(
                    "Hersteld. Onopgeslagen formulieren blijven behouden; laad bij conflicten eerst de actuele gegevens.",
                  );
                }
              }}
            >
              Volledige back-up herstellen
            </button>
            {upload && (
              <button
                className="secondary"
                disabled={busy}
                onClick={async () => {
                  if (await action("backup.merge", { backup: upload })) {
                    setUpload(null);
                    notify(
                      "Alleen nieuwe kandidaatprofielen toegevoegd. Bestaande geschiedenis bleef behouden.",
                    );
                  }
                }}
              >
                Alleen nieuwe kandidaten toevoegen
              </button>
            )}
          </div>
        </div>
      )}
      <p className="muted">
        Back-ups bevatten privégegevens en worden niet automatisch verwijderd.
        Bewaar af en toe een download op een andere veilige plek; lokale
        herstelpunten beschermen niet tegen een defecte schijf.
      </p>
    </section>
  );
}
