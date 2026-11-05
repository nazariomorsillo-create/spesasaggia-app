// Orari dei negozi: aperto o chiuso adesso (si aggiorna da solo ogni minuto), la settimana e la correzione a mano.
import { useEffect, useState } from 'react';
import { api, Icona } from './base.jsx';
import { leggiOrari, fraseOrari, scriviFasce, NOMI_GIORNI } from '../../server/orari.js';

// l'ora che passa: chi mostra lo stato si ridisegna ogni minuto
export function useAdesso() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 60_000); return () => clearInterval(i); }, []);
  return t;
}

export function StatoOrari({ testo, adesso }) {
  const ora = useAdesso(); const f = fraseOrari(testo, adesso || ora);
  return <span className={`orari-stato ${f.colore}`}><Icona n="orologio" d={20} />{f.frase}</span>;
}

// le fasce una per riga, senza andare a capo in mezzo all'orario
const Fasce = ({ f }) => (f.length ? f.map((x, i) => <span key={i}>{i > 0 ? ' e ' : ''}<span>{scriviFasce([x])}</span>{i < f.length - 1 ? <br /> : null}</span>) : 'chiuso');
const FONTE = { mappa: 'Orari presi dalla mappa (OpenStreetMap), aggiornati ogni settimana.', sito: 'Orari letti dalla pagina ufficiale del negozio, ricontrollati ogni mese.', mano: 'Orari corretti a mano da chi usa l\'app.' };
const hh = (m) => { const v = m % 1440; return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; }; // mezzanotte = 00:00

const FONTE_TESTO = { ...FONTE, web: 'Orari trovati su internet, aggiornati ogni mese.' };

// La parte che si apre sotto un negozio: la settimana, da dove vengono gli orari, «correggili» e «torna agli automatici»
export function OrariAperti({ n, onCambiato }) {
  const ora = useAdesso(); const o = leggiOrari(n.orari);
  const [modifica, setModifica] = useState(false);
  const oggi = (ora.getDay() + 6) % 7;
  if (modifica) return <CorreggiOrari n={n} o={o} onFatto={() => { setModifica(false); onCambiato?.(); }} onAnnulla={() => setModifica(false)} />;
  return <div className="orari-corpo">
    {o ? <table className="orari-settimana"><tbody>{NOMI_GIORNI.map((g, i) => <tr key={g} className={i === oggi ? 'oggi' : ''}><th>{i === oggi ? `Oggi, ${g}` : g[0].toUpperCase() + g.slice(1)}</th><td><Fasce f={o.giorni[i]} /></td></tr>)}
      {o.festivi && <tr><th>Giorni di festa</th><td><Fasce f={o.festivi} /></td></tr>}</tbody></table>
      : <p className="muto">{n.orari ? `Sulla mappa c'è scritto: «${n.orari}», ma non riesco a leggerlo.` : 'Non ho ancora trovato gli orari di questo negozio. Li cerco ogni giorno sulla mappa, sul sito e su internet; intanto puoi scriverli tu.'}</p>}
    {o && FONTE_TESTO[n.orari_fonte] && <p className="muto piccolo">{FONTE_TESTO[n.orari_fonte]}{['web', 'sito'].includes(n.orari_fonte) && n.orari_url ? <> <a href={n.orari_url} target="_blank" rel="noopener">Vedi la pagina</a></> : null}</p>}
    <div className="riga">
      <button type="button" className="b piccolo" onClick={() => setModifica(true)}><Icona n="orologio" d={20} /> {o ? 'Sono sbagliati? Correggili' : 'Scrivili tu'}</button>
      {n.orari_fonte === 'mano' && <button type="button" className="link" onClick={async () => { await api(`/api/negozi/${n.id}/orari`, { metodo: 'DELETE' }); onCambiato?.(); }}>Torna agli orari automatici</button>}
    </div>
  </div>;
}

function CorreggiOrari({ n, o, onFatto, onAnnulla }) {
  const base = (i) => (o ? o.giorni[i] : i < 6 ? [[480, 1200]] : []);
  const [g, setG] = useState(() => NOMI_GIORNI.map((_, i) => ({ chiuso: !base(i).length, f: (base(i).length ? base(i) : [[480, 1200]]).map(([a, b]) => [hh(a), hh(b)]) })));
  const [festa, setFesta] = useState(o?.festivi ? (o.festivi.length ? 'domenica' : 'chiuso') : 'nonso');
  const [err, setErr] = useState(''); const [attesa, setAttesa] = useState(false);
  const cambia = (i, x) => setG(g.map((d, k) => (k === i ? { ...d, ...x } : d)));
  const fascia = (i, j, k, v) => cambia(i, { f: g[i].f.map((f, z) => (z === j ? (k === 0 ? [v, f[1]] : [f[0], v]) : f)) });
  const comeLunedi = () => setG(g.map((d, k) => (k > 0 && k < 6 ? { chiuso: g[0].chiuso, f: g[0].f.map((f) => [...f]) } : d)));
  const salva = async () => {
    setErr(''); setAttesa(true);
    try {
      const giorni = g.map((d) => (d.chiuso ? [] : d.f));
      const festivi = festa === 'chiuso' ? [] : festa === 'domenica' ? giorni[6] : null;
      await api(`/api/negozi/${n.id}/orari`, { metodo: 'POST', corpo: { giorni, festivi } }); onFatto();
    } catch (e) { setErr(e.message); } finally { setAttesa(false); }
  };
  return <div className="orari-corpo correggi-orari">
    <p className="muto">Gli orari che scrivi valgono per tutti quelli che usano l'app.</p>
    {NOMI_GIORNI.map((nome, i) => <fieldset key={nome} className="giorno-orari">
      <legend>{nome[0].toUpperCase() + nome.slice(1)}</legend>
      <label className="spunta-testo"><input type="checkbox" checked={g[i].chiuso} onChange={(e) => cambia(i, { chiuso: e.target.checked })} /> Chiuso</label>
      {!g[i].chiuso && g[i].f.map((f, j) => <div key={j} className="fascia">
        <label>{j === 0 ? 'Apre' : 'Riapre'} <input type="time" value={f[0]} onChange={(e) => fascia(i, j, 0, e.target.value)} /></label>
        <label>{j === 0 && g[i].f.length > 1 ? 'Pausa alle' : 'Chiude'} <input type="time" value={f[1]} onChange={(e) => fascia(i, j, 1, e.target.value)} /></label>
        {j > 0 && <button type="button" className="link" onClick={() => cambia(i, { f: g[i].f.filter((_, z) => z !== j) })}>Togli</button>}
      </div>)}
      {!g[i].chiuso && g[i].f.length === 1 && <button type="button" className="link" onClick={() => cambia(i, { f: [[g[i].f[0][0], '13:00'], ['15:30', g[i].f[0][1]]] })}>Chiude per pranzo?</button>}
      {i === 0 && <button type="button" className="link" onClick={comeLunedi}>Uguale dal lunedì al venerdì</button>}
    </fieldset>)}
    <label className="campo">Nei giorni di festa
      <select value={festa} onChange={(e) => setFesta(e.target.value)}><option value="nonso">Non lo so</option><option value="chiuso">È chiuso</option><option value="domenica">Come la domenica</option></select>
    </label>
    {err && <div className="errore">{err}</div>}
    <div className="riga"><button type="button" className="b pieno" disabled={attesa} onClick={salva}>{attesa ? 'Salvo…' : 'Salva gli orari'}</button><button type="button" className="b" onClick={onAnnulla}>Annulla</button></div>
  </div>;
}

// Per il giro: i negozi chiusi adesso, o che chiudono prima che tu riesca ad arrivare e fare la spesa
// (la durata del giro più un quarto d'ora); per gli altri basta il cartellino accanto al negozio.
export function avvisiOrari(negozi, adesso = new Date(), minutiGiro = null) {
  const serve = (minutiGiro || 20) + 15;
  return negozi.map((n) => ({ n, f: fraseOrari(n.orari, adesso) }))
    .filter(({ f }) => f.colore === 'rosso' || (f.aperto && f.traMinuti < serve))
    .map(({ n, f }) => (f.colore === 'rosso' ? `${n.catena} adesso è chiuso${f.riapre ? `: riapre ${f.riapre.quando} alle ${f.riapre.ora}` : ''}.`
      : `Rischi di non fare in tempo: ${n.catena} chiude ${f.chiude === '24:00' ? 'a mezzanotte' : `alle ${f.chiude}`}, tra ${f.traMinuti} minuti${minutiGiro ? `, e il giro dura circa ${minutiGiro} minuti` : ''}.${negozi.length > 1 ? ' Passa prima da lì.' : ''}`));
}
