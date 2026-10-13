import { errorText } from "./errors.js";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  UserRound,
  Users,
  MessagesSquare,
  CalendarDays,
  Settings,
  Compass,
  Plus,
} from "lucide-react";
import { blankProfile, followUps, migrateState } from "../server/domain.mjs";
import { ProfileForm, Empty } from "./components.jsx";
import { DraftProvider } from "./drafts.jsx";
import { Candidates, Messages, Planner, Preferences } from "./pages.jsx";
import { localDate } from "./labels.js";
import { Automation } from "./automation.jsx";
import { Discovery } from "./discovery.jsx";
import { Availability } from "./availability.jsx";
const tabs = [
  ["Overzicht", LayoutDashboard],
  ["Mijn profiel", UserRound],
  ["Kandidaten", Users],
  ["Berichten", MessagesSquare],
  ["Verzending", Compass],
  ["Agenda", CalendarDays],
  ["Instellingen", Settings],
];
export default function App() {
  return (
    <DraftProvider>
      <Workspace />
    </DraftProvider>
  );
}
function Workspace() {
  const [state, setState] = useState(null),
    [page, setPage] = useState("Overzicht"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [adding, setAdding] = useState(false),
    [selected, setSelected] = useState("");
  const lock = useRef(false);
  const [, tick] = useState(0);
  async function refresh() {
    try {
      const r = await fetch("/api/state?schema=2.3.1", { cache: "no-store" });
      if (!r.ok) throw new Error("De werkruimte kon niet worden geladen.");
      const next = migrateState(await r.json());
      setState((old) => (!old || next.revision >= old.revision ? next : old));
      setError("");
    } catch (e) {
      setError(errorText(e.message));
    }
  }
  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      tick((x) => x + 1);
      if (!lock.current) void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function action(type, payload) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Reach-Out": "1" },
        body: JSON.stringify({ type, payload, revision: state.revision }),
      });
      const next = await r.json();
      if (!r.ok) throw new Error(next.error);
      setState(next);
      setNotice(
        type === "message.sent"
          ? "Vastgelegd als door jou verzonden. De app heeft niets verstuurd."
          : "Opgeslagen op deze computer.",
      );
      return true;
    } catch (e) {
      setError(errorText(e.message));
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const go = (p) => {
    setPage(p);
    setAdding(false);
  };
  const dossier = (id) => {
    setSelected(id);
    go("Kandidaten");
  };
  const props = {
    state,
    action,
    busy,
    notify: setNotice,
    onDossier: dossier,
    refresh,
  };
  const due = state ? followUps(state).filter((f) => f.due) : [];
  return (
    <div className="shell">
      <aside>
        <a href="#" className="brand" onClick={() => go("Overzicht")}>
          <span className="brand-icon">
            <Compass size={27} />
          </span>
          <span>
            Reach Out<small>VOOR WORKAWAY-UITWISSELINGEN</small>
          </span>
        </a>
        <div className="workspace-name">Jouw werkruimte</div>
        <nav>
          {tabs.map(([name, Icon]) => (
            <button
              key={name}
              className={`nav ${page === name ? "active" : ""}`}
              onClick={() => go(name)}
            >
              <Icon size={19} />
              {name}
              {name === "Berichten" && due.length > 0 && (
                <span className="count">{due.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="aside-bottom">
          <span className="dot" />
          Persoonlijk · Lokaal
          <p>
            Onafhankelijke hulp.
            <br />
            Niet verbonden aan Workaway.
          </p>
        </div>
      </aside>
      <div className="main-shell">
        <header>
          <span>Werkruimte / {page}</span>
          <span className="local-badge">
            <span className="dot" />
            Lokaal opgeslagen
          </span>
        </header>
        <main>
          {error && (
            <div className="alert" role="alert">
              {error}
              <button disabled={busy} onClick={refresh}>
                Werkruimte vernieuwen
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="toast">
              {notice}
            </div>
          )}
          {!state ? (
            <Empty title="Werkruimte openen…">
              {error || "Je opgeslagen gegevens worden geladen."}
            </Empty>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <h1>
                    {page === "Overzicht"
                      ? "Ruimte voor een mooie uitwisseling."
                      : page}
                  </h1>
                  <p>
                    {
                      {
                        Overzicht:
                          "Persoonlijke contacten, gedeelde interesses en heldere afspraken.",
                        "Mijn profiel":
                          "Jouw verhaal is het begin van iedere introductie.",
                        Kandidaten:
                          "Voeg zelf kandidaten toe en houd het contact bij.",
                        Berichten:
                          "Bereid persoonlijke berichten voor en verstuur ze zelf.",
                        Verzending:
                          "Automatische Workaway-acties zijn uitgeschakeld.",
                        Agenda: "Plan, wijzig of annuleer je afspraken.",
                        Instellingen:
                          "Jouw voorkeuren, sjablonen en herstelpunten.",
                      }[page]
                    }
                  </p>
                </div>
                {page === "Kandidaten" && (
                  <button
                    className="primary"
                    onClick={() => setAdding((x) => !x)}
                  >
                    <Plus size={16} />
                    {adding ? "Formulier sluiten" : "Kandidaat toevoegen"}
                  </button>
                )}
              </div>
              {page === "Overzicht" && (
                <>
                  <section className="welcome">
                    <div>
                      <span className="eyebrow">
                        PERSOONLIJK CONTACT BEGINT HIER
                      </span>
                      <h2>
                        {state.profile.name
                          ? `Welkom terug, ${state.profile.name}.`
                          : "Jouw volgende uitwisseling begint hier."}
                      </h2>
                      <p>
                        Bewaar profielen, ontdek overeenkomsten en bereid een
                        persoonlijke introductie voor. Jij houdt de regie over
                        ieder contact.
                      </p>
                      <button
                        className="primary"
                        onClick={() =>
                          go(state.profile.name ? "Kandidaten" : "Mijn profiel")
                        }
                      >
                        {state.profile.name
                          ? "Kandidaten bekijken"
                          : "Mijn profiel instellen"}
                      </button>
                    </div>
                    <div className="welcome-symbol">
                      <Compass size={110} strokeWidth={0.8} />
                      <span>
                        Bijzondere mensen.
                        <br />
                        Gedeelde mogelijkheden.
                      </span>
                    </div>
                  </section>
                  <div className="stats">
                    {[
                      ["Kandidaten", state.candidates.length, "Kandidaten"],
                      [
                        "Concepten",
                        state.messages.filter((m) => m.status === "draft")
                          .length,
                        "Berichten",
                      ],
                      ["Vervolgberichten nodig", due.length, "Berichten"],
                      [
                        "Reacties vastgelegd",
                        state.candidates.filter((c) => c.status === "replied")
                          .length,
                        "Kandidaten",
                      ],
                    ].map(([label, count, target]) => (
                      <button key={label} onClick={() => go(target)}>
                        <span>{label}</span>
                        <strong>{count}</strong>
                      </button>
                    ))}
                  </div>
                  <div className="grid two">
                    <section className="panel">
                      <h2>Volgende stappen</h2>
                      {[
                        [
                          "01",
                          "Jouw verhaal",
                          "Profiel, voorkeuren en harde eisen vastleggen.",
                          "Mijn profiel",
                        ],
                        [
                          "02",
                          "Gemeenschappelijke interesses",
                          "Kandidaten vergelijken en contact bijhouden.",
                          "Kandidaten",
                        ],
                        [
                          "03",
                          "Een persoonlijke introductie",
                          "Concepten bekijken en zelf in Workaway versturen.",
                          "Berichten",
                        ],
                      ].map(([n, title, desc, target]) => (
                        <button
                          key={n}
                          className="step"
                          onClick={() => go(target)}
                        >
                          <span className="step-number">{n}</span>
                          <span>
                            <strong>{title}</strong>
                            <small>{desc}</small>
                          </span>
                        </button>
                      ))}
                    </section>
                    <section className="panel">
                      <h2>Geplande acties</h2>
                      {state.journal?.filter(
                        (j) => j.kind === "task" && !j.completedAt,
                      ).length ? (
                        state.journal
                          .filter((j) => j.kind === "task" && !j.completedAt)
                          .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
                          .map((j) => (
                            <div className="event" key={j.id}>
                              <strong>{j.body}</strong>
                              <small>
                                {
                                  state.candidates.find(
                                    (c) => c.id === j.candidateId,
                                  )?.name
                                }{" "}
                                · {localDate(j.dueAt)}
                              </small>
                              <button
                                className="text-button"
                                onClick={() => dossier(j.candidateId)}
                              >
                                Dossier openen
                              </button>
                            </div>
                          ))
                      ) : (
                        <Empty title="Alles op een rij.">
                          Leg in een kandidaatdossier vast wat je als volgende
                          wilt doen.
                        </Empty>
                      )}
                    </section>
                  </div>
                  <p className="footnote">
                    Profielgegevens voer je zelf in. Automatische verzending
                    werkt uitsluitend via jouw gekoppelde browser, goedkeuring
                    en verzendregels.
                  </p>
                </>
              )}
              {page === "Mijn profiel" && (
                <section className="panel narrow">
                  <h2>Jouw hostprofiel</h2>
                  <ProfileForm
                    initial={state.profile}
                    own
                    busy={busy}
                    onSave={(p) => action("profile.save", p)}
                  />
                </section>
              )}
              {page === "Kandidaten" && (
                <>
                  <Discovery {...props} />
                  {adding && (
                    <section className="panel">
                      <h2>Een kandidaat toevoegen</h2>
                      <ProfileForm
                        initial={blankProfile}
                        busy={busy}
                        onSave={async (p) => {
                          const ok = await action("candidate.save", p);
                          if (ok) setAdding(false);
                          return ok;
                        }}
                      />
                    </section>
                  )}
                  <Candidates
                    {...props}
                    selected={selected}
                    setSelected={setSelected}
                  />
                </>
              )}
              {page === "Berichten" && <Messages {...props} />}
              {page === "Verzending" && <Automation {...props} />}
              {page === "Agenda" && (
                <>
                  <Availability {...props} />
                  <Planner {...props} />
                </>
              )}
              {page === "Instellingen" && <Preferences {...props} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
