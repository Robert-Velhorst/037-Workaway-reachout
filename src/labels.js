export const statusLabel = {
  new: "Nieuw",
  shortlisted: "Op shortlist",
  contacted: "Benaderd",
  replied: "Gereageerd",
  declined: "Afgewezen",
  "do-not-contact": "Niet benaderen",
  archived: "Gearchiveerd",
  draft: "Concept",
  sent: "Verzonden vastgelegd",
  cancelled: "Geannuleerd",
  planned: "Gepland",
};
export const skillLabel = {
  gardening: "tuinieren",
  cooking: "koken",
  "animal care": "dierenverzorging",
  childcare: "kinderopvang",
  teaching: "lesgeven",
  carpentry: "timmerwerk",
  cleaning: "schoonmaken",
  painting: "schilderen",
  farming: "landbouw",
  english: "Engels",
  dutch: "Nederlands",
  german: "Duits",
  french: "Frans",
  spanish: "Spaans",
  italian: "Italiaans",
};
export const showTags = (items) =>
  (items || []).map((x) => skillLabel[x] || x).join(", ");
export const localDate = (value) =>
  value ? new Date(value).toLocaleString("nl-NL") : "";
export const dateInput = (value) => {
  const d = value ? new Date(value) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
