const errors = {
  "Invalid or oversized text": "De tekst is ongeldig of te lang.",
  "Use an HTTPS workaway.info profile link":
    "Gebruik een beveiligde profiel-URL van workaway.info.",
  "Invalid date": "Vul een geldige datum in.",
  "Profile is required": "Profielgegevens ontbreken.",
  "Name is required": "Vul een naam in.",
  "Provide both availability dates or leave both empty":
    "Vul beide beschikbaarheidsdatums in of laat beide leeg.",
  "End date must be after start date":
    "De einddatum mag niet vóór de begindatum liggen.",
  "Unsupported language": "Kies Nederlands of Engels.",
  "Complete your name, location and project description first":
    "Vul eerst je naam, locatie en projectomschrijving in.",
  "Add a specific personal note of at least 10 characters":
    "Voeg een specifieke persoonlijke notitie toe van minimaal 10 tekens.",
  "Availability does not overlap; update the dates before drafting":
    "De beschikbaarheid overlapt niet voldoende. Controleer de datums.",
  "Candidate not found": "De kandidaat is niet gevonden.",
  "This profile is already saved": "Dit profiel is al opgeslagen.",
  "Invalid status": "Kies een geldige status.",
  "Record a sent message first":
    "Leg eerst een daadwerkelijk verzonden bericht vast.",
  "Initial outreach is only available for new or shortlisted candidates":
    "Een eerste introductie kan alleen voor nieuwe kandidaten of kandidaten op de shortlist.",
  "An outreach message already exists":
    "Er bestaat al een introductie voor deze kandidaat.",
  "No follow-up is due": "Er is nog geen vervolgbericht nodig.",
  "A draft already exists": "Er bestaat al een concept.",
  "Write a personal follow-up of at least 20 characters":
    "Schrijf een persoonlijk vervolgbericht van minimaal 20 tekens.",
  "Only an existing draft can be changed":
    "Alleen een bestaand concept kan worden gewijzigd.",
  "Outreach is stopped for this candidate":
    "Deze kandidaat wordt niet meer benaderd.",
  "Message must contain at least 20 characters":
    "Het bericht moet minimaal 20 tekens bevatten.",
  "Resolve all template fields first": "Vul eerst alle sjabloonvelden in.",
  "Confirm that you sent this message in Workaway":
    "Bevestig dat je dit bericht zelf in Workaway hebt verzonden.",
  "Follow-up is no longer due": "Dit vervolgbericht is niet meer nodig.",
  "Template is too short": "Het sjabloon is te kort.",
  "Include {personalNote} for individual personalization":
    "Neem {personalNote} op voor een persoonlijke introductie.",
  "Reminder interval must be 1–90 days":
    "Kies 1 tot 90 dagen voor de herinnering.",
  "Follow-up limit must be 0–3": "Kies maximaal 0 tot 3 vervolgberichten.",
  "Event title is required": "Vul een titel voor de afspraak in.",
  "Invalid event time": "Vul een geldige afspraaktijd in.",
  "Duration must be 5–480 minutes": "Kies een duur van 5 tot 480 minuten.",
  "Unsupported backup": "Dit back-upbestand wordt niet ondersteund.",
  "Too many profiles": "Het bestand bevat te veel profielen.",
  "Unknown action": "Deze actie wordt niet ondersteund.",
  "Failed to fetch":
    "De lokale server is niet bereikbaar. Start de tool en probeer opnieuw.",
  "Invalid time value": "Vul een geldige datum en tijd in.",
  "Invalid URL": "Vul een geldige profiel-URL in.",
  "Import is too large (maximum 4 MB)":
    "Het bestand is te groot (maximaal 4 MB).",
  "This workspace changed in another tab. Your edit was not saved. Refresh and try again.":
    "De werkruimte is in een ander tabblad gewijzigd. Je wijziging is niet opgeslagen. Vernieuw de werkruimte; jouw invoer blijft behouden.",
};
export function errorText(message) {
  if (errors[message]) return errors[message];
  if (message.startsWith("Unknown template field:"))
    return "Onbekend sjabloonveld: " + message.split(":").slice(1).join(":");
  return message;
}
