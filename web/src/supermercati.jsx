// I miei supermercati: quelli dove la famiglia fa la spesa. Il giro e le proposte guardano questi.
import { useState } from 'react';
import { api, useDati, Icona } from './base.jsx';
import { Vicini } from './vicini.jsx';

// Google Maps con la strada in auto dalla posizione in cui sei (la partenza la mette il telefono)
export const strada = (n) => `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${n.lat != null ? `${n.lat},${n.lng}` : encodeURIComponent(`${n.indirizzo}${n.citta ? `, ${n.citta}` : ''}`)}`;
const distanza = (a, b) => { const r = (x) => (x * Math.PI) / 180; const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(h)); };
export function MieiSupermercati({ stato }) {
  const c = useDati('/api/catene');
  const [q, setQ] = useState(''); const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [attesa, setAttesa] = useState(false);
  const [indirizzi, setIndirizzi] = useState({});
  const tutte = c.dati || []; const mie = tutte.filter((x) => x.mia);
  const citta = String(stato.impostazioni.citta || '').toLowerCase(); const casa = stato.impostazioni.casa;
  const trovate = q.trim() ? tutte.filter((x) => !x.mia && x.nome.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  const senzaNegozio = mie.filter((x) => !x.negozi.some((n) => n.attivo && (n.citta.toLowerCase() === citta || (casa?.lat && n.lat != null && distanza(casa, n) <= (stato.famiglia?.raggio || 10)))));
  const fai = async (p, ok) => { setErr(''); setMsg(''); setAttesa(true); try { const d = await p; if (Array.isArray(d)) c.setDati(d); else await c.ricarica(); if (ok) setMsg(ok); } catch (e) { setErr(e.message); } finally { setAttesa(false); } };
  return <>
    <div className="intesta"><h1>I miei supermercati</h1><p>Dove fai la spesa: quelli con la stella. Tocca un tuo negozio per vedere gli orari. Il giro e le proposte guardano solo questi.</p></div>
    {msg && <div className="ok" role="status">{msg}</div>}{err && <div className="errore">{err}</div>}
    {stato.famiglia?.casa ? <Vicini compatta conOrari onCambiato={() => c.ricarica()} />
      : <section className="carta"><h2>Vicino a casa</h2><p className="muto">Scrivi l'indirizzo di casa e ti mostro sulla mappa i supermercati nei dintorni, da toccare per aggiungerli.</p><a className="b pieno" href="#famiglia">Scrivi l'indirizzo di casa</a></section>}
    <section className="carta">
      <h2>Cerca per nome</h2>
      <p className="muto">Se un supermercato non compare sulla mappa, cercalo qui.</p>
      <label className="campo-cerca"><Icona n="cerca" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Scrivi il nome: Conad, Coop, Penny…" autoComplete="off" aria-label="Cerca il supermercato" /></label>
      {q.trim() && <div className="suggerimenti">
        {trovate.map((x) => <button type="button" key={x.id} disabled={attesa} onClick={() => fai(api('/api/miei-supermercati', { metodo: 'POST', corpo: { catena_id: x.id } }).then((d) => { setQ(''); return d; }), `★ ${x.nome} aggiunto ai tuoi supermercati`)}>{x.nome}{x.negozi_citta ? <span className="muto piccolo"> · già in città</span> : null}</button>)}
        {q.trim().length >= 2 && !tutte.some((x) => x.nome.toLowerCase() === q.trim().toLowerCase()) && <button type="button" disabled={attesa} onClick={() => fai(api('/api/catene', { metodo: 'POST', corpo: { nome: q.trim() } }).then((r) => { setQ(''); return r.lista; }), `★ ${q.trim()} aggiunto ai tuoi supermercati`)}>➕ Aggiungi «{q.trim()}»</button>}
        {!trovate.length && q.trim().length < 2 && <p className="muto piccolo" style={{ padding: 12 }}>Continua a scrivere…</p>}
      </div>}
    </section>
    {c.dati && !mie.length && <div className="vuota"><p>Non hai ancora scelto nessun supermercato.</p><p>Tocca <b>Aggiungi</b> sulla mappa o cerca qui sopra quelli dove vai di solito. Finché la lista è vuota, uso quelli che hanno un negozio a {stato.impostazioni.citta}.</p></div>}
    {senzaNegozio.length > 0 && <section className="carta">
      <h2>Tuoi, ma senza un negozio vicino</h2>
      <p className="muto">Questi supermercati li hai scelti, ma non ho un loro negozio entro {stato.famiglia?.raggio || 10} km da casa. Scrivi l'indirizzo del negozio dove vai, così il giro può passarci.</p>
      {senzaNegozio.map((x) => <div key={x.id} className="senza-negozio">
        <div className="riga fra"><b>★ {x.nome}</b><button type="button" className="link" onClick={() => { if (confirm(`Tolgo ${x.nome} dai tuoi supermercati?`)) fai(api(`/api/miei-supermercati/${x.id}`, { metodo: 'DELETE' })); }}>Togli</button></div>
        <span className="muto piccolo">{x.ambito === 'nazionale' ? 'Prezzi uguali in tutta Italia' : x.ambito === 'citta' ? `Prezzi validi a ${stato.impostazioni.citta}` : `Prezzi uguali nel ${x.ambito === 'sud' ? 'Sud' : 'Centro-Nord'}`}{x.prezzi ? ` · ${x.prezzi} prezzi segnati` : ''}</span>
        <div className="riga">
          <input className="in" style={{ flex: 1, minWidth: 180 }} value={indirizzi[x.id] || ''} onChange={(e) => setIndirizzi({ ...indirizzi, [x.id]: e.target.value })} placeholder="Via, numero e città" autoComplete="street-address" />
          <button type="button" className="b pieno piccolo" disabled={attesa || (indirizzi[x.id] || '').trim().length < 5} onClick={() => fai(api('/api/negozi', { metodo: 'POST', corpo: { catena_id: x.id, indirizzo: indirizzi[x.id].trim() } }).then((d) => { setIndirizzi({ ...indirizzi, [x.id]: '' }); return d; }), 'Negozio salvato')}>{attesa ? 'Cerco…' : 'Salva'}</button>
        </div>
      </div>)}
    </section>}
  </>;
}
