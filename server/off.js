// Open Food Facts: l'archivio libero dei prodotti alimentari, cercato con il codice a barre.
import { leggiFormato } from './qualita.js';
import { codice } from './additivi.js';

let _fetch = (...a) => globalThis.fetch(...a);
export function usaFetch(f) { _fetch = f; }
const CAMPI = 'categories,generic_name,additives_tags,product_name,product_name_it,product_name_en,product_name_fr,product_name_de,product_name_es,abbreviated_product_name,generic_name_it,brands,quantity,ingredients_text_it,ingredients_text,nutriscore_grade,nova_group,image_front_small_url,image_front_url,origins,origins_tags,labels_tags,manufacturing_places,nutriments,packaging_materials_tags,packaging_tags,packaging_text_it,packaging';

// il codice come lo scrive Open Food Facts: a 13 cifre (un UPC a 12 si allunga con lo 0), e anche la forma senza zeri davanti
const varianti = (ean) => { const e = String(ean).replace(/\D/g, ''); const v = [e]; if (e.length === 12) v.push(`0${e}`); if (e.length === 13 && e.startsWith('0')) v.push(e.slice(1)); return [...new Set(v)]; };
async function chiedi(ean) {
  const r = await _fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=${CAMPI}`, { headers: { 'User-Agent': 'dimmilaspesa/0.46 (+https://spesasaggia.it)' }, signal: AbortSignal.timeout?.(12000) });
  // 404 = non c'è; altre risposte non buone (troppe richieste, server occupato) = non si sa: non va detto «non trovato»
  if (r.status && r.status !== 404 && !r.ok && r.status >= 400) throw new Error(`risposta ${r.status}`);
  return (await r.json())?.product || null;
}
export async function cerca(ean) {
  let o = null;
  try { for (const e of varianti(ean)) { o = await chiedi(e); if (o) break; } } catch { return { errore: 'Open Food Facts non risponde: riprova più tardi' }; }
  // il nome: in italiano, altrimenti in un'altra lingua, il nome generico o abbreviato, o almeno marca e formato
  const nomeTrovato = o && (o.product_name_it || o.product_name || o.abbreviated_product_name || o.generic_name_it || o.generic_name || o.product_name_en || o.product_name_fr || o.product_name_de || o.product_name_es || '');
  if (!o || !(nomeTrovato || o.brands)) return null;
  const nome = nomeTrovato || [String(o.brands || '').split(',')[0].trim(), String(o.categories || '').split(',').pop()?.trim()].filter(Boolean).join(' ');
  const marca = String(o.brands || '').split(',')[0].trim();
  const labels = o.labels_tags || [];
  return {
    // 0.57: senza nome italiano su Open Food Facts il nome si traduce prima di salvarlo
    estero: !o.product_name_it && !o.generic_name_it,
    nome: [nome, marca && !nome.toLowerCase().includes(marca.toLowerCase()) ? marca : '', o.quantity].filter(Boolean).join(' ').trim(),
    marca, tipo: marca ? 'marca' : 'senza',
    formato: leggiFormato(o.quantity),
    bio: labels.some((l) => /organic|biologico|bio$/.test(l)),
    origine: (o.origins_tags || []).some((x) => /italy|italia/.test(x)) ? 'italia' : '',
    descrizione: [o.generic_name_it || nome, o.quantity].filter(Boolean).join(', '),
    ingredienti: o.ingredients_text_it || o.ingredients_text || '',
    nutriscore: /^[a-e]$/.test(o.nutriscore_grade || '') ? o.nutriscore_grade : '',
    nova: [1, 2, 3, 4].includes(Number(o.nova_group)) ? Number(o.nova_group) : null,
    foto: /^https:\/\//.test(o.image_front_small_url || o.image_front_url || '') ? (o.image_front_small_url || o.image_front_url) : '',
    provenienza: o.origins || '', produttore: o.manufacturing_places || '',
    generico: o.generic_name_it || o.generic_name || '',
    categorie: String(o.categories || '').split(',').map((x) => x.trim()).filter((x) => x && !/^[a-z]{2}:/.test(x)),
    additivi: Array.isArray(o.additives_tags) ? [...new Set(o.additives_tags.map(codice).filter(Boolean))] : null,
    // 0.55: valori nutrizionali (per il voto: zuccheri) e materiale della confezione (vetro = punti in più)
    valori: valoriOff(o), imballaggio: imballaggioDa([...(o.packaging_materials_tags || []), ...(o.packaging_tags || []), o.packaging_text_it || '', o.packaging || ''].join(' ')),
  };
}

const n100 = (x) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.round(x * 100) / 100 : undefined);
function valoriOff(o) {
  const m = o?.nutriments || {};
  const v = { energia_kj: n100(m['energy-kj_100g'] ?? m.energy_100g), energia_kcal: n100(m['energy-kcal_100g']), grassi: n100(m.fat_100g), grassi_saturi: n100(m['saturated-fat_100g']),
    carboidrati: n100(m.carbohydrates_100g), zuccheri: n100(m.sugars_100g), fibre: n100(m.fiber_100g), proteine: n100(m.proteins_100g), sale: n100(m.salt_100g) };
  for (const k of Object.keys(v)) if (v[k] === undefined) delete v[k];
  if (!Object.keys(v).length) return '';
  return JSON.stringify({ ...v, categoria: /bevand|beverage|drink|bibit/i.test(o.categories || '') ? 'bevanda' : 'cibo' });
}
/** Materiale della confezione da un testo qualsiasi (tag di Open Food Facts, etichetta): vetro, plastica, carta, metallo o ''. */
export function imballaggioDa(t) {
  const x = String(t || '').toLowerCase();
  if (/glass|vetro|verre|vasetto di vetro|bottiglia di vetro/.test(x)) return 'vetro';
  if (/plastic|plastica|\bpet\b|\bpp\b|\bpe\b|polistirolo/.test(x)) return 'plastica';
  if (/cardboard|paper|carta|cartone|tetra/.test(x)) return 'carta';
  if (/metal|alumin|allumin|steel|acciaio|latta|lattina|\bcan\b/.test(x)) return 'metallo';
  return '';
}
