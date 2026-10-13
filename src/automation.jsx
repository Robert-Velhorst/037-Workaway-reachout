const policyNotice =
  "Workaway’s published terms prohibit software access to its pages and spam messages. Reach Out therefore cannot connect to Workaway, collect profiles, or send messages automatically.";

export function Automation({ state, action, busy }) {
  const active = state.automation.active;
  return (
    <section className="panel">
      <h2>Automatische Workaway-acties zijn uitgeschakeld</h2>
      <p role="note">{policyNotice}</p>
      <p>
        Je kunt in Reach Out zelf kandidaten, beschikbaarheid en berichten
        beheren. Open Workaway zelf om een profiel te bekijken en stuur een
        gecontroleerd, persoonlijk bericht daar handmatig.
      </p>
      <p>
        Automatische toegang kan alleen worden ingeschakeld als Workaway die
        specifieke integratie schriftelijk toestaat. De app accepteert geen
        extensiekoppeling en heeft geen instelling om deze blokkade te
        omzeilen.
      </p>
      {active && (
        <div className="alert" role="alert">
          Een oude werkruimte meldt nog een actieve campagne. Zet deze nu uit.
          <button
            className="secondary"
            disabled={busy}
            onClick={() => action("automation.pause", {})}
          >
            Campagne pauzeren
          </button>
        </div>
      )}
      <a
        href="https://www.workaway.info/en/info/terms-conditions"
        target="_blank"
        rel="noreferrer"
      >
        Lees de actuele Workaway-voorwaarden
      </a>
    </section>
  );
}
