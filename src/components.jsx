import { useState } from "react";
import { ExternalLink, Save } from "lucide-react";
import { suggestProfile, ranges } from "../server/matching.mjs";
import { useDraft } from "./drafts.jsx";
import { showTags } from "./labels.js";
export function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}
export function Empty({ title, children }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function WorkawayLink({ url, label = "Profiel openen" }) {
  return url ? (
    <a className="button secondary" href={url} target="_blank" rel="noreferrer">
      {label}
      <ExternalLink size={15} />
    </a>
  ) : null;
}
export function Download({ href, children }) {
  return (
    <a className="button secondary" href={href} download>
      {children}
    </a>
  );
}
export function Conflict({ draft, clear }) {
  return draft.conflict ? (
    <div role="alert" className="alert">
      De opgeslagen gegevens zijn intussen gewijzigd. Kopieer eerst de tekst die
      je wilt behouden. Daarna kun je de actuele gegevens laden.
      <button type="button" onClick={clear}>
        Actuele gegevens laden
      </button>
    </div>
  ) : null;
}
export function ProfileForm({ initial, onSave, own = false, busy }) {
  const r = ranges(initial);
  const initialForm = {
    ...initial,
    skills: (initial.skills || []).join(", "),
    languages: (initial.languages || []).join(", "),
    requiredSkills: (initial.requiredSkills || []).join(", "),
    requiredLanguages: (initial.requiredLanguages || []).join(", "),
    minOverlapDays: initial.minOverlapDays || 1,
    start: r[0]?.start || "",
    end: r[0]?.end || "",
    extraPeriods: r.slice(1),
  };
  const [form, setForm, clear, draft] = useDraft(
    own ? "host-profile" : `candidate-${initial.id || "new"}`,
    initialForm,
  );
  const [suggestions, setSuggestions] = useState(null),
    [selected, setSelected] = useState([]),
    [error, setError] = useState("");
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const changePeriod = (i, key, value) =>
    set(
      "extraPeriods",
      form.extraPeriods.map((p, j) => (i === j ? { ...p, [key]: value } : p)),
    );
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (draft.conflict) return;
        const periods = [
          ...(form.start || form.end
            ? [{ start: form.start, end: form.end }]
            : []),
          ...form.extraPeriods,
        ];
        if (await onSave({ ...form, periods })) clear();
      }}
    >
      <Conflict draft={draft} clear={clear} />
      <details>
        <summary>Profieltekst herkennen</summary>
        <p className="muted">
          Plak tekst die je mag gebruiken. Herkenning gebeurt lokaal met een
          beperkte woordenlijst en expliciete datums (jjjj-mm-dd of dd-mm-jjjj).
          Controleer ieder voorstel; context en ontkenningen kunnen ontbreken.
        </p>
        <Field label="Oorspronkelijke profieltekst">
          <textarea
            rows={6}
            maxLength={50000}
            value={form.sourceText || ""}
            onChange={(e) => {
              set("sourceText", e.target.value);
              setSuggestions(null);
              setSelected([]);
            }}
          />
        </Field>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            try {
              setSuggestions(suggestProfile(form.sourceText || ""));
              setSelected([]);
              setError("");
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Voorstellen bekijken
        </button>
        {error && <p role="alert">{error}</p>}
        {suggestions && (
          <div className="suggestions">
            <p>{suggestions.notice}</p>
            {!suggestions.proposals.length && (
              <p>
                Geen herkenbare velden gevonden. Vul de gegevens hieronder zelf
                in.
              </p>
            )}
            {suggestions.proposals.map((p, i) => (
              <label className="suggestion" key={i}>
                <input
                  type="checkbox"
                  checked={selected.includes(i)}
                  onChange={(e) =>
                    setSelected((ids) =>
                      e.target.checked
                        ? [...ids, i]
                        : ids.filter((id) => id !== i),
                    )
                  }
                />
                <span>
                  <strong>
                    {
                      {
                        name: "Naam",
                        location: "Locatie",
                        skills: "Vaardigheid",
                        languages: "Taal",
                        periods: "Periode",
                      }[p.field]
                    }
                    :{" "}
                    {typeof p.value === "object"
                      ? `${p.value.start} — ${p.value.end}`
                      : showTags([p.value])}
                  </strong>
                  <small>Bron: {p.evidence}</small>
                </span>
              </label>
            ))}
            {suggestions.warnings.map((w, i) => (
              <p className="muted" key={i}>
                {w}
              </p>
            ))}
            <button
              type="button"
              className="secondary"
              disabled={!selected.length}
              onClick={() => {
                setForm((f) => {
                  const next = { ...f };
                  for (const i of selected) {
                    const p = suggestions.proposals[i];
                    if (["skills", "languages"].includes(p.field))
                      next[p.field] = [
                        ...new Set([
                          ...next[p.field]
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                          p.value,
                        ]),
                      ].join(", ");
                    else if (p.field === "periods") {
                      if (!next.start && !next.end) {
                        next.start = p.value.start;
                        next.end = p.value.end;
                      } else if (
                        ![
                          { start: next.start, end: next.end },
                          ...next.extraPeriods,
                        ].some(
                          (x) =>
                            x.start === p.value.start && x.end === p.value.end,
                        )
                      )
                        next.extraPeriods = [...next.extraPeriods, p.value];
                    } else next[p.field] = p.value;
                  }
                  return next;
                });
                setSuggestions(null);
              }}
            >
              Geselecteerde voorstellen overnemen
            </button>
          </div>
        )}
      </details>
      <div className="grid two">
        <Field
          label={own ? "Jouw naam / hostnaam" : "Naam"}
          value={form.name}
          required
          maxLength={120}
          onChange={(e) => set("name", e.target.value)}
        />
        <Field
          label="Workaway-profiel URL"
          type="url"
          value={form.url || ""}
          onChange={(e) => set("url", e.target.value)}
        />
      </div>
      <Field
        label={own ? "Locatie" : "Locatie of gewenste bestemming"}
        value={form.location}
        onChange={(e) => set("location", e.target.value)}
      />
      <Field
        label={own ? "Jouw project en wat je biedt" : "Profielsamenvatting"}
      >
        <textarea
          rows={4}
          maxLength={10000}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
      <div className="grid two">
        <Field
          label={
            own ? "Gewenste vaardigheden (komma’s)" : "Vaardigheden (komma’s)"
          }
          value={form.skills}
          onChange={(e) => set("skills", e.target.value)}
        />
        <Field
          label="Talen (komma’s)"
          value={form.languages}
          onChange={(e) => set("languages", e.target.value)}
        />
      </div>
      <h3>Beschikbaarheid</h3>
      <div className="grid two">
        <Field
          label="Beschikbaar vanaf"
          type="date"
          value={form.start}
          onChange={(e) => set("start", e.target.value)}
        />
        <Field
          label="Beschikbaar tot"
          type="date"
          min={form.start || undefined}
          value={form.end}
          onChange={(e) => set("end", e.target.value)}
        />
      </div>
      {form.extraPeriods.map((p, i) => (
        <div className="period-row" key={i}>
          <Field
            label={`Periode ${i + 2} vanaf`}
            type="date"
            required
            value={p.start}
            onChange={(e) => changePeriod(i, "start", e.target.value)}
          />
          <Field
            label={`Periode ${i + 2} tot`}
            type="date"
            required
            min={p.start || undefined}
            value={p.end}
            onChange={(e) => changePeriod(i, "end", e.target.value)}
          />
          <button
            type="button"
            className="text-button"
            onClick={() =>
              set(
                "extraPeriods",
                form.extraPeriods.filter((_, j) => i !== j),
              )
            }
          >
            Weglaten
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary"
        disabled={form.extraPeriods.length >= 29}
        onClick={() =>
          set("extraPeriods", [...form.extraPeriods, { start: "", end: "" }])
        }
      >
        Periode toevoegen
      </button>
      {own && (
        <details>
          <summary>Harde eisen en voorkeuren</summary>
          <p>
            Vaardigheden en talen hierboven zijn voorkeuren voor de score. Alle
            eisen hieronder moeten bevestigd zijn voordat je een introductie
            kunt voorbereiden.
          </p>
          <Field
            label="Vereiste vaardigheden (komma’s)"
            value={form.requiredSkills}
            onChange={(e) => set("requiredSkills", e.target.value)}
          />
          <Field
            label="Vereiste talen (komma’s)"
            value={form.requiredLanguages}
            onChange={(e) => set("requiredLanguages", e.target.value)}
          />
          <Field
            label="Minimaal aaneengesloten beschikbare dagen"
            type="number"
            min={1}
            max={365}
            required
            value={form.minOverlapDays}
            onChange={(e) => set("minOverlapDays", Number(e.target.value))}
          />
        </details>
      )}
      {!own && (
        <Field label="Privénotities">
          <textarea
            rows={3}
            maxLength={10000}
            value={form.notes || ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
      )}
      <div className="actions">
        <button className="primary" disabled={busy || draft.conflict}>
          <Save size={16} />
          {own ? "Mijn profiel opslaan" : "Kandidaat opslaan"}
        </button>
        {draft.dirty && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              if (
                window.confirm(
                  "Onopgeslagen wijzigingen in dit formulier verwerpen?",
                )
              )
                clear();
            }}
          >
            Wijzigingen verwerpen
          </button>
        )}
      </div>
    </form>
  );
}
