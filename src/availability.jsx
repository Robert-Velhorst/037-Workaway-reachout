import { useState } from "react";
import { Field, WorkawayLink } from "./components.jsx";
import { occupancyDays } from "../server/availability.mjs";
import { dateInput } from "./labels.js";
const statusNames = {
  inquiry: "Aanvraag",
  tentative: "Voorlopig",
  confirmed: "Bevestigd verblijf",
  closed: "Historisch / vervallen",
  unknown: "Nog onduidelijk",
};
function Entry({ entry, action, busy }) {
  const [editing, setEditing] = useState(false),
    [form, setForm] = useState(() => ({
      start: entry.start,
      end: entry.end,
      status: entry.status,
      precision: entry.precision,
      people: entry.people,
    }));
  const field = (k, value) => setForm((old) => ({ ...old, [k]: value }));
  return (
    <article className="panel">
      <h3>
        {entry.name} · {statusNames[entry.status]}
      </h3>
      <p>
        {entry.start
          ? `${entry.start} t/m ${entry.end}`
          : "Geen betrouwbare begin- en einddatum"}
        {entry.precision === "approximate" ? " · circa / flexibel" : ""}
      </p>
      <p>{entry.summary}</p>
      <small>
        {entry.reviewed
          ? "Door jou gecontroleerd"
          : "Indicatie uit correspondentie; nog niet door jou bevestigd"}
      </small>
      {entry.sourceReadAt && (
        <p className="footnote">
          Bron opnieuw gelezen op{" "}
          {new Date(entry.sourceReadAt).toLocaleString("nl-NL")}.
        </p>
      )}
      <details>
        <summary>Bronberichten bekijken</summary>
        {entry.evidence.map((e, i) => (
          <blockquote key={i}>
            <p className="prewrap">{e.quote}</p>
            <small>Workaway-bericht {e.messageId}</small>
          </blockquote>
        ))}
        <WorkawayLink url={entry.sourceUrl} label="Bronprofiel openen" />
      </details>
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => setEditing(!editing)}
      >
        Datums en status controleren
      </button>
      {editing && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await action("availability.review", { id: entry.id, ...form }))
              setEditing(false);
          }}
        >
          <div className="form-grid">
            <Field
              label="Aankomst"
              type="date"
              value={form.start}
              onChange={(e) => field("start", e.target.value)}
            />
            <Field
              label="Vertrek"
              type="date"
              value={form.end}
              onChange={(e) => field("end", e.target.value)}
            />
            <Field
              label="Aantal gasten"
              type="number"
              min="1"
              max="20"
              value={form.people}
              onChange={(e) => field("people", e.target.value)}
            />
            <Field label="Verblijfsstatus">
              <select
                value={form.status}
                onChange={(e) => field("status", e.target.value)}
              >
                {Object.entries(statusNames).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nauwkeurigheid van datums">
              <select
                value={form.precision}
                onChange={(e) => field("precision", e.target.value)}
              >
                <option value="day">Exacte dagen afgestemd</option>
                <option value="approximate">Circa / flexibel</option>
                <option value="unknown">Onbekend</option>
              </select>
            </Field>
          </div>
          <p>
            Een videoafspraak of reisaanvraag is geen bevestigd verblijf. Werk
            ook afspraken buiten Workaway bij voordat je een periode als vrij
            behandelt.
          </p>
          <button className="button" disabled={busy}>
            Gecontroleerde indicatie opslaan
          </button>
        </form>
      )}
    </article>
  );
}
export function Availability({ state, action, busy }) {
  const a = state.availability,
    [capacity, setCapacity] = useState(a.capacity),
    [start, setStart] = useState(() => dateInput(new Date()).slice(0, 10)),
    [end, setEnd] = useState(() =>
      dateInput(new Date(Date.now() + 90 * 86400000)).slice(0, 10),
    );
  const days = occupancyDays(a, start, end),
    groups = [];
  for (const d of days) {
    const previous = groups.at(-1),
      key = JSON.stringify([d.confirmed, d.possible, d.names]);
    if (previous?.key === key) previous.end = d.date;
    else groups.push({ ...d, key, start: d.date, end: d.date });
  }
  return (
    <section>
      <div className="panel">
        <h2>Bezetting en rustige periodes</h2>
        <p>
          Gebruik correspondentie als indicatie en bevestigde verblijven als
          bezetting. Een groen maandvakje of een aanvraag maakt geen zekere
          boeking. Ontbrekende afspraken kunnen dit overzicht veranderen.
        </p>
        <div className="form-grid">
          <Field
            label="Aantal beschikbare gastplaatsen"
            type="number"
            min="1"
            max="20"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
          <Field
            label="Vanaf"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <Field
            label="Tot en met"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => action("availability.capacity", { capacity })}
        >
          Gastplaatsen opslaan
        </button>
        {a.coverage && (
          <p className="footnote">
            Gelezen op {new Date(a.coverage.readAt).toLocaleString("nl-NL")}:{" "}
            {a.coverage.threads} gesprekken, {a.coverage.messages} berichten.{" "}
            {a.coverage.scope}
          </p>
        )}
        {!a.coverage && (
          <p>Er is nog geen correspondentieanalyse opgeslagen.</p>
        )}
        {a.entries.some(
          (e) => e.status !== "closed" && (!e.start || !e.end),
        ) && (
          <p role="status">
            Nog af te stemmen:{" "}
            {a.entries
              .filter((e) => e.status !== "closed" && (!e.start || !e.end))
              .map((e) => e.name)
              .join(", ")}
            . Zonder betrouwbare datums blokkeert de bezettingscontrole
            outreach.
          </p>
        )}
        <p>
          Bevestigen of wijzigen van bezetting pauzeert de automatische
          verzending. Dit overzicht start geen outreach.
        </p>
        {groups.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Periode</th>
                  <th>Bevestigde gasten</th>
                  <th>Mogelijke gasten</th>
                  <th>Indicatie</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.start}>
                    <td>
                      {g.start} – {g.end}
                    </td>
                    <td>
                      {g.confirmed} / {a.capacity}
                    </td>
                    <td>
                      {g.possible}
                      <p>{g.names.join(", ")}</p>
                    </td>
                    <td>
                      {g.remaining === 0
                        ? "Vol volgens bevestigde verblijven"
                        : g.possible >= g.remaining
                          ? "Eerst lopende aanvragen afstemmen"
                          : "Mogelijk ruimte; volledigheid controleren"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <GapControls
        key={JSON.stringify(a.gapPolicy)}
        policy={a.gapPolicy}
        action={action}
        busy={busy}
      />
      <ManualEntry action={action} busy={busy} />
      {a.entries.map((entry) => (
        <Entry
          key={JSON.stringify(entry)}
          entry={entry}
          action={action}
          busy={busy}
        />
      ))}
    </section>
  );
}

function GapControls({ policy, action, busy }) {
  const [form, setForm] = useState(policy),
    [checked, setChecked] = useState(false);
  const field = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        action("availability.gaps", { ...form, confirmed: checked });
      }}
    >
      <h3>Outreach voor rustige periodes</h3>
      <label>
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => field("enabled", e.target.checked)}
        />{" "}
        Alleen versturen als er een passend bezettingsgat is
      </label>
      <div className="form-grid">
        <Field
          label="Vooruitkijken (dagen)"
          type="number"
          min="14"
          max="366"
          value={form.lookAheadDays}
          onChange={(e) => field("lookAheadDays", Number(e.target.value))}
        />
        <Field
          label="Minimale verblijfsduur (dagen)"
          type="number"
          min="1"
          max="90"
          value={form.minimumDays}
          onChange={(e) => field("minimumDays", Number(e.target.value))}
        />
        <Field
          label="Bezetting gecontroleerd tot en met"
          type="date"
          value={form.reviewedThrough}
          onChange={(e) => field("reviewedThrough", e.target.value)}
        />
      </div>
      <p>
        Bevestigde verblijven en lopende aanvragen houden plaatsen bezet voor
        deze controle. Zonder betrouwbare datums wacht de tool. Gebruik exacte
        hostperiodes bij Mijn profiel. De controle blijft maximaal zeven dagen
        geldig; wijzigingen vereisen een nieuwe controle.
      </p>
      <label>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />{" "}
        Ik heb ook afspraken buiten Workaway en lopende aanvragen bijgewerkt.
      </label>
      <p>
        Huidige instelling:{" "}
        {policy.enabled ? "bezettingscontrole aan" : "bezettingscontrole uit"}.
        Dit opslaan start geen verzending; goedkeuringen en verzendlimieten
        blijven gelden.
      </p>
      <button className="button" disabled={busy || !checked}>
        Bezettingscontrole opslaan
      </button>
    </form>
  );
}
function ManualEntry({ action, busy }) {
  const [form, setForm] = useState({
    name: "",
    start: "",
    end: "",
    people: 1,
    status: "tentative",
    precision: "approximate",
  });
  const field = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  return (
    <details className="panel">
      <summary>Afspraak toevoegen (ook buiten Workaway)</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await action("availability.add", form))
            setForm({ ...form, name: "", start: "", end: "" });
        }}
      >
        <div className="form-grid">
          <Field
            label="Naam gast of afspraak"
            required
            value={form.name}
            onChange={(e) => field("name", e.target.value)}
          />
          <Field
            label="Aankomstdatum"
            type="date"
            value={form.start}
            onChange={(e) => field("start", e.target.value)}
          />
          <Field
            label="Vertrekdatum"
            type="date"
            value={form.end}
            onChange={(e) => field("end", e.target.value)}
          />
          <Field
            label="Gastplaatsen"
            type="number"
            min="1"
            max="20"
            value={form.people}
            onChange={(e) => field("people", Number(e.target.value))}
          />
          <Field label="Status afspraak">
            <select
              value={form.status}
              onChange={(e) => field("status", e.target.value)}
            >
              {Object.entries(statusNames).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Datumnauwkeurigheid">
            <select
              value={form.precision}
              onChange={(e) => field("precision", e.target.value)}
            >
              <option value="approximate">Circa / flexibel</option>
              <option value="day">Exacte dagen afgestemd</option>
              <option value="unknown">Onbekend</option>
            </select>
          </Field>
        </div>
        <button className="button" disabled={busy}>
          Afspraak toevoegen
        </button>
      </form>
    </details>
  );
}
