// Giro spesa: scontrini caricati, zone di prezzo, settimana dell'ortofrutta, scelte normale/italiano/bio e marca,
// formato da completare, ricerca con economico/italiano/bio/preferito, combinazioni di catene col giro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.OGGI_PROVA = '2026-10-31';
process.env.FILE_DATI = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'giro-spesa-')), 'prova.sqlite');
delete process.env.GOOGLE_MAPS_KEY; delete process.env.PASSWORD; delete process.env.WHATSAPP_PONTE_URL; process.env.ADMIN = '392 508 6998'; process.env.MAX_CODICI_IP = '100';
const mappe = await import('../server/mappe.js');
// niente rete nelle prove: coordinate inventate per indirizzo
const POS = { casa: [44.8350, 11.6190], 'porta catena': [44.8420, 11.6030], eridano: [44.8180, 11.6080], diamantina: [44.8470, 11.6200], 'via bologna': [44.8100, 11.6050] };
mappe.usaFetch(async (url) => {
  const q = decodeURIComponent(String(url).match(/q=([^&]+)/)[1]).toLowerCase();
  const k = Object.keys(POS).find((x) => q.includes(x));
  return { json: async () => (k ? [{ lat: String(POS[k][0]), lon: String(POS[k][1]) }] : []) };
});
const { app, db } = await import('../server/index.js');
const { inviati } = await import('../server/whatsapp.js');
// entra con il numero: chiede il codice, lo legge dal messaggio "inviato" e lo scrive; restituisce il cookie
const entra = async (telefono, nome, invito) => {
  const a = await app.inject({ method: 'POST', url: '/api/accesso/codice', payload: { telefono } }); if (a.statusCode >= 400) throw new Error(a.json().errore);
  const codice = inviati.at(-1).testo.match(/\d{6}/)[0];
  const r = await app.inject({ method: 'POST', url: '/api/accesso/entra', payload: { telefono, codice, nome, invito } }); if (r.statusCode >= 400) throw new Error(r.json().errore);
  return String(r.headers['set-cookie']).split(';')[0];
};
const nazario = await entra('+39 392 508 6998', 'Nazario');
const chiama = async (method, url, payload, cookie = nazario) => { const r = await app.inject({ method, url, payload, headers: { cookie } }); const j = r.json(); if (r.statusCode >= 400) throw new Error(j.errore); return j; };
const voce = (nome) => db.prepare('SELECT id FROM voci WHERE nome = ?').get(nome).id;
const catena = (nome) => db.prepare('SELECT id FROM catene WHERE nome = ?').get(nome).id;
const OGGI = process.env.OGGI_PROVA; // il giorno delle prove è fisso: i dati d'esempio non scadono
const { piuGiorni } = await import('../server/tempo.js');

test('tre scontrini caricati: totali giusti, verdure italiane, zone di prezzo', async () => {
  const sc = await chiama('GET', '/api/scontrini');
  const per = Object.fromEntries(sc.map((s) => [s.catena, s]));
  assert.deepEqual(Object.keys(per).sort(), ['Eurospin', 'Lidl', 'Tosano']);
  for (const s of sc) assert.equal(Math.round(s.righe.filter((r) => r.importo > 0).reduce((t, r) => t + r.importo, 0) * 100) / 100, s.totale, s.catena);
  const cat = Object.fromEntries((await chiama('GET', '/api/catene')).map((c) => [c.nome, c.ambito]));
  assert.equal(cat.Eurospin, 'centro-nord'); assert.equal(cat.Lidl, 'nazionale'); assert.equal(cat.Tosano, 'citta'); assert.equal(cat.Conad, 'citta'); assert.equal(cat.Penny, 'nazionale');
  assert.ok(Object.keys(cat).length > 40, 'le catene più diffuse sono già pronte');
  const z = await chiama('GET', `/api/confronto?voce_id=${voce('Zucchine')}&data=${OGGI}`);
  assert.equal(z.prodotti[0].origine, 'italia');
  const pr = z.prodotti[0].prezzi[0];
  assert.equal(pr.unitario, 1.69); assert.equal(pr.valido_al, '2026-11-01'); assert.equal(pr.stato, 'valido');
  assert.equal((await chiama('GET', `/api/confronto?voce_id=${voce('Zucchine')}&data=2026-11-03`)).prodotti[0].prezzi[0].stato, 'scaduto');
  const rucola = (await chiama('GET', `/api/confronto?voce_id=${voce('Rucola')}`)).prodotti[0];
  assert.equal(Math.round(rucola.prezzi[0].unitario * 100) / 100, 6.36, '1,59 € per 250 g = 6,36 €/kg');
  const pasta = (await chiama('GET', `/api/confronto?voce_id=${voce('Pasta di semola')}`)).prodotti;
  assert.equal(pasta.length, 3, 'tre formati Sgambaro');
});

test('Eurospin vale nel Centro-Nord, non al Sud', async () => {
  await chiama('POST', '/api/lista', { voce_id: voce('Clementine con foglia'), quantita: 1 });
  let r = await chiama('GET', `/api/calcolo?data=${OGGI}`);
  assert.equal(r.soluzioni[0].catene[0], 'Eurospin');
  await chiama('PUT', '/api/impostazioni', { area: 'sud' });
  r = await chiama('GET', `/api/calcolo?data=${OGGI}`);
  assert.equal(r.soluzioni.length, 0, 'al Sud i prezzi Eurospin del Centro-Nord non valgono');
  await chiama('PUT', '/api/impostazioni', { area: 'centro-nord' });
  await chiama('DELETE', '/api/lista');
});

test('due catene: ognuna vince dove costa meno, il giro dice se conviene', async () => {
  await chiama('PUT', '/api/impostazioni', { soglia_negozio: 0.5 }); await chiama('PUT', '/api/famiglia/casa', { indirizzo: 'Casa, Ferrara' });
  const lidl = catena('Lidl');
  const cat = await chiama('POST', '/api/negozi', { catena_id: lidl, indirizzo: 'Via Bologna 300', citta: 'Ferrara' });
  assert.ok(cat.find((c) => c.id === lidl).negozi.every((n) => n.lat), 'coordinate dei negozi trovate');
  assert.ok(cat.find((c) => c.id === lidl).mia, 'aggiungere un negozio lo mette tra i miei supermercati');
  await chiama('POST', '/api/miei-supermercati', { catena_id: catena('Eurospin') });
  await assert.rejects(chiama('POST', '/api/negozi', { catena_id: lidl, indirizzo: 'Via Inesistente 999', citta: 'Ferrara' }), /Non trovo questo indirizzo/);
  const zl = await chiama('POST', '/api/prodotti', { voce_id: voce('Zucchine'), nome: 'Zucchine sfuse Lidl', sfuso: true, origine: 'italia' });
  const cl = await chiama('POST', '/api/prodotti', { voce_id: voce('Clementine con foglia'), nome: 'Clementine Lidl', sfuso: true, origine: 'italia' });
  await chiama('POST', '/api/prezzi', { prodotto_id: zl.id, catena_id: lidl, prezzo: '1,99', rilevato_il: OGGI });
  await chiama('POST', '/api/prezzi', { prodotto_id: cl.id, catena_id: lidl, prezzo: '0,99', rilevato_il: OGGI });
  await chiama('POST', '/api/lista', { voce_id: voce('Zucchine'), quantita: 1 });
  await chiama('POST', '/api/lista', { voce_id: voce('Clementine con foglia'), quantita: 3 });
  const r = await chiama('GET', `/api/calcolo?data=${OGGI}`);
  const due = r.soluzioni.find((s) => s.catene.length === 2);
  assert.ok(due, 'c\'è la soluzione con due negozi');
  const dove = Object.fromEntries(due.negozi.flatMap((n) => n.righe.map((x) => [x.riga.voce, n.catena])));
  assert.deepEqual(dove, { Zucchine: 'Eurospin', 'Clementine con foglia': 'Lidl' });
  assert.equal(due.spesa, 1.69 + 2.97);
  assert.ok(due.km > 0 && due.link.includes('waypoints='));
  await chiama('PUT', '/api/impostazioni', { soglia_negozio: 10 });
  assert.equal((await chiama('GET', `/api/calcolo?data=${OGGI}`)).soluzioni[0].catene.length, 1, 'con una soglia alta meglio un negozio solo');
});

test('italiano e bio: solo i prodotti giusti; se manca lo dice', async () => {
  await chiama('DELETE', '/api/lista');
  const ita = await chiama('POST', '/api/prodotti', { voce_id: voce('Zucchine'), nome: 'Zucchine italiane bio', origine: 'italia', bio: true, quantita: '0,5' });
  await chiama('POST', '/api/prezzi', { prodotto_id: ita.id, catena_id: catena('Lidl'), prezzo: '1,49', rilevato_il: OGGI });
  await chiama('POST', '/api/lista', { voce_id: voce('Zucchine'), quantita: 1, qualita: 'bio_italiano' });
  await chiama('POST', '/api/lista', { voce_id: voce('Carote'), quantita: 1, qualita: 'bio' });
  const s = (await chiama('GET', `/api/calcolo?data=${OGGI}`)).soluzioni[0];
  const z = s.negozi.flatMap((n) => n.righe).find((x) => x.riga.voce === 'Zucchine');
  assert.equal(z.prodotto, 'Zucchine italiane bio'); assert.equal(z.confezioni, 2); assert.equal(z.costo, 2.98);
  assert.deepEqual(s.mancanti.map((m) => m.voce), ['Carote']);
});

test('formato da completare: fuori dal confronto finché non si scrive', async () => {
  await chiama('DELETE', '/api/lista');
  const crema = voce('Crema di nocciole');
  const nut = await chiama('POST', '/api/prodotti', { voce_id: crema, nome: 'Nutella 450 g', tipo: 'marca', marca: 'Nutella', quantita: '0,45', ean: '8000500310427' });
  await chiama('POST', '/api/prezzi', { prodotto_id: nut.id, catena_id: catena('Eurospin'), prezzo: '3,99', rilevato_il: OGGI });
  await chiama('POST', '/api/prezzi', { prodotto_id: nut.id, catena_id: catena('Lidl'), prezzo: '4,29', rilevato_il: OGGI });
  await chiama('POST', '/api/lista', { voce_id: crema, quantita: '0,4' });
  let x = (await chiama('GET', `/api/calcolo?data=${OGGI}`)).soluzioni[0].negozi.flatMap((n) => n.righe)[0];
  assert.equal(x.prodotto, 'Nutella 450 g', 'la crema Lidl (1,99 €) non ha il formato: non si confronta');
  const lidlCrema = db.prepare("SELECT id FROM prodotti WHERE nome = 'Crema alla nocciola Lidl'").get().id;
  await chiama('PUT', `/api/prodotti/${lidlCrema}`, { quantita: '0,4' });
  x = (await chiama('GET', `/api/calcolo?data=${OGGI}`)).soluzioni[0].negozi.flatMap((n) => n.righe)[0];
  assert.equal(x.prodotto, 'Crema alla nocciola Lidl'); assert.equal(x.unitario, 1.99 / 0.4);
  const [riga] = await chiama('GET', '/api/lista');
  await chiama('PUT', `/api/lista/${riga.id}`, { marca: 'brand:Nutella' });
  x = (await chiama('GET', `/api/calcolo?data=${OGGI}`)).soluzioni[0];
  assert.equal(x.catene[0], 'Eurospin', 'la Nutella costa meno da Eurospin');
});

test('ricerca: economico, italiano, bio e il mio preferito', async () => {
  const [z] = await chiama('GET', '/api/cerca?q=zucch');
  assert.equal(z.voce.nome, 'Zucchine');
  assert.equal(z.economico.prodotto.nome, 'Zucchine sfuse'); assert.equal(z.economico.catena, 'Eurospin');
  assert.equal(z.italiano.prodotto.nome, 'Zucchine sfuse');
  assert.equal(z.bio.prodotto.nome, 'Zucchine italiane bio'); assert.equal(z.bio.unitario, 2.98);
  assert.equal(z.preferito, null);
  const bio = db.prepare("SELECT id FROM prodotti WHERE nome = 'Zucchine italiane bio'").get().id;
  await chiama('POST', '/api/preferiti', { voce_id: z.voce.id, prodotto_id: bio });
  const [z2] = await chiama('GET', '/api/cerca?q=zucch');
  assert.equal(z2.preferito.prodotto.id, bio); assert.equal(z2.preferito.catena, 'Lidl');
  assert.equal((await chiama('GET', `/api/prodotti/${bio}`)).preferito, true);
  const [n] = await chiama('GET', '/api/cerca?q=nutella');
  assert.equal(n.voce.nome, 'Crema di nocciole', 'si trova anche per marca');
  const [k] = await chiama('GET', '/api/cerca?q=kefir');
  assert.equal(k.economico, null); assert.equal(k.daCompletare.length, 1, 'kefir: prezzo c\'è, formato da completare');
});

test('qualità: stelle, Nutri-Score, NOVA, bio e Italia; il migliore e la miglior scelta', async () => {
  const { punteggio, leggiFormato } = await import('../server/qualita.js');
  assert.equal(punteggio({ origine: '', bio: 0 }), null, 'senza dati qualità sconosciuta');
  assert.equal(punteggio({ origine: 'italia', bio: 1 }), 100);
  assert.equal(punteggio({ nutriscore: 'e', nova: 4, origine: 'estero', bio: 0 }), 0);
  assert.equal(punteggio({ origine: 'italia', bio: 0 }, { media: 5, n: 1 }), 82);
  assert.deepEqual(leggiFormato('6 x 125 g'), { quantita: 0.75, unita: 'kg' });
  assert.deepEqual(leggiFormato('1,5 l'), { quantita: 1.5, unita: 'l' });
  assert.deepEqual(leggiFormato('750ml'), { quantita: 0.75, unita: 'l' });
  // zucchine: sfuse italiane Eurospin 1,69 €/kg (qualità 40: italiane, non bio), bio italiane Lidl 2,98 €/kg (qualità 100)
  let [z] = await chiama('GET', '/api/cerca?q=zucch');
  assert.equal(z.migliore.prodotto.nome, 'Zucchine italiane bio'); assert.equal(z.migliore.qualita, 100);
  assert.equal(z.scelta.prodotto.nome, 'Zucchine italiane bio', '100 punti a 2,98 € battono 40 punti a 1,69 €');
  // le stelle contano: 1 stella alle bio, 5 alle sfuse Eurospin
  const bio = db.prepare("SELECT id FROM prodotti WHERE nome = 'Zucchine italiane bio'").get().id;
  const sf = db.prepare("SELECT id FROM prodotti WHERE nome = 'Zucchine sfuse'").get().id;
  await chiama('POST', '/api/valutazioni', { prodotto_id: bio, stelle: 1 });
  await chiama('POST', '/api/valutazioni', { prodotto_id: sf, stelle: 5 });
  [z] = await chiama('GET', '/api/cerca?q=zucch');
  assert.equal(z.migliore.prodotto.nome, 'Zucchine sfuse');
  assert.equal(z.scelta.prodotto.nome, 'Zucchine sfuse');
  assert.equal((await chiama('GET', `/api/prodotti/${sf}`)).mioVoto, 5);
});

test('codice a barre: scheda da Open Food Facts, formato letto, poi la scheda c\'è', async () => {
  const off = await import('../server/off.js');
  off.usaFetch(async (url) => ({
    json: async () => (String(url).includes('8001505005707')
      ? { product: { product_name_it: 'Crema spalmabile nocciole e cacao bio', brands: 'Rigoni di Asiago', quantity: '250 g', nutriscore_grade: 'e', nova_group: 4, labels_tags: ['en:organic', 'en:eu-organic'], origins_tags: ['en:italy'], image_front_small_url: 'https://images.openfoodfacts.org/x.jpg', ingredients_text_it: 'nocciole, zucchero di canna, cacao' } }
      : { status: 0 }),
  }));
  const r = await chiama('GET', '/api/scansiona/8001505005707');
  assert.equal(r.nuovo, true, 'trovato su Open Food Facts: il prodotto si crea da solo');
  const p = await chiama('GET', `/api/prodotti/${r.prodotto_id}`);
  assert.equal(p.marca, 'Rigoni di Asiago'); assert.equal(p.quantita, 0.25); assert.equal(p.voce, 'Crema di nocciole', 'la voce giusta');
  assert.equal(p.bio, true); assert.equal(p.origine, 'italia'); assert.equal(p.nova, 4); assert.equal(p.ean, '8001505005707');
  assert.match(p.foto, /^https:/); assert.match(p.ingredienti, /nocciole/);
  assert.deepEqual(await chiama('GET', '/api/scansiona/8001505005707'), { prodotto_id: p.id }, 'la seconda volta c\'è già');
  assert.equal((await chiama('GET', '/api/scansiona/1234567890123')).proposta, null, 'non trovato: si compila a mano');
  // subito dopo: prezzo e dove l'ho comprato
  await chiama('POST', '/api/prezzi', { prodotto_id: p.id, catena_id: catena('Lidl'), prezzo: '3,49' });
  assert.equal((await chiama('GET', `/api/prodotti/${p.id}`)).ultimi[0].prezzo, 3.49);
  const s = await chiama('GET', `/api/prodotti/${p.id}`);
  assert.equal(s.qualita, 33, 'bio italiana ma Nutri-Score E e ultra-lavorata');
});

test('lista a voce: capisce cosa e quanto, poi mette in lista; "preso" esce dal giro', async () => {
  await chiama('DELETE', '/api/lista');
  const r = await chiama('POST', '/api/lista/voce', { testo: 'Devo comprare un chilo e mezzo di carote, le zucchine bio e due bottiglie di passata. Poi il detersivo per piatti' });
  const per = Object.fromEntries(r.capito.map((c) => [c.nome, c]));
  assert.equal(per.Carote.quantita, 1.5); assert.equal(per.Carote.unita, 'kg'); assert.ok(per.Carote.voce_id);
  assert.equal(per.Zucchine.qualita, 'bio');
  assert.ok(per['Detersivo per piatti'].nuova); assert.equal(per['Detersivo per piatti'].nuova.reparto, 'casa');
  const lista = await chiama('POST', '/api/lista/voce/conferma', { righe: r.capito });
  assert.equal(lista.length, r.capito.length);
  assert.ok(db.prepare("SELECT id FROM voci WHERE nome = 'Detersivo per piatti'").get());
  // ridetto: non raddoppia, aggiorna la quantità se detta
  const r2 = await chiama('POST', '/api/lista/voce', { testo: 'tre chili di carote' });
  const l2 = await chiama('POST', '/api/lista/voce/conferma', { righe: r2.capito });
  assert.equal(l2.length, lista.length); assert.equal(l2.find((x) => x.voce === 'Carote').quantita, 3);
  // spuntato come preso: resta in lista ma non entra nel calcolo
  const car = l2.find((x) => x.voce === 'Carote');
  await chiama('PUT', `/api/lista/${car.id}`, { preso: true });
  const c = await chiama('GET', `/api/calcolo?data=${OGGI}`);
  assert.ok(!c.righe.some((x) => x.voce === 'Carote'));
  const l3 = await chiama('DELETE', '/api/lista?presi=1');
  assert.equal(l3.length, lista.length - 1);
});

test('abitudini: italiano scelto per una voce vale anche la volta dopo', async () => {
  await chiama('DELETE', '/api/lista');
  let l = await chiama('POST', '/api/lista/voce/conferma', { righe: (await chiama('POST', '/api/lista/voce', { testo: 'zucchine' })).capito });
  const z = l.find((x) => x.voce === 'Zucchine'); assert.equal(z.qualita, 'qualsiasi');
  await chiama('PUT', `/api/lista/${z.id}`, { qualita: 'italiano' });
  await chiama('DELETE', '/api/lista');
  const r = await chiama('POST', '/api/lista/voce', { testo: 'due chili di zucchine e le carote' });
  assert.equal(r.capito.find((c) => c.nome === 'Zucchine').qualita, 'italiano');
  assert.equal(r.capito.find((c) => c.nome === 'Carote').qualita, 'qualsiasi');
  // detto a voce vince sull'abitudine
  assert.equal((await chiama('POST', '/api/lista/voce', { testo: 'zucchine bio' })).capito[0].qualita, 'bio');
  l = await chiama('POST', '/api/lista', { voce_id: z.voce_id, quantita: 1 });
  assert.equal(l.find((x) => x.voce === 'Zucchine').qualita, 'italiano');
});

test('additivi: dagli ingredienti, semaforo e voto; foto salvata sul server', async () => {
  const { elenco, puntiAdditivi } = await import('../server/additivi.js');
  assert.deepEqual(elenco(['en:e250', 'en:e330']).map((x) => x.livello), ['rosso', 'verde']);
  assert.equal(puntiAdditivi(['E250', 'E450']), 45);
  const p = await chiama('POST', '/api/prodotti', { voce_id: voce('Carote'), nome: 'Prosciutto di prova', tipo: 'senza', quantita: 0.1, nutriscore: 'd', nova: 4,
    ingredienti: 'Coscia di suino, sale, destrosio, antiossidante: E301, conservante: E 250, E450' });
  const s = await chiama('GET', `/api/prodotti/${p.id}`);
  assert.deepEqual(s.additivi.map((x) => x.codice), ['E250', 'E450', 'E301']);
  assert.equal(s.additivi[0].livello, 'rosso');
  assert.equal(s.giudizio.parola, 'Scarso');
  // "nessuno": additivi noti e assenti, il voto sale
  const s2 = await chiama('PUT', `/api/prodotti/${p.id}`, { additivi: 'nessuno', ingredienti: 'Coscia di suino, sale' });
  assert.equal(s2.additivi, '[]');
  const jpg = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(2000, 7)]).toString('base64');
  const f = await chiama('POST', '/api/foto', { dati: jpg });
  assert.match(f.foto, /^\/foto\/[a-z0-9-]+\.jpg$/);
  const r = await app.inject({ method: 'GET', url: f.foto });
  assert.equal(r.statusCode, 200); assert.equal(r.headers['content-type'], 'image/jpeg');
  const s3 = await chiama('PUT', `/api/prodotti/${p.id}`, { foto: f.foto });
  assert.equal(s3.foto, f.foto);
});

test('accesso: famiglie separate, invito, parti riservate, codice sbagliato', async () => {
  const anon = await app.inject({ method: 'GET', url: '/api/lista' });
  assert.equal(anon.statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/api/stato' })).json().utente, null);
  const st = await chiama('GET', '/api/stato'); assert.equal(st.utente.admin, true); assert.equal(st.utente.nome, 'Nazario');
  // Maria: famiglia sua, lista sua
  await app.inject({ method: 'POST', url: '/api/accesso/codice', payload: { telefono: '333 111 2222' } });
  const sbagliato = await app.inject({ method: 'POST', url: '/api/accesso/entra', payload: { telefono: '3331112222', codice: '000000' } });
  assert.equal(sbagliato.statusCode, 400);
  const senzaNome = await app.inject({ method: 'POST', url: '/api/accesso/entra', payload: { telefono: '3331112222', codice: inviati.at(-1).testo.match(/\d{6}/)[0] } });
  assert.equal(senzaNome.json().serveNome, true, 'chi è nuovo deve dire il nome');
  const maria = await entra('3331112222', 'Maria');
  const io = await chiama('GET', '/api/stato', undefined, maria); assert.equal(io.utente.admin, false); assert.equal(io.utente.famiglia, 'Famiglia di Maria');
  await chiama('POST', '/api/lista/voce/conferma', { righe: (await chiama('POST', '/api/lista/voce', { testo: 'il latte' }, maria)).capito }, maria);
  const lm = await chiama('GET', '/api/lista', undefined, maria); assert.equal(lm.length, 1);
  const ln = await chiama('GET', '/api/lista'); assert.ok(!ln.some((r) => r.id === lm[0].id), 'la lista di Maria non si vede da Nazario');
  await assert.rejects(chiama('DELETE', `/api/lista/${lm[0].id}`), /Riga non trovata/);
  await assert.rejects(chiama('GET', '/api/scontrini', undefined, maria), /riservata/);
  await assert.rejects(chiama('PUT', '/api/impostazioni', { soglia_negozio: 1 }, maria), /riservata/);
  // Maria invita il marito: stessa lista
  const { codice } = await chiama('POST', '/api/famiglia/invito', {}, maria);
  const gino = await entra('3334445555', 'Gino', codice);
  assert.equal((await chiama('GET', '/api/lista', undefined, gino)).length, 1);
  const f = await chiama('GET', '/api/famiglia', undefined, gino);
  assert.deepEqual(f.membri.map((m) => m.nome), ['Maria', 'Gino']); assert.ok(!f.membri[0].telefono.includes('1112222'), 'il numero intero non si mostra');
  // esce: sessione chiusa
  await chiama('POST', '/api/accesso/esci', {}, gino);
  assert.equal((await app.inject({ method: 'GET', url: '/api/lista', headers: { cookie: gino } })).statusCode, 401);
  // troppi codici
  for (let i = 0; i < 3; i++) await app.inject({ method: 'POST', url: '/api/accesso/codice', payload: { telefono: '3337778888' } });
  assert.equal((await app.inject({ method: 'POST', url: '/api/accesso/codice', payload: { telefono: '3337778888' } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/api/accesso/codice', payload: { telefono: '3337778888' } })).statusCode, 429);
  assert.equal((await app.inject({ method: 'POST', url: '/api/accesso/codice', payload: { telefono: '06 1234567' } })).statusCode, 400, 'solo cellulari');
});

test('whatsapp: codici dal servizio dell\'app; avvisi del servizio accettati solo dall\'interno', async () => {
  const w = await import('../server/whatsapp.js');
  const chiamate = [];
  w.usaFetch(async (url, o) => { chiamate.push({ url, corpo: o?.body && JSON.parse(o.body) }); return { ok: true, json: async () => (String(url).endsWith('/status') ? { ready: false } : String(url).endsWith('/qr') ? { qr: 'abc' } : { ok: true }) }; });
  process.env.WHATSAPP_SERVIZIO = 'http://127.0.0.1:3012';
  try {
    await app.inject({ method: 'POST', url: '/api/accesso/codice', payload: { telefono: '3339990000' } });
    assert.equal(chiamate.at(-1).url, 'http://127.0.0.1:3012/send'); assert.equal(chiamate.at(-1).corpo.phone, '393339990000'); assert.match(chiamate.at(-1).corpo.message, /\d{6}/);
    const s = await chiama('GET', '/api/whatsapp'); assert.equal(s.pronto, false); assert.match(s.qr, /^data:image\/png;base64,/);
  } finally { delete process.env.WHATSAPP_SERVIZIO; w.usaFetch((...a) => globalThis.fetch(...a)); }
  assert.equal((await app.inject({ method: 'POST', url: '/api/whatsapp-web/incoming', payload: { from: '39333' }, remoteAddress: '127.0.0.1' })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/api/whatsapp-web/incoming', payload: {}, headers: { 'x-real-ip': '1.2.3.4' } })).statusCode, 403);
});

test('scontrino fotografato: entra in coda, lo vede solo chi gestisce', async () => {
  const maria = await entra('3331112222', 'Maria');
  const jpg = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(5000, 3)]).toString('base64')}`;
  await chiama('POST', '/api/scontrini/foto', { dati: jpg }, maria);
  await assert.rejects(chiama('GET', '/api/scontrini/foto', undefined, maria), /riservata/);
  const l = await chiama('GET', '/api/scontrini/foto');
  assert.equal(l[0].nome, 'Maria'); assert.equal(l[0].stato, 'da leggere');
  assert.equal((await chiama('GET', '/api/stato')).conti.daLeggere, 1);
  await chiama('PUT', `/api/scontrini/foto/${l[0].id}`, { stato: 'letto' });
  assert.equal((await chiama('GET', '/api/stato')).conti.daLeggere, 0);
});

test('lista con le scelte: più economico, bio, italiano con i prezzi; la scelta resta', async () => {
  await chiama('DELETE', '/api/lista');
  const l = await chiama('POST', '/api/lista/voce/conferma', { righe: (await chiama('POST', '/api/lista/voce', { testo: 'un chilo di zucchine' })).capito });
  const z = l.find((x) => x.voce === 'Zucchine');
  assert.ok(z.opzioni.length >= 2, 'almeno due scelte per le zucchine');
  const eco = z.opzioni.find((o) => o.etichette.includes('Più economico'));
  const bio = z.opzioni.find((o) => o.etichette.includes('Bio'));
  assert.ok(eco.unitario <= bio.unitario); assert.ok(eco.stima > 0);
  const l2 = await chiama('PUT', `/api/lista/${z.id}`, { prodotto_id: bio.prodotto.id, scelto: true });
  const z2 = l2.find((x) => x.id === z.id); assert.equal(z2.prodotto_id, bio.prodotto.id); assert.equal(z2.scelto, 1);
});

test('catalogo da Open Food Facts: importa solo l\'Italia, codice a barre senza internet, ricerca e lista', async () => {
  const cat = await import('../server/catalogo.js');
  const zlib = await import('node:zlib');
  const cols = ['code', 'product_name', 'brands', 'quantity', 'countries_tags', 'categories', 'nutriscore_grade', 'nova_group', 'additives_tags', 'labels_tags', 'origins_tags', 'image_small_url', 'ingredients_text'];
  const righe = [cols.join('\t'),
    ['8000300123456', 'Passata di pomodoro', 'Mutti', '700 g', 'en:italy,en:france', 'Conserve, Passate di pomodoro', 'a', '1', '', '', 'en:italy', 'https://img/x.jpg', 'pomodoro 100%'].join('\t'),
    ['3017620422003', 'Nutella', 'Ferrero', '750 g', 'en:italy', 'Creme spalmabili, Creme di nocciole', 'e', '4', 'en:e322', '', '', '', 'zucchero, olio di palma, nocciole 13%'].join('\t'),
    ['8076809513753', 'Pan di Stelle', 'Mulino Bianco', '350 g', 'en:italy', 'Snack dolci, Biscotti, Biscotti al cioccolato', 'c', '4', 'en:e500', '', '', '', 'farina, zucchero, cacao'].join('\t'),
    ['5000000000001', 'Solo in Francia', 'X', '1 l', 'en:france', '', '', '', '', '', '', '', ''].join('\t')];
  const f = path.join(os.tmpdir(), `cat-${Date.now()}.csv.gz`); fs.writeFileSync(f, zlib.gzipSync(righe.join('\n')));
  assert.equal(await cat.importa(f, { log: () => {} }), 3, 'solo i prodotti venduti in Italia');
  const r = await chiama('GET', '/api/scansiona/8000300123456');
  assert.equal(r.nuovo, true);
  const p = await chiama('GET', `/api/prodotti/${r.prodotto_id}`);
  assert.equal(p.marca, 'Mutti'); assert.equal(p.quantita, 0.7); assert.equal(p.voce, 'Passata di pomodoro'); assert.equal(p.origine, 'italia');
  const trovati = await chiama('GET', '/api/catalogo?q=nutel');
  assert.equal(trovati.length, 1); assert.equal(trovati[0].marca, 'Ferrero'); assert.ok(trovati[0].qualita < 35, 'Nutri-Score E, ultra-lavorata');
  assert.equal((await chiama('GET', '/api/catalogo?q=passata')).length, 0, 'quella già nell\'app non si ripete');
  await chiama('DELETE', '/api/lista');
  const u = await chiama('POST', '/api/catalogo/3017620422003/usa', { lista: true });
  const l = await chiama('GET', '/api/lista');
  assert.equal(l[0].prodotto_id, u.prodotto_id); assert.equal(l[0].voce, 'Crema di nocciole');
  cat.chiudi();
});

test('prezzi: si correggono; chi non li ha inseriti no; latte Sterilgarda da 4 litri', async () => {
  const s = db.prepare("SELECT * FROM prodotti WHERE nome LIKE 'Latte microfiltrato%Sterilgarda%'").get();
  assert.equal(s.quantita, 4);
  const pr = db.prepare('SELECT * FROM prezzi WHERE prodotto_id = ?').get(s.id);
  assert.ok(Math.abs(pr.unitario - 0.9975) < 0.001, '3,99 € la confezione = 1,00 € al litro');
  const maria = await entra('3331112222', 'Maria');
  await assert.rejects(chiama('PUT', `/api/prezzi/${pr.id}`, { prezzo: '1' }, maria), /solo i prezzi che hai inserito/);
  await chiama('PUT', `/api/prezzi/${pr.id}`, { prezzo: '4,19' });
  assert.ok(Math.abs(db.prepare('SELECT unitario FROM prezzi WHERE id = ?').get(pr.id).unitario - 1.0475) < 0.001);
  const p2 = (await chiama('GET', '/api/prodotti?q=zucchine sfuse'))[0];
  await chiama('POST', '/api/prezzi', { prodotto_id: p2.id, catena_id: catena('Lidl'), prezzo: '1,50' }, maria);
  const suo = db.prepare('SELECT id FROM prezzi WHERE prodotto_id = ? AND utente_id IS NOT NULL ORDER BY id DESC').get(p2.id);
  await chiama('DELETE', `/api/prezzi/${suo.id}`, undefined, maria);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM prezzi WHERE id = ?').get(suo.id).n, 0);
});

test('scelta di una riga: proposte con i prezzi per supermercato, catalogo, confezioni, "decidi tu", prossima', async () => {
  const cat = await import('../server/catalogo.js');
  await chiama('DELETE', '/api/lista');
  const r = await chiama('POST', '/api/lista/voce', { testo: 'zucchine, pan di stelle e il kefir' });
  const pds = r.capito.find((c) => /pan di stelle/i.test(c.nome));
  assert.equal(pds.catalogo?.ean, '8076809513753', 'pan di stelle trovato nel catalogo');
  await chiama('POST', '/api/lista/voce/conferma', { righe: r.capito });
  const l = await chiama('GET', '/api/lista');
  const z = l.find((x) => x.voce === 'Zucchine');
  const sc = await chiama('GET', `/api/lista/${z.id}/scelte`);
  assert.ok(sc.prodotti.length >= 2);
  const conEtichette = sc.prodotti.filter((x) => x.etichette.length);
  assert.ok(conEtichette.length >= 1 && conEtichette[0].prezzi[0].catena, 'la proposta dice dove costa meno');
  assert.equal(sc.restano, 2); assert.ok(sc.prossima);
  const bio = sc.prodotti.find((x) => x.etichette.includes('Bio'));
  const dopo = await chiama('POST', `/api/lista/${z.id}/scegli`, { prodotto_id: bio.prodotto.id, confezioni: 2 });
  const z2 = dopo.lista.find((x) => x.id === z.id); assert.equal(z2.prodotto_id, bio.prodotto.id); assert.equal(z2.scelto, 1);
  assert.equal(dopo.restano, 2);
  const k = l.find((x) => x.voce === 'Kefir');
  const d2 = await chiama('POST', `/api/lista/${k.id}/scegli`, { automatica: true, qualita: 'italiano' });
  const k2 = d2.lista.find((x) => x.id === k.id); assert.equal(k2.scelto, 1); assert.equal(k2.prodotto_id, null); assert.equal(k2.qualita, 'italiano');
  assert.equal(d2.restano, 1);
  // pan di stelle: prodotto creato dal catalogo sotto una voce sua, proposto come "quello che hai detto", da scegliere
  const b = l.find((x) => /biscotti/i.test(x.voce));
  assert.ok(b && b.prodotto_id && !b.scelto, 'il prodotto detto è già collegato ma la scelta resta da fare');
  const sc3 = await chiama('GET', `/api/lista/${b.id}/scelte`);
  assert.equal(sc3.prodotti[0].detto, true); assert.match(sc3.prodotti[0].prodotto.nome, /Pan di Stelle/);
  const d3 = await chiama('POST', `/api/lista/${b.id}/scegli`, { prodotto_id: b.prodotto_id, confezioni: 2 });
  assert.equal(d3.lista.find((x) => x.id === b.id).quantita, 0.7, '2 confezioni da 350 g');
  assert.equal(d3.restano, 0); assert.equal(d3.prossima, null);
  cat.chiudi();
});

test('supermercati: chiunque aggiunge una catena e un negozio; i doppioni non si creano', async () => {
  const maria = await entra('3335556666', 'Anna');
  const r = await chiama('POST', '/api/catene', { nome: 'famila' }, maria);
  assert.equal(r.catena.nome, 'Famila', 'c\'era già: non si duplica');
  const n = await chiama('POST', '/api/catene', { nome: 'Supermercato Rossi' }, maria);
  assert.equal(n.catena.ambito, 'citta'); assert.ok(n.catena.proposta_da, 'proposta da un utente');
  const lista = await chiama('POST', '/api/negozi', { catena_id: n.catena.id, indirizzo: 'Via Bologna 10, Ferrara' }, maria);
  const rossi = lista.find((c) => c.id === n.catena.id);
  assert.equal(rossi.negozi.length, 1); assert.equal(rossi.negozi_citta, 1); assert.ok(rossi.negozi[0].lat);
  await assert.rejects(chiama('PUT', `/api/catene/${n.catena.id}`, { ambito: 'nazionale' }, maria), /riservata/);
});

test('i miei supermercati: proposte per negozio, giro solo sui miei, avviso quando un preferito è in offerta', async () => {
  const miei = await chiama('GET', '/api/miei-supermercati');
  assert.deepEqual(miei.map((c) => c.nome).sort(), ['Eurospin', 'Lidl']);
  await chiama('DELETE', '/api/lista');
  const l = await chiama('POST', '/api/lista', { voce_id: voce('Zucchine'), quantita: 1 });
  const sc = await chiama('GET', `/api/lista/${l[0].id}/scelte`);
  assert.deepEqual(sc.miei.map((m) => m.catena), ['Eurospin', 'Lidl'], 'un rigo per ogni mio supermercato, dal più conveniente');
  assert.equal(sc.miei[0].prezzo, 1.69); assert.ok(sc.miei[1].prodotto, 'anche da Lidl c\'è qualcosa');
  // preferito in offerta → avviso per la famiglia
  const zs = db.prepare("SELECT id FROM prodotti WHERE nome = 'Zucchine sfuse'").get().id;
  await chiama('POST', '/api/preferiti', { voce_id: voce('Zucchine'), prodotto_id: zs });
  await chiama('POST', '/api/prezzi', { prodotto_id: zs, catena_id: catena('Eurospin'), prezzo: '0,99', offerta: true });
  await new Promise((ok) => setTimeout(ok, 50));
  const av = await chiama('GET', '/api/avvisi');
  assert.ok(av.length >= 1); assert.match(av[0].testo, /preferito .*Zucchine sfuse.* in offerta da Eurospin a 0,99 €/);
  await chiama('PUT', `/api/avvisi/${av[0].id}`, {});
  assert.equal((await chiama('GET', '/api/avvisi')).length, av.length - 1);
  // tolgo Lidl dai miei: il giro non lo considera più
  await chiama('DELETE', `/api/miei-supermercati/${catena('Lidl')}`);
  const r = await chiama('GET', `/api/calcolo?data=${OGGI}`);
  assert.ok(r.soluzioni.every((s) => !s.catene.includes('Lidl')));
  await chiama('POST', '/api/miei-supermercati', { catena_id: catena('Lidl') });
});

test('risparmio: rispetto a un negozio solo e rispetto ai supermercati fuori dai tuoi; giudizio della spesa', async () => {
  await chiama('PUT', '/api/impostazioni', { soglia_negozio: 0.5 });
  // Conad con un negozio in città e zucchine a 0,29 €/kg: non è tra i miei
  const conad = catena('Conad');
  await chiama('POST', '/api/negozi', { catena_id: conad, indirizzo: 'Via Bologna 10, Ferrara' });
  await chiama('DELETE', `/api/miei-supermercati/${conad}`);
  const zc = await chiama('POST', '/api/prodotti', { voce_id: voce('Zucchine'), nome: 'Zucchine sfuse Conad', sfuso: true, origine: 'italia' });
  await chiama('POST', '/api/prezzi', { prodotto_id: zc.id, catena_id: conad, prezzo: '0,29', rilevato_il: OGGI });
  await chiama('DELETE', `/api/miei-supermercati/${conad}`);
  await chiama('DELETE', '/api/lista');
  await chiama('POST', '/api/lista', { voce_id: voce('Zucchine'), quantita: 2 });
  await chiama('POST', '/api/lista', { voce_id: voce('Clementine con foglia'), quantita: 3 });
  const r = await chiama('GET', `/api/calcolo?data=${OGGI}`);
  assert.ok(!r.soluzioni[0].catene.includes('Conad'), 'il giro resta tra i miei');
  assert.ok(r.risparmio.unSolo && typeof r.risparmio.rispettoUnSolo === 'number');
  assert.ok(r.risparmio.altrove, 'fuori dai miei si risparmierebbe');
  assert.deepEqual(r.risparmio.altrove.nuove, ['Conad']);
  assert.ok(r.risparmio.altrove.differenze.some((d) => d.voce === 'Zucchine' && d.catena === 'Conad'));
  assert.ok(r.giudizi && (r.giudizi.promossi.length + r.giudizi.cosiCosi.length + r.giudizi.scarsi.length + r.giudizi.ignoti.length) >= 2);
  // a spesa fatta (tutto preso) il riepilogo c'è ancora
  const l = await chiama('GET', '/api/lista'); for (const x of l) await chiama('PUT', `/api/lista/${x.id}`, { preso: true });
  assert.equal((await chiama('GET', `/api/calcolo?data=${OGGI}`)).righe.length, 0);
  assert.ok((await chiama('GET', `/api/calcolo?data=${OGGI}&tutto=1`)).soluzioni.length >= 1);
  await chiama('PUT', '/api/impostazioni', { soglia_negozio: 3 });
});

test('scontrino fotografato: lettura, abbinamento ai prodotti, prezzi caricati a nome di chi l\'ha mandato', async () => {
  const lett = await import('../server/lettura.js');
  lett.usaOcr(async () => `EUROSPIN ITALIA SPA
VIA PORTA CATENA 39 FERRARA
DESCRIZIONE IVA PREZZO
CAROTE 1kg 4% 1,29
CETRIOLI 4% 4,58
2,304 kg x 1,99 €/kg
BISCOTTI FROLLINI 10% 2,49
TOTALE COMPLESSIVO 8,36
02-11-2026 18:42 DOC.N. 00087-00099`);
  const maria = await entra('3338889999', 'Lucia');
  const jpg = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(5000, 3)]).toString('base64')}`;
  await chiama('POST', '/api/scontrini/foto', { dati: jpg }, maria);
  const foto = (await chiama('GET', '/api/scontrini/foto')).find((x) => x.stato === 'da leggere');
  await assert.rejects(chiama('POST', `/api/scontrini/foto/${foto.id}/leggi`, {}, maria), /riservata/);
  const l = await chiama('POST', `/api/scontrini/foto/${foto.id}/leggi`, {});
  assert.equal(l.catena, 'Eurospin'); assert.equal(l.data, '2026-11-02'); assert.equal(l.totale, 8.36);
  const per = Object.fromEntries(l.righe.map((r) => [r.testo, r]));
  assert.equal(per['CAROTE 1kg'].prodotto, 'Carote, confezione 1 kg'); assert.equal(per['CAROTE 1kg'].sicuro, true, 'stesso nome da scontrino');
  assert.equal(per.CETRIOLI.voce, 'Cetrioli'); assert.equal(per.CETRIOLI.prezzo_unita, 1.99); assert.equal(per.CETRIOLI.unita, 'kg');
  assert.equal(per['BISCOTTI FROLLINI'].prodotto_id, null, 'non lo conosce: lo abbina chi gestisce');
  const r = await chiama('POST', `/api/scontrini/foto/${foto.id}/carica`, { catena_id: l.catena_id, data: l.data, numero: l.numero, totale: l.totale, righe: l.righe.filter((x) => x.prodotto_id) });
  assert.equal(r.prezzi, 2);
  const pr = db.prepare("SELECT pr.* FROM prezzi pr JOIN prodotti p ON p.id = pr.prodotto_id WHERE p.nome = 'Carote, confezione 1 kg' ORDER BY pr.id DESC").get();
  assert.equal(pr.prezzo, 1.29); assert.equal(pr.rilevato_il, '2026-11-02'); assert.equal(pr.fonte, 'scontrino');
  assert.ok(pr.utente_id, 'a nome di chi ha mandato la foto');
  assert.equal((await chiama('GET', '/api/avvisi', undefined, maria)).some((a) => /sono entrati 2 prezzi/.test(a.testo)), true);
  assert.equal((await chiama('GET', '/api/scontrini/foto')).find((x) => x.id === foto.id).stato, 'letto');
  lett.usaOcr(null);
});

test('produttori locali: scheda, offerte, prenotazione senza commissione, stati e avvisi; canone mensile e banco nascosto se scaduto', async () => {
  // chi gestisce crea il produttore; il suo numero di telefono gli dà la gestione quando entra
  const p = await chiama('POST', '/api/produttori', { nome: 'Azienda agricola Rossi', indirizzo: 'Via Bologna 300', citta: 'Ferrara', telefono: '347 000 1111', orari: 'martedì e venerdì 17-19', canone: '30' });
  assert.ok(p.id && p.lat, 'indirizzo trovato'); assert.equal(p.canone, 30); assert.equal(p.commissione, 0); assert.equal(p.inizio, new Date().toISOString().slice(0, 10));
  await assert.rejects(chiama('POST', '/api/produttore/offerte', { nome: 'Uova' }), /per i produttori/);
  const rossi = await entra('3470001111', 'Mario Rossi');
  const off = await chiama('POST', '/api/produttore/offerte', { nome: 'Zucchine bio', voce_id: voce('Zucchine'), prezzo: '2,50', unita: 'kg', passo: 0.5, bio: true }, rossi);
  await chiama('POST', '/api/produttore/offerte', { nome: 'Uova fresche', prezzo: '0,45', unita: 'pz', passo: 6 }, rossi);
  assert.equal(off.length, 1);
  // il cliente vede il produttore (anche dalla voce Zucchine) e ordina
  const lista = await chiama('GET', '/api/produttori');
  assert.equal(lista[0].nome, 'Azienda agricola Rossi'); assert.ok(lista[0].km > 0); assert.equal(lista[0].offerte, 1 + 1 - 0);
  const perZucchine = await chiama('GET', `/api/produttori?voce_id=${voce('Zucchine')}`);
  assert.equal(perZucchine[0].nome, 'Zucchine bio'); assert.equal(perZucchine[0].prezzo, 2.5);
  const scheda = await chiama('GET', `/api/produttori/${p.id}`); assert.equal(scheda.offerte.length, 2);
  const uova = scheda.offerte.find((o) => o.nome === 'Uova fresche');
  const ord = await chiama('POST', '/api/ordini', { produttore_id: p.id, righe: [{ offerta_id: off[0].id, quantita: 1.5 }, { offerta_id: uova.id, quantita: 12 }], ritiro: 'venerdì 17-19' });
  assert.equal(ord.totale, 1.5 * 2.5 + 12 * 0.45); assert.equal(ord.commissione, 0); assert.equal(ord.stato, 'nuovo');
  assert.equal((await chiama('GET', '/api/ordini')).length, 1);
  // il produttore conferma, poi è pronto: il cliente riceve gli avvisi
  const mio = await chiama('GET', '/api/produttore/mio', undefined, rossi); assert.equal(mio.ordini.length, 1); assert.equal(mio.ordini[0].cliente, 'Nazario');
  await chiama('PUT', `/api/produttore/ordini/${ord.id}`, { stato: 'confermato' }, rossi);
  await chiama('PUT', `/api/produttore/ordini/${ord.id}`, { stato: 'pronto' }, rossi);
  const av = await chiama('GET', '/api/avvisi'); assert.ok(av.some((a) => /pronto/.test(a.testo)));
  await assert.rejects(chiama('PUT', `/api/ordini/${ord.id}`, { stato: 'annullato' }), /non si può più annullare/);
  await chiama('PUT', `/api/produttore/ordini/${ord.id}`, { stato: 'ritirato' }, rossi);
  const mesi = await chiama('GET', '/api/produttore/riepilogo', undefined, rossi);
  assert.equal(mesi[0].ordini, 1); assert.equal(mesi[0].venduto, ord.totale); assert.equal(mesi[0].commissione, undefined);
  const can = await chiama('GET', '/api/canoni'); const mioCanone = can.find((x) => x.id === p.id);
  assert.equal(mioCanone.canone, 30); assert.equal(mioCanone.visibile, true); assert.equal(mioCanone.mesi[0].venduto, ord.totale);
  await assert.rejects(chiama('GET', '/api/canoni', undefined, rossi), /riservata/);
  // canone scaduto: il banco sparisce per chi fa la spesa, il produttore lo vede segnalato; segnato il pagamento, torna
  await chiama('PUT', `/api/canoni/${p.id}`, { pagato_fino: '2026-01-31' });
  assert.ok(!(await chiama('GET', '/api/produttori')).some((x) => x.id === p.id));
  assert.equal((await chiama('GET', `/api/produttori?voce_id=${voce('Zucchine')}`)).length, 0);
  await assert.rejects(chiama('GET', `/api/produttori/${p.id}`), /non trovato/);
  const mio2 = await chiama('GET', '/api/produttore/mio', undefined, rossi); assert.equal(mio2.visibile, false); assert.equal(mio2.pagato_fino, '2026-01-31');
  await chiama('PUT', `/api/canoni/${p.id}`, { pagato_fino: '2099-12-31' });
  assert.ok((await chiama('GET', '/api/produttori')).some((x) => x.id === p.id));
});

test('supermercati vicino a casa dalla mappa: catene abbinate, distanze, aggiungi e togli dai miei, zona ricordata', async () => {
  const vicini = await import('../server/vicini.js');
  let chiamate = 0;
  vicini.usaFetch(async () => { chiamate++; return { ok: true, json: async () => ({ elements: [
    { type: 'node', id: 1, lat: 44.8290, lon: 11.6400, tags: { shop: 'supermarket', name: 'Iper Tosano', brand: 'Tosano', 'addr:street': 'Via Padova', 'addr:housenumber': '12', 'addr:city': 'Ferrara' } },
    { type: 'way', id: 2, center: { lat: 44.8100, lon: 11.6050 }, tags: { shop: 'supermarket', brand: 'Lidl', name: 'Lidl' } },
    { type: 'node', id: 3, lat: 44.8410, lon: 11.6250, tags: { shop: 'supermarket', name: 'Conad City', 'addr:street': 'Corso Isonzo', 'addr:housenumber': '3' } },
    { type: 'node', id: 4, lat: 44.8500, lon: 11.5900, tags: { shop: 'supermarket', name: 'Ipercoop Le Mura' } },
    { type: 'node', id: 5, lat: 44.8380, lon: 11.6100, tags: { shop: 'supermarket', name: 'Alimentari Bianchi' } },
    { type: 'node', id: 6, lat: 44.8380, lon: 11.6100, tags: { shop: 'supermarket' } },
  ] }) }; });
  const lidlPrima = db.prepare("SELECT COUNT(*) n FROM negozi n JOIN catene c ON c.id = n.catena_id WHERE c.nome = 'Lidl'").get().n;
  const familiare = await entra('351 400 0001', 'Teresa');
  const st0 = await chiama('GET', '/api/stato', undefined, familiare); assert.equal(st0.famiglia.casa, false); assert.equal(st0.famiglia.supermercati, 0);
  await assert.rejects(chiama('GET', '/api/negozi/vicini?raggio=10', undefined, familiare), /indirizzo di casa/);
  await chiama('PUT', '/api/famiglia/casa', { indirizzo: 'Casa, Ferrara' }, familiare);
  const v = await chiama('GET', '/api/negozi/vicini?raggio=10', undefined, familiare);
  assert.equal(chiamate, 1);
  const per = Object.fromEntries(v.negozi.map((n) => [n.nome || n.catena, n]));
  assert.equal(per['Iper Tosano'].catena, 'Tosano'); assert.equal(per['Iper Tosano'].indirizzo, 'Via Padova 12'); assert.equal(per['Iper Tosano'].citta, 'Ferrara');
  assert.equal(per['Conad City'].catena, 'Conad City'); assert.equal(per['Ipercoop Le Mura'].catena, 'Ipercoop'); assert.equal(per['Alimentari Bianchi'].catena, 'Alimentari Bianchi');
  assert.ok(!v.negozi.some((n) => !n.catena)); assert.ok(v.negozi.every((n) => n.km > 0)); assert.ok(v.negozi.every((n) => !n.mia));
  assert.ok(v.negozi[0].km <= v.negozi.at(-1).km);
  // il Lidl della mappa è lo stesso già inserito a mano (Via Bologna): non viene duplicato
  assert.equal(db.prepare("SELECT COUNT(*) n FROM negozi n JOIN catene c ON c.id = n.catena_id WHERE c.nome = 'Lidl'").get().n, lidlPrima);
  assert.ok(db.prepare("SELECT osm_id FROM negozi WHERE indirizzo = 'Via Bologna 300'").get().osm_id, 'il negozio inserito a mano ora è collegato alla mappa');
  // aggiungo il Tosano: la catena diventa mia e la ricerca non si rifà
  const v2 = await chiama('POST', `/api/negozi/${per['Iper Tosano'].id}/mio`, { raggio: 10 }, familiare);
  assert.equal(v2.negozi.find((n) => n.nome === 'Iper Tosano').mia, true); assert.ok(v2.negozi.every((n) => n.mia === (n.catena === 'Tosano'))); assert.equal(chiamate, 1);
  const st = await chiama('GET', '/api/stato', undefined, familiare); assert.equal(st.famiglia.casa, true); assert.equal(st.famiglia.supermercati, 1);
  const miei = await chiama('GET', '/api/miei-supermercati', undefined, familiare); assert.deepEqual(miei.map((c) => c.nome), ['Tosano']);
  const v3 = await chiama('DELETE', `/api/negozi/${per['Iper Tosano'].id}/mio?raggio=10`, undefined, familiare);
  assert.ok(v3.negozi.every((n) => !n.mia));
  // un raggio più piccolo è già coperto; uno più grande si cerca
  await chiama('GET', '/api/negozi/vicini?raggio=5', undefined, familiare); assert.equal(chiamate, 1);
  await chiama('GET', '/api/negozi/vicini?raggio=20', undefined, familiare); assert.equal(chiamate, 2);
  // se la mappa non risponde, si mostrano quelli già conosciuti con un avviso
  vicini.usaFetch(async () => { throw new Error('rete'); });
  await chiama('PUT', '/api/famiglia/casa', { indirizzo: 'Via Bologna 1, Ferrara' }, familiare);
  const v4 = await chiama('GET', '/api/negozi/vicini?raggio=40', undefined, familiare);
  assert.match(v4.avviso, /non risponde/); assert.ok(v4.negozi.length >= 5);
});

test('spesa chiusa: storico con data, pagella a colori, alternative per la prossima volta; la lista si svuota', async () => {
  await chiama('PUT', '/api/impostazioni', { soglia_negozio: 0.5 });
  await chiama('DELETE', '/api/lista');
  await chiama('POST', '/api/lista', { voce_id: voce('Zucchine'), quantita: 2 });
  await chiama('POST', '/api/lista', { voce_id: voce('Clementine con foglia'), quantita: 3 });
  const pane = await chiama('POST', '/api/voci', { nome: 'Pane casereccio', reparto: 'pane', unita: 'kg' });
  await chiama('POST', '/api/lista', { voce_id: pane.id, quantita: 1 });
  await assert.rejects(chiama('POST', '/api/spese'), /niente di preso/);
  const l = await chiama('GET', '/api/lista'); for (const x of l) await chiama('PUT', `/api/lista/${x.id}`, { preso: true });
  const sp = await chiama('POST', '/api/spese');
  assert.equal(sp.data, OGGI); assert.equal(sp.n, 3); assert.ok(sp.totale > 0); assert.ok(sp.catene.length >= 1);
  assert.ok(['verde', 'giallo', 'rosso', 'grigio'].includes(sp.colore)); assert.ok(sp.media == null || (sp.media >= 0 && sp.media <= 100));
  assert.deepEqual(sp.soglie, { verde: 60, giallo: 45 });
  const z = sp.righe.find((r) => r.voce === 'Zucchine'); assert.ok(z.prodotto && z.catena && z.costo > 0);
  // le zucchine da Conad (fuori dai miei) costano meno: è l'alternativa per la prossima volta
  assert.ok(z.alternativa && z.alternativa.catena === 'Conad' && z.alternativa.differenza < 0 && z.alternativa.fuori === true, JSON.stringify(z.alternativa));
  assert.ok(sp.prossima.some((r) => r.voce === 'Zucchine')); assert.ok(sp.risparmio > 0);
  const pn = sp.righe.find((r) => r.voce === 'Pane casereccio'); assert.equal(pn.costo, null); assert.equal(pn.qualita, null); assert.equal(sp.senzaProdotto.length, 1);
  // la lista è vuota, lo storico ha la spesa e si rilegge
  assert.equal((await chiama('GET', '/api/lista')).length, 0);
  const st = await chiama('GET', '/api/spese'); assert.equal(st.length, 1); assert.equal(st[0].id, sp.id); assert.equal(st[0].colore, sp.colore);
  const det = await chiama('GET', `/api/spese/${sp.id}`); assert.equal(det.righe.length, 3); assert.equal(det.giudizi.promossi.length + det.giudizi.cosiCosi.length + det.giudizi.scarsi.length + det.giudizi.ignoti.length, 2);
  // un'altra famiglia non la vede
  const altro = await entra('351 400 0002', 'Pina');
  await assert.rejects(chiama('GET', `/api/spese/${sp.id}`, undefined, altro), /non trovata/);
  await chiama('PUT', '/api/impostazioni', { soglia_negozio: 3 });
});

test('offerta con periodo di validità; l\'app propone l\'offerta nel supermercato più vicino; statistiche d\'uso aggregate per zona', async () => {
  // un'offerta sulle clementine da Lidl valida fino a una data: compare cercando, con i km da casa, e scade
  const cl = db.prepare("SELECT id FROM prodotti WHERE nome = 'Clementine Lidl'").get().id;
  await chiama('POST', '/api/prezzi', { prodotto_id: cl, catena_id: catena('Lidl'), prezzo: '0,99', offerta: true, rilevato_il: OGGI, valido_al: '2026-11-07' });
  const pr = (await chiama('GET', `/api/prodotti/${cl}`)).storia.find((x) => x.offerta); assert.equal(pr.valido_al, '2026-11-07'); assert.equal(pr.valido_dal, OGGI);
  await chiama('PUT', `/api/prezzi/${pr.id}`, { prezzo: '0,99', offerta: true, valido_dal: '2026-10-30', valido_al: '2026-11-09' });
  assert.equal((await chiama('GET', `/api/prodotti/${cl}`)).storia.find((x) => x.id === pr.id).valido_al, '2026-11-09');
  await assert.rejects(chiama('PUT', `/api/prezzi/${pr.id}`, { valido_dal: '2026-11-10', valido_al: '2026-11-09' }), /fine viene prima/);
  const ris = await chiama('GET', '/api/cerca?q=clementine');
  const ov = ris[0].offertaVicina; assert.ok(ov, 'offerta proposta'); assert.equal(ov.catena, 'Lidl'); assert.ok(ov.km > 0); assert.equal(ov.valido_al, '2026-11-09'); assert.equal(ov.mia, true);
  // tolta l'offerta, sparisce la proposta
  await chiama('PUT', `/api/prezzi/${pr.id}`, { offerta: false, valido_dal: '', valido_al: '' });
  const dopo = (await chiama('GET', `/api/prodotti/${cl}`)).storia.find((x) => x.id === pr.id); assert.equal(dopo.offerta, 0); assert.equal(dopo.valido_al, null);
  // statistiche: solo per chi gestisce; conta persone, zone (Ferrara = Nord), uso di oggi e installazioni
  const teresa = await entra('351 400 0001', 'Teresa');
  await assert.rejects(chiama('GET', '/api/statistiche', undefined, teresa), /riservata/);
  await chiama('POST', '/api/uso', { installata: true }, teresa);
  await chiama('GET', '/api/stato', undefined, teresa);
  const st = await chiama('GET', '/api/statistiche');
  assert.ok(st.persone >= 4); assert.ok(st.famiglie >= 3); assert.equal(st.installazioni, 1);
  assert.ok(st.attivi.oggi >= 2); assert.ok(st.attivi.mese >= st.attivi.settimana); assert.ok(st.frequenza > 0);
  const nord = st.zone.find((z) => z.zona === 'Nord'); assert.ok(nord.famiglie >= 2, 'le famiglie con casa a Ferrara sono nel Nord');
  assert.equal(st.settimane.length, 10); assert.equal(st.giorni.length, 14); assert.ok(st.giorni.at(-1).utenti >= 2);
  assert.ok(st.contenuti.prezzi > 0 && st.contenuti.spese >= 1);
});

test('pagina Scegli: la proposta principale (la tua scelta o il più conveniente) e le alternative per tipo, nel raggio', async () => {
  await chiama('DELETE', '/api/lista');
  const riga = (await chiama('POST', '/api/lista', { voce_id: voce('Zucchine'), quantita: 1 })).find((x) => x.voce === 'Zucchine');
  const s1 = await chiama('GET', `/api/lista/${riga.id}/scelte`);
  assert.ok(s1.principale && ['conveniente', 'preferito'].includes(s1.principale.motivo) && s1.principale.dove, JSON.stringify(s1.principale));
  const tutti = s1.alternative.flatMap((a) => a.tipi);
  assert.ok(!s1.alternative.some((a) => a.prodotto.id === s1.principale.prodotto.id), 'la principale non si ripete tra le alternative');
  assert.equal(new Set(s1.alternative.map((a) => a.prodotto.id)).size, s1.alternative.length, 'un prodotto una volta sola, con più etichette');
  assert.ok(tutti.includes('bio'), 'c\'è un bio');
  for (const a of s1.alternative) { assert.ok(a.dove == null || (a.dove.catena && a.dove.costo > 0)); if (a.dove) assert.equal(a.differenza, Math.round((a.dove.costo - s1.principale.dove.costo) * 100) / 100); }
  assert.equal(s1.zona.raggio, 10);
  // scelgo un prodotto preciso: diventa la principale «scelto», le alternative non lo contengono
  const bio = s1.alternative.find((a) => a.tipi.includes('bio'));
  await chiama('POST', `/api/lista/${riga.id}/scegli`, { prodotto_id: bio.prodotto.id });
  const s2 = await chiama('GET', `/api/lista/${riga.id}/scelte`);
  assert.equal(s2.principale.prodotto.id, bio.prodotto.id); assert.equal(s2.principale.motivo, 'scelto');
  assert.ok(!s2.alternative.some((a) => a.prodotto.id === bio.prodotto.id));
  assert.ok(s2.alternative.some((a) => a.tipi.includes('economico') && a.differenza < 0), 'il più economico costa meno della scelta bio');
  // il raggio scelto sulla mappa si ricorda
  await chiama('GET', '/api/negozi/vicini?raggio=20').catch(() => null);
  assert.equal((await chiama('GET', `/api/lista/${riga.id}/scelte`)).zona.raggio, 20);
});

test('pagina Scegli: un prodotto con il prezzo ma senza formato diventa comunque la proposta', async () => {
  const v = await chiama('POST', '/api/voci', { nome: 'Crema spalmabile prova', reparto: 'dispensa', unita: 'kg' });
  const pr = await chiama('POST', '/api/prodotti', { voce_id: v.id, nome: 'Crema senza formato' });
  await chiama('POST', '/api/prezzi', { prodotto_id: pr.id, catena_id: catena('Lidl'), prezzo: '1,99', rilevato_il: OGGI });
  const riga = (await chiama('POST', '/api/lista', { voce_id: v.id, quantita: 1 })).find((x) => x.voce === 'Crema spalmabile prova');
  const s = await chiama('GET', `/api/lista/${riga.id}/scelte`);
  assert.equal(s.principale?.prodotto.id, pr.id); assert.equal(s.principale.dove.catena, 'Lidl'); assert.equal(s.principale.dove.costo, 1.99);
});

test('il consiglio dell\'app: stessa qualità a meno, oppure qualità migliore allo stesso prezzo; altrimenti la scelta è già la migliore', async () => {
  const v = await chiama('POST', '/api/voci', { nome: 'Fiocchi prova', reparto: 'dispensa', unita: 'kg' });
  const P = async (d, cat, eur) => { const p = await chiama('POST', '/api/prodotti', { voce_id: v.id, quantita: 0.5, nova: 1, ...d }); await chiama('POST', '/api/prezzi', { prodotto_id: p.id, catena_id: catena(cat), prezzo: eur, rilevato_il: OGGI }); return p; };
  const mio = await P({ nome: 'Fiocchi A', nutriscore: 'b' }, 'Lidl', '0,89');
  const meno = await P({ nome: 'Fiocchi B', nutriscore: 'b' }, 'Eurospin', '0,69');
  await P({ nome: 'Fiocchi C caro', nutriscore: 'a', bio: true }, 'Eurospin', '2,49');
  const riga = (await chiama('POST', '/api/lista', { voce_id: v.id, prodotto_id: mio.id, quantita: 0.5 })).find((x) => x.voce === 'Fiocchi prova');
  const s = await chiama('GET', `/api/lista/${riga.id}/scelte`);
  const c = s.alternative.find((a) => a.tipi.includes('consiglio'));
  assert.ok(c, 'c\'è un consiglio'); assert.equal(c.prodotto.id, meno.id); assert.equal(c.perche, 'meno'); assert.ok(c.differenza < 0); assert.equal(s.giaMigliore, false);
  // scelgo il consigliato: non c'è più niente di meglio, la scelta è già la migliore
  await chiama('POST', `/api/lista/${riga.id}/scegli`, { prodotto_id: meno.id });
  const s2 = await chiama('GET', `/api/lista/${riga.id}/scelte`);
  assert.ok(!s2.alternative.some((a) => a.tipi.includes('consiglio'))); assert.equal(s2.giaMigliore, true);
});

test('pagina Scegli: con un solo prodotto con prezzo non dice «già la migliore»', async () => {
  const v = await chiama('POST', '/api/voci', { nome: 'Orzo prova', reparto: 'dispensa', unita: 'kg' });
  const a = await chiama('POST', '/api/prodotti', { voce_id: v.id, nome: 'Orzo A', quantita: 0.5, nutriscore: 'a', nova: 1 });
  await chiama('POST', '/api/prodotti', { voce_id: v.id, nome: 'Orzo B senza prezzo', quantita: 0.5, nutriscore: 'a', nova: 1 });
  await chiama('POST', '/api/prezzi', { prodotto_id: a.id, catena_id: catena('Lidl'), prezzo: '1,10', rilevato_il: OGGI });
  const riga = (await chiama('POST', '/api/lista', { voce_id: v.id, prodotto_id: a.id, quantita: 0.5 })).find((x) => x.voce === 'Orzo prova');
  const s = await chiama('GET', `/api/lista/${riga.id}/scelte`);
  assert.equal(s.giaMigliore, false); assert.equal(s.confrontati, 0); assert.equal(s.senzaPrezzo, 1); assert.equal(s.alternative.length, 0);
});

test('volantino letto da Claude: offerte abbinate o nuove, periodo dal/al, prezzi in offerta; senza chiave avvisa', async () => {
  const claude = await import('../server/claude.js');
  const jpeg = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xFF, 0xD8]), Buffer.alloc(2000), Buffer.from([0xFF, 0xD9])]).toString('base64');
  const teresa = await entra('351 400 0001', 'Teresa');
  const v = await chiama('POST', '/api/volantini', { dati: jpeg }, teresa);
  assert.ok(v.id); assert.equal(v.leggibile, false);
  await assert.rejects(chiama('POST', `/api/volantini/${v.id}/leggi`, {}, teresa), /riservata/);
  await assert.rejects(chiama('POST', `/api/volantini/${v.id}/leggi`), /ANTHROPIC_API_KEY/);
  process.env.ANTHROPIC_API_KEY = 'prova';
  let chiesto = null;
  claude.usaFetch(async (url, o) => { chiesto = { url, corpo: JSON.parse(o.body), chiave: o.headers['x-api-key'] }; return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'Ecco: ' + JSON.stringify({
    supermercato: 'LIDL', valido_dal: '2026-11-03', valido_al: '2026-11-09',
    offerte: [
      { nome: 'Clementine Lidl', quantita: null, unita: 'kg', sfuso: true, prezzo: 0.89, bio: false, italiano: true },
      { nome: 'Biscotti frollini al cacao', marca: 'Crownfield', quantita: 0.7, unita: 'kg', sfuso: false, prezzo: 1.49, prezzo_pieno: 1.99 },
      { nome: 'Olio extravergine di oliva 100% italiano', marca: 'Primadonna', quantita: 1, unita: 'l', prezzo: 7.99, italiano: true },
      { nome: 'Clementine biologiche in rete', quantita: 1.5, unita: 'kg', prezzo: 2.49, bio: true },
      { nome: 'Prezzo illeggibile', prezzo: 0 },
    ] }) }], usage: { input_tokens: 2000, output_tokens: 500 } }) }; });
  try {
    const l = await chiama('POST', `/api/volantini/${v.id}/leggi`);
    assert.match(chiesto.url, /api\.anthropic\.com\/v1\/messages/); assert.equal(chiesto.chiave, 'prova'); assert.equal(chiesto.corpo.messages[0].content[0].type, 'image');
    assert.equal(l.catena, 'Lidl'); assert.equal(l.valido_dal, '2026-11-03'); assert.equal(l.valido_al, '2026-11-09'); assert.equal(l.righe.length, 4);
    assert.ok(l.uso.euro > 0);
    const cl = l.righe.find((r) => r.nome === 'Clementine Lidl'); assert.ok(cl.prodotto_id, 'le clementine Lidl ci sono già');
    const bi = l.righe.find((r) => /Biscotti/.test(r.nome)); assert.equal(bi.prodotto_id, null); assert.ok(bi.voce_id || bi.voce_nuova);
    const olio = l.righe.find((r) => /Olio/.test(r.nome)); assert.equal(olio.prodotto_id, null, 'l\'olio non è le acciughe'); assert.ok(!/Acciughe/.test(olio.voce || ''));
    assert.equal(olio.voce_nuova?.nome, 'Olio extravergine');
    const cb = l.righe.find((r) => /biologiche/.test(r.nome)); assert.equal(cb.voce, 'Clementine con foglia', 'stessa prima parola: la voce delle clementine');
    l.righe = l.righe.filter((r) => r === cl || r === bi);
    const lista = await chiama('GET', '/api/volantini'); assert.equal(lista.attivo, true); assert.ok(lista.lista.find((x) => x.id === v.id).letto);
    await assert.rejects(chiama('POST', `/api/volantini/${v.id}/carica`, { catena_id: l.catena_id, valido_dal: '2026-11-03', righe: l.righe }), /data «al»/);
    const c = await chiama('POST', `/api/volantini/${v.id}/carica`, { catena_id: l.catena_id, valido_dal: l.valido_dal, valido_al: l.valido_al, righe: l.righe });
    assert.equal(c.prezzi, 2); assert.equal(c.nuovi.length, 1);
    const pz = db.prepare("SELECT * FROM prezzi WHERE fonte = 'volantino' ORDER BY id").all();
    assert.equal(pz.length, 2); assert.ok(pz.every((x) => x.offerta === 1 && x.valido_dal === '2026-11-03' && x.valido_al === '2026-11-09'));
    const nuovo = db.prepare("SELECT * FROM prodotti WHERE nome = 'Biscotti frollini al cacao'").get(); assert.equal(nuovo.marca, 'Crownfield');
    assert.equal(db.prepare('SELECT stato FROM volantini WHERE id = ?').get(v.id).stato, 'letto');
  } finally { delete process.env.ANTHROPIC_API_KEY; claude.usaFetch((...a) => globalThis.fetch(...a)); }
});

test('pubblicità: due pulsanti, WhatsApp con messaggio e «Scopri di più» con il link alla pagina', async () => {
  const a = await chiama('GET', '/api/annunci');
  assert.equal(a[0].whatsapp, '393925086998'); assert.match(a[0].messaggio, /consulenza/); assert.match(a[0].link, /^https:\/\/nazariosoluzionifinanziarie\.it\//);
  const b = await chiama('PUT', `/api/annunci/${a[0].id}`, { ...a[0], whatsapp: '392 508 6998', link: 'https://nazariosoluzionifinanziarie.it/consolidamento/' });
  assert.equal(b[0].whatsapp, '393925086998'); assert.equal(b[0].link, 'https://nazariosoluzionifinanziarie.it/consolidamento/');
  await assert.rejects(chiama('PUT', `/api/annunci/${a[0].id}`, { ...a[0], link: 'nazariosoluzionifinanziarie.it' }), /https/);
  await assert.rejects(chiama('PUT', `/api/annunci/${a[0].id}`, { ...a[0], whatsapp: '12' }), /WhatsApp non è valido/);
  assert.equal((await chiama('GET', '/api/stato')).annuncio.whatsapp, '393925086998');
});

test('casa e igiene: catalogo da Open Products/Beauty Facts, detersivo al lavaggio, carta al rotolo, giudizio solo dai voti', async () => {
  const cat = await import('../server/catalogo.js');
  const zlib = await import('node:zlib');
  const cols = ['code', 'product_name', 'brands', 'quantity', 'countries_tags', 'categories', 'nutriscore_grade', 'nova_group', 'additives_tags', 'labels_tags', 'origins_tags', 'image_small_url', 'ingredients_text'];
  const gz = (righe, n) => { const f = path.join(os.tmpdir(), `cat-${n}-${Date.now()}.csv.gz`); fs.writeFileSync(f, zlib.gzipSync([cols.join('\t'), ...righe.map((r) => r.join('\t'))].join('\n'))); return f; };
  const cibo = gz([['8000300123456', 'Passata di pomodoro', 'Mutti', '700 g', 'en:italy', 'Passate di pomodoro', 'a', '1', '', '', 'en:italy', '', '']], 'cibo');
  const casa = gz([['8001090000001', 'Dash Pods Platinum', 'Dash', '30 capsule', 'en:italy', 'Detersivi per bucato', 'a', '', 'en:e330', '', '', '', ''],
    ['8001090000002', 'Detersivo lavatrice liquido Lavanda', 'Bio Presto', '2,2 l 40 lavaggi', 'en:italy', 'Detersivi per bucato', '', '', '', '', '', '', ''],
    ['8001090000009', 'Spugne abrasive', 'Vileda', '3 pz', 'en:germany', 'Spugne', '', '', '', '', '', '', '']], 'casa');
  const igiene = gz([['8001090000003', 'Dentifricio sbiancante', 'Mentadent', '75 ml', 'en:italy', 'Dentifrici', '', '', '', '', '', '', '']], 'igiene');
  const n = await cat.importa([{ url: cibo, tipo: 'cibo' }, { url: casa, tipo: 'casa', tutti: true }, { url: igiene, tipo: 'igiene', tutti: true }, { url: '/non/esiste.csv.gz', tipo: 'casa' }], { log: () => {} });
  assert.equal(n, 5, 'un archivio che manca si salta, gli altri entrano; per la casa anche i prodotti non segnati come venduti in Italia');
  cat.chiudi(); assert.deepEqual(JSON.parse(cat.info().per_tipo), { cibo: 1, casa: 3, igiene: 1 });
  // detersivo: va nella voce che c'è già (al lavaggio) con 40 lavaggi a confezione
  const v = db.prepare("SELECT * FROM voci WHERE nome = 'Detersivo lavatrice'").get();
  assert.equal(v.unita, 'pz'); assert.equal(v.pezzo, 'lavaggio');
  const d = await chiama('GET', `/api/prodotti/${(await chiama('GET', '/api/scansiona/8001090000002')).prodotto_id}`);
  assert.equal(d.voce, 'Detersivo lavatrice'); assert.equal(d.quantita, 40); assert.equal(d.pezzo, 'lavaggio'); assert.equal(d.non_alimentare, 1); assert.equal(d.qualita, null, 'niente semaforo alimentare');
  await chiama('POST', '/api/prezzi', { prodotto_id: d.id, catena_id: catena('Lidl'), prezzo: '6,00', rilevato_il: OGGI });
  assert.equal((await chiama('GET', `/api/prodotti/${d.id}`)).storia[0].unitario, 0.15, '6 € / 40 lavaggi');
  // le stelle danno il giudizio
  await chiama('POST', '/api/valutazioni', { prodotto_id: d.id, stelle: 5 });
  assert.equal((await chiama('GET', `/api/prodotti/${d.id}`)).qualita, 100);
  // capsule: voce nuova in Casa e igiene, a capsule
  const c = await chiama('GET', `/api/prodotti/${(await chiama('GET', '/api/scansiona/8001090000001')).prodotto_id}`);
  assert.equal(c.reparto, 'casa'); assert.equal(c.non_alimentare, 1); assert.equal(c.nutriscore, '', 'il Nutri-Score non vale per un detersivo');
  // la carta igienica si conta a rotoli
  assert.equal(db.prepare("SELECT pezzo FROM voci WHERE nome = 'Carta igienica (rotoli)'").get().pezzo, 'rotolo');
  // il dentifricio dal catalogo dell'igiene
  const tr = await chiama('GET', '/api/catalogo?q=mentadent'); assert.equal(tr.length, 1); assert.equal(tr[0].non_alimentare, true); assert.equal(tr[0].qualita, null);
  cat.chiudi();
});

test('il consiglio guarda anche i supermercati vicini non tuoi; il preferito è la proposta principale', async () => {
  const v = await chiama('POST', '/api/voci', { nome: 'Gallette prova', reparto: 'dispensa', unita: 'kg' });
  const P = async (d, cat, eur) => { const p = await chiama('POST', '/api/prodotti', { voce_id: v.id, quantita: 0.2, nova: 1, ...d }); await chiama('POST', '/api/prezzi', { prodotto_id: p.id, catena_id: catena(cat), prezzo: eur, rilevato_il: OGGI }); return p; };
  const mio = await P({ nome: 'Gallette mie', nutriscore: 'c' }, 'Lidl', '1,00');
  const meglio = await P({ nome: 'Gallette migliori', nutriscore: 'a' }, 'Conad', '1,02');
  await chiama('POST', '/api/preferiti', { voce_id: v.id, prodotto_id: mio.id });
  // Conad non è tra i miei supermercati, ma ha un negozio vicino a casa (entro il raggio)
  await chiama('DELETE', `/api/miei-supermercati/${catena('Conad')}`);
  assert.ok(!(await chiama('GET', '/api/miei-supermercati')).some((c) => c.nome === 'Conad'));
  const riga = (await chiama('POST', '/api/lista', { voce_id: v.id, quantita: 0.2 })).find((x) => x.voce === 'Gallette prova');
  const s = await chiama('GET', `/api/lista/${riga.id}/scelte`);
  assert.equal(s.principale.motivo, 'preferito'); assert.equal(s.principale.prodotto.id, mio.id);
  const c = s.alternative.find((a) => a.tipi.includes('consiglio'));
  assert.ok(c, 'c\'è il consiglio'); assert.equal(c.prodotto.id, meglio.id); assert.equal(c.dove.catena, 'Conad'); assert.equal(c.dove.mio, false); assert.ok(c.dove.km > 0); assert.equal(c.perche, 'meglio');
});

test('fornitore: prezzo fuori dai supermercati, vale ovunque, compare nella scelta e nel giro tra le cose da comprare a parte', async () => {
  const v = await chiama('POST', '/api/voci', { nome: 'Polvere per denti', reparto: 'casa', unita: 'pz' });
  const p = await chiama('POST', '/api/prodotti', { voce_id: v.id, nome: 'Blanc Dent polvere', quantita: 1 });
  const f = await chiama('POST', '/api/catene', { nome: 'Blanc Dent vendita diretta', fornitore: true });
  assert.equal(f.catena.tipo, 'fornitore'); assert.equal(f.catena.ambito, 'nazionale');
  assert.ok(!(await chiama('GET', '/api/miei-supermercati')).some((c) => c.id === f.catena.id), 'un fornitore non entra tra i miei supermercati');
  await chiama('POST', '/api/prezzi', { prodotto_id: p.id, catena_id: f.catena.id, prezzo: '12,90', rilevato_il: OGGI });
  await chiama('DELETE', '/api/lista');
  const riga = (await chiama('POST', '/api/lista', { voce_id: v.id, quantita: 1 })).find((x) => x.voce === 'Polvere per denti');
  const s = await chiama('GET', `/api/lista/${riga.id}/scelte`);
  assert.equal(s.principale.dove.catena, 'Blanc Dent vendita diretta'); assert.equal(s.principale.dove.fornitore, true);
  const g = await chiama('GET', `/api/calcolo?data=${OGGI}`);
  assert.equal(g.fuoriGiro.length, 1); assert.equal(g.fuoriGiro[0].fornitore, 'Blanc Dent vendita diretta'); assert.equal(g.fuoriGiro[0].prezzo, 12.9);
});

test('menu di gestione solo per chi gestisce: la sorella non vede pubblicità, canoni, statistiche; può segnalare un produttore', async () => {
  const sorella = await entra('351 400 0099', 'Sorella');
  const st = await chiama('GET', '/api/stato', undefined, sorella); assert.equal(st.utente.admin, false);
  for (const u of ['/api/annunci', '/api/canoni', '/api/statistiche', '/api/volantini', '/api/segnalazioni']) await assert.rejects(chiama('GET', u, undefined, sorella), /riservata/, u);
  await assert.rejects(chiama('PUT', '/api/annunci/1', { titolo: 'x' }, sorella), /riservata/);
  await chiama('POST', '/api/segnalazioni', { nome: 'Caseificio Bianchi', dove: 'Copparo', cosa: 'formaggi', telefono: '333 1234567' }, sorella);
  const seg = await chiama('GET', '/api/segnalazioni'); assert.equal(seg[0].nome, 'Caseificio Bianchi'); assert.equal(seg[0].da, 'Sorella');
  // un utente segnato gestore per errore, ma non nell'elenco del server, perde il ruolo
  db.prepare('UPDATE utenti SET admin = 1 WHERE telefono = ?').run('3514000099');
  assert.equal((await chiama('GET', '/api/stato', undefined, sorella)).utente.admin, false);
  assert.equal(db.prepare('SELECT admin FROM utenti WHERE telefono = ?').get('3514000099').admin, 0);
  assert.equal((await chiama('GET', '/api/stato')).utente.admin, true, 'Nazario resta gestore');
});

test('formato: si scrive in litri o grammi e diventa quello della voce; una voce nuova a pezzi si adatta ai litri', async () => {
  // l'ammorbidente: la voce creata «a pezzi» per sbaglio diventa a litri al primo prodotto con il formato
  const g = await chiama('GET', '/api/voci/indovina?nome=Ammorbidente'); assert.deepEqual(g, { reparto: 'casa', unita: 'l' });
  const v = await chiama('POST', '/api/voci', { nome: 'Ammorbidente prova', reparto: 'dispensa', unita: 'pz' });
  const p = await chiama('POST', '/api/prodotti', { voce_id: v.id, nome: 'Felce Azzurra classico', tipo: 'marca', marca: 'Felce Azzurra', quantita: '3', formato_unita: 'l' });
  assert.equal(p.quantita, 3); assert.equal(p.unita, 'l'); assert.equal(p.reparto, 'casa');
  // un altro formato in millilitri si converte
  const p2 = await chiama('POST', '/api/prodotti', { voce_id: v.id, nome: 'Felce Azzurra piccolo', tipo: 'marca', marca: 'Felce Azzurra', quantita: '750', formato_unita: 'ml' });
  assert.equal(p2.quantita, 0.75);
  // ora la voce è a litri: un formato in grammi non si accetta
  await assert.rejects(chiama('POST', '/api/prodotti', { voce_id: v.id, nome: 'Strano', quantita: '500', formato_unita: 'g' }), /a litri/);
  // e il confronto si fa al litro
  await chiama('POST', '/api/prezzi', { prodotto_id: p.id, catena_id: catena('Lidl'), prezzo: '4,50', rilevato_il: OGGI });
  assert.equal((await chiama('GET', `/api/prodotti/${p.id}`)).storia[0].unitario, 1.5);
});

test('tariffe: canone del produttore calcolato dalle persone attive in zona (gratis al lancio); 3 posti in home, il 1° paga di più', async () => {
  const t = await chiama('GET', '/api/tariffe'); assert.equal(t.raggio_km, 20); assert.deepEqual(t.posizioni, [1, 0.9, 0.8]);
  // pochi attivi: produttore gratis, home al primo scaglione
  const p = await chiama('POST', '/api/produttori', { nome: 'Forno Bianchi', indirizzo: 'Via Bologna 300', citta: 'Ferrara', telefono: '347 000 2222' });
  let c = (await chiama('GET', '/api/canoni')).find((x) => x.id === p.id);
  assert.equal(c.canone_auto, true); assert.equal(c.canone, 0); assert.ok(c.attivi >= 1 && c.attivi < 250);
  // con tariffe diverse (scaglione basso a 1 persona) il canone sale da solo
  await chiama('PUT', '/api/tariffe', { produttori: [[1, 0], [100, 25], [null, 50]], home: [[1, 10], [100, 30], [null, 60]] });
  c = (await chiama('GET', '/api/canoni')).find((x) => x.id === p.id); assert.equal(c.canone, 25);
  // annunci: 3 posti, il mio al 1°; un inserzionista non può prendere un posto occupato
  const a = await chiama('GET', '/api/annunci'); const mio = a.find((x) => x.mio); assert.equal(mio.posizione, 1);
  assert.deepEqual(mio.prezzi, [30, 27, 24], '1° pieno, 2° 90%, 3° 80%');
  await assert.rejects(chiama('POST', '/api/annunci', { titolo: 'Pane caldo', inserzionista: 'Forno Bianchi', zona: 'Via Bologna 300, Ferrara', posizione: 1 }), /già di «la tua pubblicità»/);
  let l = await chiama('POST', '/api/annunci', { titolo: 'Pane caldo', inserzionista: 'Forno Bianchi', zona: 'Via Bologna 300, Ferrara', posizione: 2, whatsapp: '347 000 2222' });
  const forno = l.find((x) => x.inserzionista === 'Forno Bianchi'); assert.equal(forno.visibile, false, 'non ancora pagato');
  assert.equal((await chiama('GET', '/api/stato')).annunci.length, 1);
  l = await chiama('POST', `/api/annunci/${forno.id}/rinnova`);
  const f2 = l.find((x) => x.id === forno.id); assert.equal(f2.visibile, true); assert.equal(f2.prezzo, 27);
  assert.equal(f2.pagato_fino, piuGiorni(OGGI, 14));
  const st = await chiama('GET', '/api/stato'); assert.deepEqual(st.annunci.map((x) => x.posizione), [1, 2]); assert.equal(st.annuncio.posizione, 1);
  // il mio posso toglierlo: il 1° resta vuoto
  await chiama('PUT', `/api/annunci/${mio.id}`, { posizione: null });
  assert.deepEqual((await chiama('GET', '/api/stato')).annunci.map((x) => x.posizione), [2]);
  // scaduto: non si vede più e il posto si può dare ad altri
  db.prepare('UPDATE annunci SET pagato_fino = ? WHERE id = ?').run('2026-01-01', forno.id);
  assert.equal((await chiama('GET', '/api/stato')).annunci.length, 0);
  await chiama('POST', '/api/annunci', { titolo: 'Formaggi', inserzionista: 'Caseificio', posizione: 2 });
  await chiama('PUT', '/api/tariffe', { produttori: [[250, 0], [500, 15], [1000, 25], [2500, 39], [5000, 59], [10000, 89], [null, 119]], home: [[500, 19], [1000, 29], [2500, 49], [5000, 79], [10000, 129], [null, 199]] });
});

test('ricerca mentre si scrive: prima quello che compri di solito, ogni parola restringe; spunta veloce', async () => {
  const s1 = await chiama('GET', '/api/suggerisci?q=zucch');
  assert.ok(s1.length >= 2); assert.ok(s1.some((x) => x.tipo === 'voce' && x.nome === 'Zucchine'));
  const bio = db.prepare("SELECT id, voce_id FROM prodotti WHERE nome = 'Zucchine italiane bio'").get();
  await chiama('POST', '/api/preferiti', { voce_id: bio.voce_id, prodotto_id: bio.id });
  const s2 = await chiama('GET', '/api/suggerisci?q=zucch');
  assert.equal(s2[0].tipo, 'solito'); assert.equal(s2[0].prodotto_id, bio.id);
  const s3 = await chiama('GET', '/api/suggerisci?q=zucchine%20bio');
  assert.ok(s3.filter((x) => x.prodotto_id).every((x) => /bio/i.test(x.nome)), 'la seconda parola restringe');
  assert.equal((await chiama('GET', '/api/suggerisci?q=a')).length, 0);
  await chiama('DELETE', '/api/lista');
  const l = await chiama('POST', '/api/lista', { voce_id: bio.voce_id, prodotto_id: bio.id, quantita: 1, scelto: true });
  assert.deepEqual(await chiama('PUT', `/api/lista/${l[0].id}?breve=1`, { preso: true }), { ok: true });
  assert.equal((await chiama('GET', '/api/lista'))[0].preso, 1);
  await chiama('DELETE', '/api/lista'); assert.equal((await chiama('GET', '/api/lista')).length, 0);
});

test('orari dei negozi: lettura del formato della mappa, aperto/chiude presto/chiuso, festivi, mappa, sito e correzione a mano', async () => {
  const o = await import('../server/orari.js');
  const ag = await import('../server/orari-aggiorna.js');
  const vicini = await import('../server/vicini.js');
  const claude = await import('../server/claude.js');
  // lettura e riscrittura
  assert.equal(o.scriviOrari(o.leggiOrari('Mo-Sa 8:00-20:00, Su 9:00-13:00').giorni), 'Mo-Sa 08:00-20:00; Su 09:00-13:00');
  const t = o.leggiOrari('Mo-Fr 08:30-13:00,15:30-19:30; Sa 08:30-13:00; Su,PH off');
  assert.deepEqual(t.giorni[0], [[510, 780], [930, 1170]]); assert.deepEqual(t.giorni[6], []); assert.deepEqual(t.festivi, []);
  assert.equal(o.leggiOrari('orari variabili'), null);
  // stato: lunedì 2 novembre 2026
  const s = 'Mo-Sa 08:00-20:00; Su 09:00-13:00';
  assert.equal(o.fraseOrari(s, new Date(2026, 10, 2, 10, 0)).frase, 'Aperto fino alle 20:00');
  assert.equal(o.fraseOrari(s, new Date(2026, 10, 2, 19, 35)).colore, 'arancio');
  assert.equal(o.fraseOrari(s, new Date(2026, 10, 2, 19, 35)).frase, 'Chiude tra 25 minuti, alle 20:00');
  assert.equal(o.fraseOrari(s, new Date(2026, 10, 2, 20, 10)).frase, 'Chiuso adesso · riapre domani alle 8:00');
  assert.equal(o.fraseOrari('Mo-Fr 08:30-13:00,15:30-19:30', new Date(2026, 10, 3, 14, 0)).frase, 'Chiuso adesso · riapre oggi alle 15:30');
  assert.equal(o.fraseOrari('Mo-Sa 08:00-20:00; Su off', new Date(2026, 10, 7, 21, 0)).frase, 'Chiuso adesso · riapre lunedì alle 8:00');
  // festivi: Natale con «PH off» è chiuso anche se è venerdì; senza «PH» si avvisa
  assert.equal(o.fraseOrari('Mo-Su 08:00-20:00; PH off', new Date(2026, 11, 25, 10, 0)).colore, 'rosso');
  assert.match(o.fraseOrari('Mo-Su 08:00-20:00', new Date(2026, 11, 25, 10, 0)).frase, /oggi è festa/);
  assert.equal(o.festivo(new Date(2027, 2, 29)), true); // Pasquetta 2027
  assert.equal(o.fraseOrari('', new Date()).colore, 'grigio');

  // dalla mappa: un negozio senza orari li prende; quelli corretti a mano restano
  const tos = catena('Tosano');
  const nid = db.prepare("INSERT INTO negozi (catena_id, indirizzo, citta, lat, lng, osm_id, nome) VALUES (?, 'Via Orari 1', 'Ferrara', 44.83, 11.62, 'node/901', 'Tosano Orari')").run(tos).lastInsertRowid;
  const nid2 = db.prepare("INSERT INTO negozi (catena_id, indirizzo, citta, lat, lng, osm_id, nome) VALUES (?, 'Via Orari 2', 'Ferrara', 44.83, 11.62, 'way/902', 'Tosano Due')").run(tos).lastInsertRowid;
  db.prepare("UPDATE negozi SET orari_quando = '2099-01-01' WHERE osm_id NOT IN ('node/901', 'way/902')").run();
  let domanda = '';
  vicini.usaFetch(async (url, opz) => { domanda = decodeURIComponent(String(opz.body)); return { ok: true, json: async () => ({ elements: [
    { type: 'node', id: 901, tags: { opening_hours: 'Mo-Sa 08:00-20:30; Su 09:00-13:00', website: 'https://www.tosano.it/negozi/ferrara' } },
    { type: 'way', id: 902, tags: { website: 'https://esempio-tosano.it/ferrara-due' } },
  ] }) }; });
  assert.equal(await ag.orariDallaMappa(db), 2);
  assert.match(domanda, /node\(id:901\);way\(id:902\);/);
  let n = db.prepare('SELECT * FROM negozi WHERE id = ?').get(nid);
  assert.equal(n.orari, 'Mo-Sa 08:00-20:30; Su 09:00-13:00'); assert.equal(n.orari_fonte, 'mappa'); assert.equal(n.sito, 'https://www.tosano.it/negozi/ferrara');
  // il giro mostra gli orari del negozio
  const st = await chiama('GET', '/api/catene'); assert.equal(st.find((c) => c.nome === 'Tosano').negozi.find((x) => x.id === nid).orari, n.orari);

  // a mano: chiunque li corregge; la mappa poi non li cambia; «torna agli automatici» rimette quelli della mappa
  const sorella = await entra('351 400 0099', 'Sorella');
  const g = [[['8:00', '13:00'], ['15:30', '19:30']], [['8:00', '13:00'], ['15:30', '19:30']], [['8:00', '13:00']], [['8:00', '13:00'], ['15:30', '19:30']], [['8:00', '13:00'], ['15:30', '19:30']], [['8:00', '20:00']], []];
  await assert.rejects(chiama('POST', `/api/negozi/${nid}/orari`, { giorni: g.slice(0, 6) }, sorella), /7 giorni/);
  await assert.rejects(chiama('POST', `/api/negozi/${nid}/orari`, { giorni: [[['20:00', '8:00']], [], [], [], [], [], []] }, sorella), /dopo quella di apertura/);
  n = await chiama('POST', `/api/negozi/${nid}/orari`, { giorni: g, festivi: [] }, sorella);
  assert.equal(n.orari, 'Mo-Tu 08:00-13:00,15:30-19:30; We 08:00-13:00; Th-Fr 08:00-13:00,15:30-19:30; Sa 08:00-20:00; Su off; PH off'); assert.equal(n.orari_fonte, 'mano');
  db.prepare("UPDATE negozi SET orari_quando = NULL WHERE id = ?").run(nid);
  await ag.orariDallaMappa(db);
  assert.equal(db.prepare('SELECT orari_fonte FROM negozi WHERE id = ?').get(nid).orari_fonte, 'mano');
  n = await chiama('DELETE', `/api/negozi/${nid}/orari`, undefined, sorella);
  assert.equal(n.orari, 'Mo-Sa 08:00-20:30; Su 09:00-13:00'); assert.equal(n.orari_fonte, 'mappa');

  // dal sito: solo per i supermercati scelti da qualcuno e senza orari; prima i dati della pagina, poi Claude
  assert.equal(ag.urlSicuro('http://127.0.0.1/x'), null); assert.equal(ag.urlSicuro('localhost:3000'), null); assert.equal(ag.urlSicuro('www.conad.it/negozio'), 'https://www.conad.it/negozio');
  assert.equal(ag.orariStrutturati('<script type="application/ld+json">{"@type":"GroceryStore","openingHoursSpecification":[{"dayOfWeek":["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],"opens":"08:00:00","closes":"20:00:00"},{"dayOfWeek":"https://schema.org/Sunday","opens":"09:00","closes":"13:00"}]}</script>'), 'Mo-Sa 08:00-20:00; Su 09:00-13:00');
  assert.equal(ag.orariStrutturati('<script type="application/ld+json">[{"openingHours":"Mo-Sa 08:00-20:00"},{"openingHours":"Mo-Su 07:00-22:00"}]</script>'), null); // due negozi diversi: non si sa
  db.prepare('INSERT OR IGNORE INTO famiglia_catene (famiglia_id, catena_id) VALUES ((SELECT famiglia_id FROM utenti LIMIT 1), ?)').run(tos);
  db.prepare("UPDATE negozi SET sito_quando = '2099-01-01' WHERE id NOT IN (?, ?)").run(nid, nid2);
  const pagine = { 'https://esempio-tosano.it/ferrara-due': '<html><body><h1>Tosano Ferrara due</h1><p>Orari: dal lunedì al sabato 8.00 - 20.00, domenica 9.00 - 12.30</p></body></html>' };
  const lette = [];
  ag.usaFetch(async (url) => { lette.push(url); return { ok: true, text: async () => pagine[url] || '' }; });
  process.env.ANTHROPIC_API_KEY = 'prova'; process.env.ORARI_WEB = '1'; let aClaude = '';
  claude.usaFetch(async (url, opz) => { aClaude = JSON.parse(opz.body).messages[0].content; return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{"orari": "Mo-Sa 08:00-20:00; Su 09:00-12:30"}' }], usage: { input_tokens: 900, output_tokens: 20 } }) }; });
  assert.equal(await ag.orariDalSito(db), 1);
  assert.deepEqual(lette, ['https://esempio-tosano.it/ferrara-due']); // quello con gli orari della mappa non si legge
  assert.equal(aClaude, '', 'il testo in italiano si legge senza Claude: niente crediti');
  const n2 = db.prepare('SELECT * FROM negozi WHERE id = ?').get(nid2);
  assert.equal(n2.orari, 'Mo-Sa 08:00-20:00; Su 09:00-12:30'); assert.equal(n2.orari_fonte, 'sito');
  assert.equal(await ag.orariDalSito(db), 0); // riletto solo dopo un mese
  // la mappa senza orari non cancella quelli presi dal sito
  db.prepare("UPDATE negozi SET orari_quando = NULL WHERE id = ?").run(nid2); await ag.orariDallaMappa(db);
  assert.equal(db.prepare('SELECT orari_fonte FROM negozi WHERE id = ?').get(nid2).orari_fonte, 'sito');
  delete process.env.ANTHROPIC_API_KEY; delete process.env.ORARI_WEB;
});

test('offerte di oggi per reparto: solo nei miei supermercati e vicino a casa, risparmio, «metti in lista», conteggio nello stato', async () => {
  // Nazario ha Eurospin e Lidl tra i suoi; le zucchine Eurospin sono in offerta (prova precedente) e arriva un volantino Lidl.
  // Il volantino Lidl della prova precedente comincia il 3 novembre: non deve nascondere l'offerta di oggi.
  const pz = db.prepare("SELECT id FROM prodotti WHERE nome = 'Clementine Lidl'").get().id;
  db.prepare("INSERT INTO prezzi (prodotto_id, catena_id, citta, prezzo, unitario, offerta, rilevato_il, valido_al, fonte, prezzo_pieno) VALUES (?, ?, '', 0.89, 0.89, 1, ?, '2026-11-30', 'volantino', 1.49)").run(pz, catena('Lidl'), OGGI);
  const o = await chiama('GET', '/api/offerte');
  assert.ok(o.offerte.length >= 2);
  const nomi = o.offerte.map((x) => x.nome);
  assert.ok(nomi.includes('Clementine Lidl')); assert.ok(nomi.includes('Zucchine sfuse'));
  assert.ok(o.reparti.some((r) => r.reparto === 'ortofrutta' && r.n >= 2));
  const zs = o.offerte.find((x) => x.nome === 'Zucchine sfuse');
  assert.equal(zs.reparto, 'ortofrutta'); assert.equal(zs.solito, true, 'è un preferito: viene per primo'); assert.equal(o.offerte[0].solito, true);
  assert.ok(zs.normale > 0.99 && zs.risparmio > 0, 'risparmio rispetto al prezzo normale conosciuto');
  assert.equal(zs.daMettere, 1); assert.equal(zs.sfuso, true);
  // il prezzo pieno del volantino serve per dire quanto si risparmia
  const cl = o.offerte.find((x) => x.nome === 'Clementine Lidl');
  assert.equal(cl.prezzo, 0.89); assert.equal(cl.normale, 1.49); assert.equal(cl.risparmio, 40); assert.equal(cl.valido_al, '2026-11-30');
  // un'offerta di un supermercato lontano e non mio non compare
  const lontano = db.prepare("INSERT INTO catene (nome, ambito) VALUES ('Supermercato Lontano', 'nazionale')").run().lastInsertRowid;
  const prodLontano = db.prepare("INSERT INTO prodotti (voce_id, nome, tipo, marca, origine, bio, sfuso, quantita) VALUES (?, 'Banane lontane', 'senza', '', '', 0, 1, NULL)").run(voce('Zucchine')).lastInsertRowid;
  db.prepare("INSERT INTO prezzi (prodotto_id, catena_id, citta, prezzo, unitario, offerta, rilevato_il, fonte) VALUES (?, ?, '', 0.5, 0.5, 1, ?, 'scaffale')").run(prodLontano, lontano, OGGI);
  assert.ok(!(await chiama('GET', '/api/offerte')).offerte.some((x) => x.nome === 'Banane lontane'));
  // metti in lista dall'offerta: finisce in lista già scelta, e l'offerta risulta «in lista»
  await chiama('DELETE', '/api/lista');
  const l = await chiama('POST', '/api/lista', { voce_id: zs.voce_id, prodotto_id: zs.prodotto_id, quantita: zs.daMettere, scelto: true });
  assert.equal(l.length, 1); assert.equal(l[0].prodotto_id, zs.prodotto_id); assert.equal(l[0].scelto, 1);
  assert.equal((await chiama('GET', '/api/offerte')).offerte.find((x) => x.prodotto_id === zs.prodotto_id).inLista, true);
  // lo stato dice quante offerte ci sono (per la home e la voce «Offerte» in basso)
  const st = await chiama('GET', '/api/stato'); assert.equal(st.offerte, o.offerte.length);
});

test('orari da internet: Claude cerca sul web i negozi dei supermercati scelti rimasti senza orari; quelli a mano non si toccano; una volta al mese', async () => {
  const ag = await import('../server/orari-aggiorna.js');
  const claude = await import('../server/claude.js');
  const tos = catena('Tosano');
  const nid = db.prepare("INSERT INTO negozi (catena_id, indirizzo, citta, lat, lng, nome) VALUES (?, 'Via Web 5', 'Ferrara', 44.83, 11.62, '')").run(tos).lastInsertRowid;
  const nidMano = db.prepare("INSERT INTO negozi (catena_id, indirizzo, citta, lat, lng, nome, orari, orari_fonte) VALUES (?, 'Via Mano 6', 'Ferrara', 44.83, 11.62, '', 'Mo-Su 08:00-20:00', 'mano')").run(tos).lastInsertRowid;
  db.prepare("UPDATE negozi SET web_quando = '2099-01-01' WHERE id NOT IN (?, ?)").run(nid, nidMano);
  delete process.env.ANTHROPIC_API_KEY; process.env.ORARI_WEB = '1';
  assert.equal(await ag.orariDalWeb(db), 0, 'senza chiave non si cerca');
  process.env.ANTHROPIC_API_KEY = 'prova'; delete process.env.ORARI_WEB;
  assert.equal(await ag.orariDalWeb(db), 0, 'spenta di norma: niente crediti');
  process.env.ORARI_WEB = '1';
  const domande = [];
  claude.usaFetch(async (url, opz) => { const b = JSON.parse(opz.body); domande.push(b); return { ok: true, json: async () => ({ content: [{ type: 'server_tool_use', id: 'x', name: 'web_search', input: { query: 'Tosano Via Web 5 Ferrara orari' } }, { type: 'web_search_tool_result', tool_use_id: 'x', content: [] }, { type: 'text', text: 'Ecco: {"orari": "Mo-Sa 08:30-20:30; Su 09:00-13:00", "fonte": "https://www.tosano.it/negozi/ferrara-via-web"}' }], usage: { input_tokens: 4000, output_tokens: 80, server_tool_use: { web_search_requests: 2 } } }) }; });
  assert.equal(await ag.orariDalWeb(db), 1);
  assert.equal(domande.length, 1, 'cercato solo il negozio senza orari');
  assert.equal(domande[0].tools[0].type, 'web_search_20250305'); assert.equal(domande[0].tools[0].max_uses, 3);
  assert.match(domande[0].messages[0].content, /Tosano, Via Web 5, Ferrara/);
  const n = db.prepare('SELECT * FROM negozi WHERE id = ?').get(nid);
  assert.equal(n.orari, 'Mo-Sa 08:30-20:30; Su 09:00-13:00'); assert.equal(n.orari_fonte, 'web'); assert.equal(n.orari_url, 'https://www.tosano.it/negozi/ferrara-via-web');
  assert.equal(db.prepare('SELECT orari_fonte FROM negozi WHERE id = ?').get(nidMano).orari_fonte, 'mano');
  assert.equal(await ag.orariDalWeb(db), 0, 'ricercato solo dopo un mese');
  // costo stimato: due ricerche più le parole
  const { uso } = await claude.chiediJson('prova', { ricercaWeb: 1 }); assert.equal(uso.ricerche, 2); assert.ok(uso.euro >= 0.02 && uso.euro < 0.05);
  // l'elenco dei vicini porta gli orari e la fonte, così si aprono nella pagina
  const v = await chiama('GET', '/api/negozi/vicini?raggio=10'); const mio = v.negozi.find((x) => x.id === nid);
  assert.ok(mio); assert.equal(mio.orari_fonte, 'web'); assert.equal(mio.orari_url, n.orari_url);
  delete process.env.ANTHROPIC_API_KEY; delete process.env.ORARI_WEB;
});


test('orari dalla pagina ufficiale senza Claude: testo in italiano letto dal server, pagina indicata da chi gestisce, riletta ogni mese', async () => {
  const ag = await import('../server/orari-aggiorna.js');
  const o = ag.orariDalTesto('Orari di apertura: dal lunedì al sabato 8:00 - 20:00, domenica 9:00 - 13:00');
  assert.deepEqual(o.giorni[0], [[480, 1200]]); assert.deepEqual(o.giorni[6], [[540, 780]]);
  assert.deepEqual(ag.orariDalTesto('Lun - Ven 8.30-13.00 / 16.00-19.30 Sab 8.30-13.00 Dom chiuso').giorni[0], [[510, 780], [960, 1170]]);
  assert.equal(ag.orariDalTesto('Conad City via Roma 10. Telefono 0532 123456.'), null);
  assert.equal(ag.orariDalTesto('lun 8-20'), null, 'un giorno solo non basta');
  // chi gestisce incolla la pagina del negozio: il server la legge subito (qui una pagina finta con il testo in italiano)
  const tos = catena('Tosano');
  const nid = db.prepare("INSERT INTO negozi (catena_id, indirizzo, citta, lat, lng) VALUES (?, 'Viale Krasnodar 25', 'Ferrara', 44.83, 11.62)").run(tos).lastInsertRowid;
  const pagine = { 'https://www.conad.it/ricerca-negozi/conad-viale-krasnodar-25-44100-ferrara--006176': '<html><body><h1>Conad Viale Krasnodar 25</h1><div>Orari<p>Lunedì - Sabato 07:30 - 20:00</p><p>Domenica 08:30 - 13:00</p></div></body></html>' };
  ag.usaFetch(async (url) => ({ ok: !!pagine[url], status: pagine[url] ? 200 : 404, text: async () => pagine[url] || '' }));
  const sorella = await entra('351 400 0099', 'Sorella');
  await assert.rejects(chiama('PUT', `/api/negozi/${nid}/pagina-orari`, { url: 'https://www.conad.it/x' }, sorella), /riservata/);
  await assert.rejects(chiama('PUT', `/api/negozi/${nid}/pagina-orari`, { url: 'https://www.conad.it/x' }), /Non riesco ad aprire/);
  const r = await chiama('PUT', `/api/negozi/${nid}/pagina-orari`, { url: Object.keys(pagine)[0] });
  assert.equal(r.letti, true); assert.equal(r.come, 'testo della pagina'); assert.equal(r.negozio.orari, 'Mo-Sa 07:30-20:00; Su 08:30-13:00'); assert.equal(r.negozio.orari_fonte, 'sito');
  // la pagina indicata a mano si rilegge ogni mese anche se gli orari ci sono già, senza Claude
  delete process.env.ANTHROPIC_API_KEY;
  pagine[Object.keys(pagine)[0]] = '<html><body>Orari: lunedì - sabato 08:00 - 21:00, domenica 09:00 - 13:00</body></html>';
  db.prepare("UPDATE negozi SET sito_quando = '2020-01-01' WHERE id = ?").run(nid); db.prepare("UPDATE negozi SET sito_quando = '2099-01-01' WHERE id <> ?").run(nid);
  assert.equal(await ag.orariDalSito(db), 1);
  assert.equal(db.prepare('SELECT orari FROM negozi WHERE id = ?').get(nid).orari, 'Mo-Sa 08:00-21:00; Su 09:00-13:00');
  // con il link vuoto si toglie la pagina
  assert.equal((await chiama('PUT', `/api/negozi/${nid}/pagina-orari`, { url: '' })).negozio.orari_url, '');
});

test('confezione multipla: 4 scatolette da 125 g → 500 g in totale, pezzi salvati, prezzo al kg giusto; anche dalla scheda', async () => {
  const sg = await chiama('POST', '/api/prodotti', { voce_id: voce('Zucchine'), nome: 'Filetti di sgombro 4 x 125 g', tipo: 'marca', marca: 'Prova', quantita: '500', formato_unita: 'g', pezzi: 4 });
  assert.equal(sg.quantita, 0.5); assert.equal(sg.pezzi, 4);
  await chiama('POST', '/api/prezzi', { prodotto_id: sg.id, catena_id: catena('Lidl'), prezzo: '3,00' });
  const p = (await chiama('GET', `/api/prodotti/${sg.id}`)).storia.at(-1); assert.equal(p.unitario, 6, '3 € per 500 g = 6 €/kg');
  // dalla scheda, un prodotto senza formato: si scrive pezzi e peso totale
  const senza = await chiama('POST', '/api/prodotti', { voce_id: voce('Zucchine'), nome: 'Sgombro senza formato', tipo: 'senza' });
  assert.equal(senza.quantita, null);
  const dopo = await chiama('PUT', `/api/prodotti/${senza.id}`, { quantita: '0,5', formato_unita: 'kg', pezzi: '4', sfuso: false });
  assert.equal(dopo.quantita, 0.5); assert.equal(dopo.pezzi, 4);
  // pezzi = 1 o vuoto → nessun pezzo salvato
  assert.equal((await chiama('PUT', `/api/prodotti/${senza.id}`, { pezzi: '1' })).pezzi, null);
});

test('nuovo prodotto in una pagina sola: dal nome l\'app propone la voce (esistente o nuova, con reparto e unità)', async () => {
  // «Zucchine» esiste: la propone
  let r = await chiama('GET', '/api/voci/proposta?nome=Zucchine%20bio%20Italia%20500%20g');
  assert.equal(r.voci[0]?.nome, 'Zucchine'); assert.equal(r.nuova.nome, 'Zucchine'); assert.equal(r.nuova.unita, 'kg'); assert.equal(r.nuova.reparto, 'ortofrutta');
  // un prodotto mai visto: nessuna voce, proposta di voce nuova pulita dal formato
  r = await chiama('GET', '/api/voci/proposta?nome=Filetti%20di%20sgombro%20Delicius%204%20x%20125%20g');
  assert.equal(r.nuova.nome, 'Filetti di sgombro'); assert.equal(r.nuova.unita, 'kg');
  r = await chiama('GET', '/api/voci/proposta?nome=ab'); assert.deepEqual(r, { voci: [], nuova: null });
  // «Mele Golden» non va in «Aceto di mele»
  await chiama('POST', '/api/voci', { nome: 'Aceto di mele', reparto: 'dispensa', unita: 'l' });
  r = await chiama('GET', '/api/voci/proposta?nome=Mele%20Golden%20Trentino');
  assert.ok(!r.voci.some((v) => v.nome === 'Aceto di mele')); assert.equal(r.nuova.reparto, 'ortofrutta'); assert.equal(r.nuova.unita, 'kg');
});


test('offerte in arrivo e categorie: un volantino che comincia dopodomani sta in «In arrivo», le categorie sono solo quelle con offerte', async () => {
  const cat = await import('../server/categorie.js');
  assert.equal(cat.categoriaDi('Zucchine', 'Zucchine sfuse', 'ortofrutta'), 'verdura');
  assert.equal(cat.categoriaDi('Latte di kefir', 'Latte di kefir Alpli', 'fresco'), 'latticini');
  assert.equal(cat.categoriaDi('Pizza margherita', 'Bella Napoli', 'surgelati'), 'surgelati');
  assert.equal(cat.categoriaDi('Filetti di sgombro', '', 'dispensa'), 'pesce');
  assert.equal(cat.nomeCategoria('pesce'), 'Pesce');
  const o = await chiama('GET', '/api/offerte');
  assert.ok(o.categorie.length >= 1); assert.ok(o.categorie.every((c) => c.n > 0 && c.nome));
  assert.ok(o.offerte.every((x) => x.categoria));
  // un'offerta che comincia tra due giorni: in arrivo, non tra quelle di oggi
  const cl = db.prepare("SELECT id FROM prodotti WHERE nome = 'Clementine Lidl'").get().id;
  const dal = piuGiorni(OGGI, 2); const al = piuGiorni(OGGI, 9);
  db.prepare("INSERT INTO prezzi (prodotto_id, catena_id, citta, prezzo, unitario, offerta, rilevato_il, valido_dal, valido_al, fonte, prezzo_pieno) VALUES (?, ?, '', 0.79, 0.79, 1, ?, ?, ?, 'volantino', 1.49)").run(cl, catena('Lidl'), OGGI, dal, al);
  const o2 = await chiama('GET', '/api/offerte');
  const arr = o2.inArrivo.find((x) => x.prodotto_id === cl && x.valido_dal === dal);
  assert.ok(arr, 'in arrivo'); assert.equal(arr.prezzo, 0.79); assert.equal(arr.risparmio, 47); assert.equal(arr.categoria, 'frutta');
  assert.ok(!o2.offerte.some((x) => x.prodotto_id === cl && x.prezzo === 0.79), 'non tra quelle di oggi');
  assert.ok(o2.categorieInArrivo.some((c) => c.categoria === 'frutta'));
});
