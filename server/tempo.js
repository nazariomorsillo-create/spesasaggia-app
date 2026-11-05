// Date in ora italiana, come testo AAAA-MM-GG
const FMT = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
// nelle prove automatiche si può fissare il giorno (OGGI_PROVA), così i dati d'esempio non "scadono"
export const oggi = () => process.env.OGGI_PROVA || FMT.format(new Date());
const g = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const giorniTra = (a, b) => Math.round((g(b) - g(a)) / 864e5);
export function piuGiorni(d, n) { return new Date(g(d) + n * 864e5).toISOString().slice(0, 10); }
// Settimana lunedì-domenica che contiene la data (default per l'ortofrutta)
export function settimana(d) {
  const dow = new Date(g(d)).getUTCDay(); // 0 = domenica
  const lun = piuGiorni(d, dow === 0 ? -6 : 1 - dow);
  return { dal: lun, al: piuGiorni(lun, 6) };
}
export const DATA = /^\d{4}-\d{2}-\d{2}$/;
