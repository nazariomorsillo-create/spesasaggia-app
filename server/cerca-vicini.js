// Prova dal terminale: quali supermercati trova la mappa intorno a un indirizzo.
//   node server/cerca-vicini.js "Via Masaniello 41, Ferrara" 10
import { apri } from './db.js';
import * as mappe from './mappe.js';
import * as vicini from './vicini.js';

const indirizzo = process.argv[2]; const raggio = Number(process.argv[3] || 10);
if (!indirizzo) { console.log('Uso: node server/cerca-vicini.js "Via, numero, città" [raggio km]'); process.exit(1); }
const db = apri();
const casa = await mappe.coordinate(db, indirizzo);
if (!casa) { console.log('Indirizzo non trovato sulla mappa'); process.exit(1); }
console.log(`Casa: ${casa.lat.toFixed(4)}, ${casa.lng.toFixed(4)} · raggio ${raggio} km`);
const r = await vicini.aggiornaZona(db, casa, raggio).catch((e) => ({ errore: e.message }));
console.log(r.errore ? `La mappa non risponde: ${r.errore}` : r.cercato ? `Cercato sulla mappa: ${r.n} negozi letti` : 'Zona già cercata di recente: leggo dal database');
for (const n of vicini.negoziVicini(db, casa, raggio)) console.log(`${String(n.km).padStart(5)} km  ${n.catena.padEnd(22)} ${n.nome ? `«${n.nome}» ` : ''}${n.indirizzo || '(senza via)'}${n.citta ? `, ${n.citta}` : ''}`);
