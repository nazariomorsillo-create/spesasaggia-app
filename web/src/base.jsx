// Pezzi comuni: chiamate al server, formati italiani, etichette, cartellino del prezzo.
import { useCallback, useEffect, useRef, useState } from 'react';

// torna in cima: scorre il riquadro del contenuto (l'app è un guscio: la finestra non scorre)
export const suCima = () => { const m = document.getElementById('contenuto'); if (m) m.scrollTo(0, 0); window.scrollTo(0, 0); };
export async function api(url, { metodo = 'GET', corpo } = {}) {
  const r = await fetch(url, { method: metodo, headers: corpo !== undefined ? { 'Content-Type': 'application/json' } : {}, body: corpo !== undefined ? JSON.stringify(corpo) : undefined, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && j.errore === 'accesso') { window.dispatchEvent(new Event('accesso')); throw new Error('Serve la password'); }
  if (!r.ok) { const e = new Error(j.errore || 'Qualcosa non ha funzionato'); e.dati = j; throw e; } // la risposta resta attaccata all'errore
  return j;
}
export function useDati(url) {
  const [dati, setDati] = useState(null); const [errore, setErrore] = useState('');
  const ricarica = useCallback(() => (url ? api(url).then((d) => { setDati(d); setErrore(''); return d; }).catch((e) => setErrore(e.message)) : null), [url]);
  useEffect(() => { ricarica(); }, [ricarica]);
  return { dati, errore, ricarica, setDati };
}
export const euro = (n) => (n == null ? '' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n));
export const num = (n, d = 2) => (n == null ? '' : String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ','));
export const data = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
export const UNITA = { kg: 'kg', l: 'l', pz: 'pz' };
export const QUALITA = [['qualsiasi', 'Normale'], ['italiano', 'Italiano'], ['bio', 'Bio'], ['bio_italiano', 'Bio italiano']];
export const REPARTI = [['ortofrutta', 'Frutta e verdura'], ['pane', 'Pane'], ['fresco', 'Fresco e frigo'], ['dispensa', 'Dispensa'], ['surgelati', 'Surgelati'], ['bevande', 'Bevande'], ['casa', 'Casa e igiene'], ['altro', 'Altro']];
export const TIPI = [['senza', 'Senza marca / sfuso'], ['supermercato', 'Marchio del supermercato'], ['marca', 'Di marca']];
export const mem = { leggi: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, scrivi: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* niente */ } } };
export const conVirgola = (s) => String(s ?? '').replace('.', ',');

// Quantità come la direbbe una persona: 300 g, 1,5 kg, 2 litri, 6 pezzi
// il nome del «pezzo» (lavaggio, rotolo, capsula…) e il suo plurale
export const plurale = (p) => (/io$/.test(p) ? p.slice(0, -1) : /o$/.test(p) ? `${p.slice(0, -1)}i` : /a$/.test(p) ? `${p.slice(0, -1)}e` : p);
export const perUnita = (u, pezzo = '') => (u === 'pz' ? (pezzo || 'pezzo') : u);
export function quanto(q, u, circa = false, pezzo = '') {
  const c = circa ? 'circa ' : '';
  if (u === 'kg') return q < 1 ? `${c}${Math.round(q * 1000)} g` : `${c}${num(q)} kg`;
  if (u === 'l') return q < 1 ? `${c}${Math.round(q * 1000)} ml` : `${c}${num(q)} ${q === 1 ? 'litro' : 'litri'}`;
  const p = pezzo || 'pezzo';
  return `${c}${num(q)} ${q === 1 ? p : plurale(p)}`;
}
export const nomeQualita = (k) => ({ italiano: 'Italiano', bio: 'Bio', bio_italiano: 'Bio italiano' }[k] || '');

export function Cartellino({ n, grande = false, per }) {
  return <span className={`cartellino${grande ? ' grande' : ''}`}>{euro(n)}{per && <small>/{per}</small>}</span>;
}
export function Etichette({ p }) {
  return <span className="etichette">
    {p.bio ? <span className="pill bio">Bio</span> : null}
    {p.origine === 'italia' ? <span className="pill ita">Italia</span> : p.origine === 'estero' ? <span className="pill">Estero</span> : null}
    {p.tipo === 'marca' ? <span className="pill marca">{p.marca || 'Marca'}</span> : p.tipo === 'supermercato' ? <span className="pill">Marchio {p.catena || 'supermercato'}</span> : null}
    {p.confrontabile === false || p.formatoMancante ? <span className="pill vecchio">formato da completare</span> : null}
  </span>;
}
export function StatoPrezzo({ s, al }) {
  if (s === 'scaduto') return <span className="pill scaduto">scaduto</span>;
  if (s === 'vecchio') return <span className="pill vecchio">da ricontrollare</span>;
  return al ? <span className="pill">fino al {data(al)}</span> : null;
}
export function Annuncio({ a }) {
  if (!a) return null;
  const wa = a.whatsapp ? `https://wa.me/${a.whatsapp}${a.messaggio ? `?text=${encodeURIComponent(a.messaggio)}` : ''}` : '';
  return <aside className="annuncio" aria-label="Pubblicità">
    <span className="etichetta">Pubblicità</span>
    <h3>{a.titolo}</h3>{a.testo && <p>{a.testo}</p>}
    {(wa || a.link) && <div className="annuncio-azioni">
      {wa && <a className="b wa" href={wa} target="_blank" rel="noopener"><Icona n="whatsapp" d={24} /> Scrivimi su WhatsApp</a>}
      {a.link && <a className="b scopri" href={a.link} target="_blank" rel="noopener">{a.bottone || 'Scopri di più'}</a>}
    </div>}
    {a.nota && <p className="nota">{a.nota}</p>}
  </aside>;
}
// Icone semplici, disegnate a tratto: si leggono meglio delle emoji sui telefoni vecchi
const TRATTI = {
  microfono: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></>,
  lista: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1.2" /><circle cx="4.5" cy="12" r="1.2" /><circle cx="4.5" cy="18" r="1.2" /></>,
  negozio: <><path d="M4 9.5 5.5 4h13L20 9.5" /><path d="M4 9.5h16v1a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0 2.7 2.7 0 0 1-5.3 0z" /><path d="M5.5 12v8h13v-8M10 20v-5h4v5" /></>,
  altro: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
  codice: <><path d="M4 6v12M7 6v12M10.5 6v12M13 6v12M16.5 6v12M20 6v12" /></>,
  scontrino: <><path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  cerca: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>,
  spunta: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  chiudi: <path d="M6 6l12 12M18 6 6 18" />,
  indietro: <path d="M15 5l-7 7 7 7" />,
  avanti: <path d="M9 5l7 7-7 7" />,
  foto: <><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.6-2.2h5.4L16.3 7h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" /><circle cx="12" cy="12.8" r="3.6" /></>,
  galleria: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="M20.5 15.5l-4.5-4.5-6 6.5" /><path d="M3.5 17l4-4 3 3" /></>,
  whatsapp: <><path d="M4.5 19.5l1.2-3.6A8 8 0 1 1 8.4 18.6z" /><path d="M9.2 8.6c.2-.5.5-.5.8-.5h.5c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .5-.1.6l-.5.6c.4.9 1.3 1.8 2.3 2.3l.6-.5c.2-.2.4-.2.6-.1l1.6.7c.3.1.4.3.4.5v.5c0 .3-.1.6-.5.8-.6.3-1.6.4-3-.3a8 8 0 0 1-3.5-3.5c-.7-1.4-.6-2.4-.4-3z" /></>,
  aiuto: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7" /><circle cx="12" cy="17" r=".6" /></>,
  orologio: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  offerta: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" /><path d="M15 9l-5 5" /></>,
  persone: <><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.2c2.6.1 4.4 1.6 5 4.8" /></>,
  cestino: <><path d="M4 7h16" /><path d="M9 7V4.5h6V7" /><path d="M6.5 7l1 13h9l1-13" /><path d="M10 11v5.5M14 11v5.5" /></>,
  mappa: <><path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z" /><circle cx="12" cy="9.8" r="2.3" /></>,
};
export function Icona({ n, d = 26 }) {
  return <svg className="icona" width={d} height={d} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{TRATTI[n]}</svg>;
}

// Semaforo della qualità (stesse soglie del server)
export function giudizioDi(q) {
  if (q == null) return null;
  if (q >= 75) return { parola: 'Ottimo', colore: 'verde' };
  if (q >= 55) return { parola: 'Buono', colore: 'verdino' };
  if (q >= 35) return { parola: 'Così così', colore: 'giallo' };
  return { parola: 'Scarso', colore: 'rosso' };
}
export function Semaforo({ q, piccolo = false, sempre = false, casa = false }) {
  const g = giudizioDi(q);
  if (!g && casa) return sempre ? <span className={`semaforo ignoto${piccolo ? ' piccolo' : ''}`}><span className="luce" aria-hidden="true" />Nessun voto ancora</span> : null;
  if (!g) return sempre ? <span className={`semaforo ignoto${piccolo ? ' piccolo' : ''}`}><span className="luce" aria-hidden="true" />Voto da scoprire</span> : null;
  return <span className={`semaforo ${g.colore}${piccolo ? ' piccolo' : ''}`}><span className="luce" aria-hidden="true" /><b>{q}</b>/100 {g.parola}</span>;
}

// Foto del prodotto: dal telefono (fotocamera posteriore), ridotta a 1000 px e mandata al server
// foto ridotta nel telefono prima di mandarla: meno attesa e meno traffico
export async function riduciFoto(f, lato = 1000, qualita = 0.82) {
  const img = (window.createImageBitmap ? await createImageBitmap(f, { imageOrientation: 'from-image' }).catch(() => null) : null) || await caricaImmagine(f);
  const k = Math.min(1, lato / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', qualita);
}
function caricaImmagine(file) {
  return new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('Questa foto non si apre: provane un\'altra')); i.src = URL.createObjectURL(file); });
}
export function ScattaFoto({ foto, onFoto }) {
  const [stato, setStato] = useState(''); const camera = useRef(null); const galleria = useRef(null);
  const scelta = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setStato('Preparo la foto…');
    try {
      const r = await api('/api/foto', { metodo: 'POST', corpo: { dati: await riduciFoto(f) } });
      onFoto(r.foto); setStato('');
    } catch (x) { setStato(x.message || 'Non sono riuscito a caricare la foto: riprova'); }
  };
  return <div className="foto-campo">
    {foto ? <img src={foto} alt="Foto del prodotto" /> : <button type="button" className="foto-vuota" onClick={() => camera.current?.click()}><Icona n="foto" d={32} /><span>Aggiungi foto</span></button>}
    <div className="colonna">
      <button type="button" className="b" onClick={() => camera.current?.click()}><Icona n="foto" /> {foto ? 'Rifai la foto' : 'Fai una foto'}</button>
      <button type="button" className="b" onClick={() => galleria.current?.click()}><Icona n="galleria" /> Scegli dalle foto</button>
      {foto && <button type="button" className="b rosso piccolo" onClick={() => onFoto('')}>Togli la foto</button>}
      {stato && <span className="muto piccolo" role="status">{stato}</span>}
    </div>
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={scelta} />
    <input ref={galleria} type="file" accept="image/*" hidden onChange={scelta} />
  </div>;
}

// Quale supermercato: i tuoi come pulsanti (con la stella), gli altri cercando per nome; se manca si aggiunge.
// Se del supermercato scelto non c'è un negozio nella città, si chiede l'indirizzo (serve per il giro; si può saltare).
export function ScegliCatena({ valore, onScelta }) {
  const catene = useDati('/api/catene');
  const [q, setQ] = useState(''); const [err, setErr] = useState('');
  const [chiedi, setChiedi] = useState(null); const [indirizzo, setIndirizzo] = useState(''); const [attesa, setAttesa] = useState(false);
  const [forn, setForn] = useState(false); const [nomeForn, setNomeForn] = useState('');
  const aggiungiFornitore = async () => { setAttesa(true); setErr(''); try { const r = await api('/api/catene', { metodo: 'POST', corpo: { nome: nomeForn.trim(), fornitore: true } }); await catene.ricarica(); onScelta(r.catena.id); setForn(false); setNomeForn(''); } catch (e) { setErr(e.message); } finally { setAttesa(false); } };
  const tutte = catene.dati || [];
  const mie = tutte.filter((c) => c.mia || c.id === valore);
  const fornitoriUsati = tutte.filter((c) => c.tipo === 'fornitore' && !mie.includes(c) && nomeForn.trim().length >= 2 && c.nome.toLowerCase().includes(nomeForn.trim().toLowerCase())).slice(0, 5);
  const trovate = q.trim().length >= 1 ? tutte.filter((c) => c.nome.toLowerCase().includes(q.trim().toLowerCase()) && !mie.includes(c)).slice(0, 8) : [];
  const scegli = (c) => { onScelta(c.id); setQ(''); setErr(''); setChiedi(c.negozi_citta ? null : c); };
  const aggiungi = async () => { setAttesa(true); try { const r = await api('/api/catene', { metodo: 'POST', corpo: { nome: q.trim() } }); await catene.ricarica(); scegli({ ...r.catena, negozi_citta: 0 }); } catch (e) { setErr(e.message); } finally { setAttesa(false); } };
  const salvaNegozio = async () => { setAttesa(true); setErr(''); try { await api('/api/negozi', { metodo: 'POST', corpo: { catena_id: chiedi.id, indirizzo: indirizzo.trim() } }); await catene.ricarica(); setChiedi(null); setIndirizzo(''); } catch (e) { setErr(e.message); } finally { setAttesa(false); } };
  return <div className="colonna" style={{ gap: 8 }}>
    {mie.length > 0 && <div className="scelte grandi">{mie.map((c) => <button type="button" key={c.id} aria-pressed={valore === c.id} onClick={() => scegli(c)}>{c.mia ? '★ ' : ''}{c.nome}</button>)}</div>}
    <label className="campo-cerca piccolo-cerca"><Icona n="cerca" d={22} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={mie.length ? 'Un altro supermercato? Cerca per nome' : 'Cerca il supermercato: Conad, Coop, Penny…'} autoComplete="off" aria-label="Cerca il supermercato" /></label>
    {q.trim() && <div className="suggerimenti">
      {trovate.map((c) => <button type="button" key={c.id} onClick={() => scegli(c)}>{c.nome}{c.negozi_citta ? <span className="muto piccolo"> · in città</span> : null}</button>)}
      {q.trim().length >= 2 && !tutte.some((c) => c.nome.toLowerCase() === q.trim().toLowerCase()) && <button type="button" disabled={attesa} onClick={aggiungi}>➕ Aggiungi «{q.trim()}»</button>}
    </div>}
    {!forn ? <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setForn(true)}>Non l'hai comprato al supermercato? (fornitore, vendita diretta, online, farmacia)</button>
      : <div className="fornitore-box">
        <b>Da chi l'hai comprato?</b>
        <input className="in" value={nomeForn} onChange={(e) => setNomeForn(e.target.value)} placeholder="Es. Blanc Dent vendita diretta, Amazon, Farmacia Comunale" autoFocus />
        {fornitoriUsati.length > 0 && <div className="scelte">{fornitoriUsati.map((c) => <button type="button" key={c.id} onClick={() => { onScelta(c.id); setForn(false); setNomeForn(''); }}>{c.nome}</button>)}</div>}
        <span className="muto piccolo">Il prezzo vale ovunque e non entra nel giro dei supermercati: nel giro lo trovi tra le cose da comprare a parte.</span>
        <div className="riga"><button type="button" className="b pieno piccolo" disabled={attesa || nomeForn.trim().length < 2} onClick={aggiungiFornitore}>Usa «{nomeForn.trim() || '…'}»</button><button type="button" className="link" onClick={() => setForn(false)}>Annulla</button></div>
      </div>}
    {chiedi && chiedi.tipo !== 'fornitore' && <div className="avviso colonna" style={{ gap: 8 }}>
      <b>★ {chiedi.nome} è tra i tuoi supermercati. Dove sta quello dove vai?</b>
      <span>Via, numero e città. Serve per calcolare il giro. Se non lo sai, salta.</span>
      <input className="in" value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)} placeholder="Via Bologna 10, Ferrara" autoComplete="street-address" />
      <div className="riga"><button type="button" className="b pieno piccolo" disabled={attesa || indirizzo.trim().length < 5} onClick={salvaNegozio}>{attesa ? 'Cerco…' : 'Salva il negozio'}</button><button type="button" className="link" onClick={() => setChiedi(null)}>Salta</button></div>
    </div>}
    {err && <div className="errore">{err}</div>}
  </div>;
}

// ---------- formato di una confezione, anche multipla (4 scatolette da 125 g, 6 bottiglie da 1,5 l) ----------
// f = { n: '125', u: 'g', pezzi: '4', modo: 'uno' | 'tutti' }. Il totale va al server in «quantita» (nell'unità scelta) con «pezzi».
export const FORMATO_VUOTO = (u = 'g') => ({ n: '', u, pezzi: '', modo: 'uno' });
export const UNITA_FORMATO = (pezzo = '') => [['g', 'g'], ['kg', 'kg'], ['ml', 'ml'], ['l', 'litri'], ['pz', pezzo === 'lavaggio' ? 'lavaggi' : pezzo === 'rotolo' ? 'rotoli' : 'pezzi']];
export const numeroDa = (x) => { const n = Number(String(x ?? '').trim().replace(',', '.')); return n > 0 ? n : null; };
// quanto contiene tutta la confezione, nell'unità scelta (null se manca il dato)
export function totaleFormato(f) {
  const n = numeroDa(f.n); if (!n) return null;
  const pezzi = f.u !== 'pz' && Math.round(Number(f.pezzi)) > 1 ? Math.round(Number(f.pezzi)) : 1;
  return pezzi > 1 && f.modo === 'uno' ? Math.round(n * pezzi * 1000) / 1000 : n;
}
export const datiFormato = (f) => { const t = totaleFormato(f); const pezzi = f.u !== 'pz' && Math.round(Number(f.pezzi)) > 1 ? Math.round(Number(f.pezzi)) : null; return t ? { quantita: conVirgola(t), formato_unita: f.u, pezzi } : { quantita: null, formato_unita: undefined, pezzi: null }; };
const scriviMisura = (n, u, pezzo) => `${conVirgola(Math.round(n * 1000) / 1000)} ${u === 'pz' ? plurale(pezzo || 'pezzo') : u === 'l' ? 'l' : u}`;
export function FormatoConfezione({ f, setF, pezzo = '', spiegazione = true }) {
  const pezzi = Math.round(Number(f.pezzi)) > 1 ? Math.round(Number(f.pezzi)) : 1; const multi = f.u !== 'pz';
  const tot = totaleFormato(f);
  return <div className="formato-conf">
    {multi && <label className="campo">Quanti pezzi ci sono nella confezione?<span className="muto piccolo">1 se è un pezzo solo (una bottiglia, un pacco). 4 se sono 4 scatolette, 6 se sono 6 bottiglie.</span>
      <input inputMode="numeric" value={f.pezzi} onChange={(e) => setF({ ...f, pezzi: e.target.value.replace(/\D/g, '') })} placeholder="1" aria-label="Quanti pezzi nella confezione" /></label>}
    {multi && pezzi > 1 && <div className="scelte">{[['uno', 'So quanto pesa un pezzo'], ['tutti', 'So quanto pesa tutta la confezione']].map(([k, t]) => <button type="button" key={k} aria-pressed={f.modo === k} onClick={() => setF({ ...f, modo: k })}>{t}</button>)}</div>}
    {spiegazione && <span className="muto piccolo">{multi && pezzi > 1 ? (f.modo === 'uno' ? 'Quanto contiene un pezzo? Guarda sull\'etichetta: per esempio 125 g.' : 'Quanto contiene tutta la confezione? Per esempio 500 g.') : 'Quanto contiene la confezione? Per esempio 500 g, 1,5 litri, 6 pezzi. Serve per confrontare i prezzi tra formati diversi.'}</span>}
    <div className="formato-riga"><input inputMode="decimal" value={f.n} onChange={(e) => setF({ ...f, n: e.target.value })} placeholder={f.u === 'pz' ? '6' : f.u === 'g' || f.u === 'ml' ? '500' : '1,5'} aria-label="Quantità" />
      <div className="scelte">{UNITA_FORMATO(pezzo).map(([k, t]) => <button type="button" key={k} aria-pressed={f.u === k} onClick={() => setF({ ...f, u: k })}>{t}</button>)}</div></div>
    {tot && multi && pezzi > 1 && <span className="riepilogo-formato">Confezione da {pezzi} × {scriviMisura(f.modo === 'uno' ? numeroDa(f.n) : tot / pezzi, f.u, pezzo)} = <b>{scriviMisura(tot, f.u, pezzo)}</b></span>}
  </div>;
}
