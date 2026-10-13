import { WorkawayLink } from "./components.jsx";

export function Discovery() {
  return (
    <section className="panel">
      <h2>Voeg kandidaten zelf toe</h2>
      <p>
        Reach Out doorzoekt Workaway niet. Open het platform zelf, controleer
        of iemand contacteerbaar is en voeg alleen de gegevens toe die je nodig
        hebt om een persoonlijk bericht voor te bereiden.
      </p>
      <p>
        Behandel reismaanden als een indicatie. Vraag de Workawayer zelf naar
        precieze aankomst- en vertrekdatums voordat je iets afspreekt.
      </p>
      <WorkawayLink
        url="https://www.workaway.info/en/info/terms-conditions"
        label="Workaway-voorwaarden"
      />
    </section>
  );
}
