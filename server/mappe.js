// Indirizzi in coordinate e distanze. Con GOOGLE_MAPS_KEY si usa Google; senza, OpenStreetMap (Nominatim, gratuito,
// una richiesta alla volta). Ogni indirizzo si cerca una volta sola e si ricorda (tabella geocache).
let _fetch = (...a) => globalThis.fetch(...a);
export function usaFetch(f) { _fetch = f; }

const chiave = (q) => String(q || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
export async function coordinate(db, indirizzo) {
  const q = chiave(indirizzo);
  if (q.length < 5) return null;
  const c = db.prepare('SELECT lat, lng, regione, citta FROM geocache WHERE q = ?').get(q);
  if (c) return c.lat === null ? null : { lat: c.lat, lng: c.lng, regione: c.regione || '', citta: c.citta || '' };
  let r = null;
  try {
    const key = String(process.env.GOOGLE_MAPS_KEY || '').trim();
    if (key) {
      const j = await (await _fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=it&language=it&key=${encodeURIComponent(key)}`)).json();
      if (j.status === 'OK') {
        const g = j.results[0]; const comp = (t) => g.address_components?.find((x) => x.types.includes(t))?.long_name || '';
        r = { ...g.geometry.location, regione: comp('administrative_area_level_1'), citta: comp('locality') || comp('administrative_area_level_3') };
      }
    } else {
      const j = await (await _fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&addressdetails=1&q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'dimmilaspesa/0.4 (+https://spesasaggia.it)', 'Accept-Language': 'it' } })).json();
      if (Array.isArray(j) && j[0]) { const a = j[0].address || {}; r = { lat: Number(j[0].lat), lng: Number(j[0].lon), regione: a.state || '', citta: a.city || a.town || a.village || a.municipality || '' }; }
    }
  } catch { return null; } // rete assente: si riprova la prossima volta
  if (r) { r.regione = String(r.regione || '').trim(); r.citta = String(r.citta || '').trim(); }
  db.prepare('INSERT OR REPLACE INTO geocache (q, lat, lng, regione, citta) VALUES (?, ?, ?, ?, ?)').run(q, r?.lat ?? null, r?.lng ?? null, r?.regione ?? '', r?.citta ?? '');
  return r;
}

export function distanzaKm(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
// in città la strada è circa un terzo più lunga della linea d'aria; in auto in città circa 25 km/h
export const kmStrada = (a, b) => distanzaKm(a, b) * 1.35;
export const minutiAuto = (km) => (km / 25) * 60;

export function linkMaps(partenza, tappe, arrivo = partenza) {
  const p = (t) => String(t).replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(p(partenza))}&destination=${encodeURIComponent(p(arrivo))}${tappe.length ? `&waypoints=${encodeURIComponent(tappe.map(p).join('|'))}` : ''}&travelmode=driving`;
}

// Da coordinate a via e città (per i negozi presi dalla mappa senza indirizzo scritto)
export async function indirizzoInverso({ lat, lng }) {
  try {
    const key = String(process.env.GOOGLE_MAPS_KEY || '').trim();
    if (key) {
      const j = await (await _fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=it&result_type=street_address|route&key=${encodeURIComponent(key)}`)).json();
      const r = j.results?.[0]; if (!r) return null;
      const c = (tipo) => r.address_components.find((x) => x.types.includes(tipo))?.long_name || '';
      return { indirizzo: [c('route'), c('street_number')].filter(Boolean).join(' '), citta: c('locality') || c('administrative_area_level_3') };
    }
    const j = await (await _fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=${lat}&lon=${lng}`, { headers: { 'User-Agent': 'dimmilaspesa/0.14 (+https://spesasaggia.it)', 'Accept-Language': 'it' } })).json();
    const a = j.address || {}; const via = a.road || a.pedestrian || a.square || '';
    return via ? { indirizzo: [via, a.house_number].filter(Boolean).join(' '), citta: a.city || a.town || a.village || a.municipality || '' } : null;
  } catch { return null; }
}

// Nord, Centro, Sud e isole (ripartizioni ISTAT) dalla regione; senza regione, dalla latitudine
const NORD = ['valle d\'aosta', 'vallée d\'aoste', 'piemonte', 'liguria', 'lombardia', 'trentino', 'alto adige', 'südtirol', 'veneto', 'friuli', 'emilia'];
const CENTRO = ['toscana', 'umbria', 'marche', 'lazio'];
export function zonaItalia(regione, lat) {
  const r = String(regione || '').toLowerCase();
  if (r) {
    if (NORD.some((x) => r.includes(x))) return 'Nord';
    if (CENTRO.some((x) => r.includes(x))) return 'Centro';
    return 'Sud e isole';
  }
  if (lat == null) return 'Non indicata';
  return lat >= 43.95 ? 'Nord' : lat >= 41.3 ? 'Centro' : 'Sud e isole';
}
