// Le spese fatte: l'elenco per data e, per ognuna, la pagella (faccina verde, gialla o rossa dalla media dei punteggi),
// cosa conviene cambiare la prossima volta e il giudizio di ogni prodotto.
import { useEffect, useState } from 'react';
import { api, useDati, euro, num, quanto, Icona, Semaforo } from './base.jsx';

const dataLunga = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const PAROLE = { verde: 'Spesa promossa', giallo: 'Spesa così così', rosso: 'Spesa da ripensare', grigio: 'Pochi dati per giudicare' };
const TINTE = { verde: '#4CB944', giallo: '#E3B505', rosso: '#C8382D', grigio: '#9AA59E' };

// La faccina della pagella: sorride, è neutra o è triste
export function Faccina({ colore, d = 120 }) {
  const t = TINTE[colore] || TINTE.grigio;
  const bocca = colore === 'verde' ? 'M30 60 Q50 80 70 60' : colore === 'rosso' ? 'M30 70 Q50 52 70 70' : 'M32 66 L68 66';
  return <svg className="faccina" width={d} height={d} viewBox="0 0 100 100" role="img" aria-label={PAROLE[colore] || ''}>
    <circle cx="50" cy="50" r="46" fill={t} />
    <circle cx="36" cy="40" r="5.5" fill="#2A1709" /><circle cx="64" cy="40" r="5.5" fill="#2A1709" />
    <path d={bocca} stroke="#2A1709" strokeWidth="6" strokeLinecap="round" fill="none" />
  </svg>;
}

export function Spese() {
  const l = useDati('/api/spese');
  if (l.errore) return <div className="errore">{l.errore}</div>;
  if (!l.dati) return <p className="muto">Carico…</p>;
  return <>
    <div className="intesta"><h1>Le mie spese</h1><p>Ogni spesa chiusa, con la sua pagella. Tocca una data per vedere cosa cambiare la prossima volta.</p></div>
    {!l.dati.length && <div className="vuota"><p>Ancora nessuna spesa chiusa.</p><p>Quando hai preso tutto, nella lista tocca <b>Com'è andata la spesa?</b>: la spesa finisce qui, con la pagella.</p><a className="b pieno grande" href="#lista">Vai alla lista</a></div>}
    {l.dati.length > 0 && <nav className="menu spese-elenco" aria-label="Le spese">{l.dati.map((s) => <a key={s.id} href={`#spese/${s.id}`}>
      <Faccina colore={s.colore} d={44} />
      <div><b>{dataLunga(s.data)}</b><span>{s.n === 1 ? '1 cosa' : `${s.n} cose`}{s.catene.length ? ` da ${s.catene.join(' e ')}` : ''}{s.totale != null ? ` · ${euro(s.totale)}` : ''}{s.media != null ? ` · media ${s.media}` : ''}</span></div>
    </a>)}</nav>}
  </>;
}

export function Spesa({ id }) {
  const s = useDati(`/api/spese/${id}`);
  const [aggiunte, setAggiunte] = useState([]);
  useEffect(() => { setAggiunte([]); }, [id]);
  if (s.errore) return <div className="errore">{s.errore}</div>;
  if (!s.dati) return <p className="muto">Carico…</p>;
  const d = s.dati; const g = d.giudizi;
  const fuori = [...new Set(d.prossima.filter((r) => r.alternativa.fuori).map((r) => r.alternativa.catena))].filter((c) => !aggiunte.includes(c));
  const aggiungi = async (nome) => { try { const c = await api('/api/catene'); const k = c.find((y) => y.nome === nome); if (k) await api('/api/miei-supermercati', { metodo: 'POST', corpo: { catena_id: k.id } }); setAggiunte((a) => [...a, nome]); } catch { /* niente */ } };
  const Riga = ({ v }) => <li>
    <div className="riga" style={{ gap: 8 }}><Semaforo q={v.qualita} piccolo sempre /><b>{v.prodotto || v.voce}</b></div>
    <span className="muto">{[v.prodotto ? v.voce : '', v.catena ? `da ${v.catena}` : '', v.costo != null ? euro(v.costo) : '', v.quantita ? quanto(v.quantita, v.unita) : ''].filter(Boolean).join(', ')}{!v.prodotto && !v.catena ? ' · non c\'era nei tuoi supermercati o senza prezzo' : ''}</span>
  </li>;
  return <>
    <a className="torna" href="#spese"><Icona n="indietro" d={22} />Le mie spese</a>
    <div className="intesta"><h1>{dataLunga(d.data)}</h1><p>{d.n === 1 ? '1 cosa' : `${d.n} cose`}{d.catene.length ? ` da ${d.catene.join(' e ')}` : ''}{d.totale != null ? `, ${euro(d.totale)} circa` : ''}</p></div>
    {d.bilancio && <section className="carta bilancio">
      <div className="bilancio-cifre">
        <div><span>Hai speso</span><b>{d.bilancio.speso == null ? '—' : euro(d.bilancio.speso)}</b></div>
        <div className={d.bilancio.risparmiato > 0 ? 'bene' : ''}><span>Hai risparmiato</span><b>{d.bilancio.confrontati ? euro(d.bilancio.risparmiato) : '—'}</b></div>
        <div className={d.bilancio.sopraMedia > 0 ? 'bene' : d.bilancio.sopraMedia < 0 ? 'male' : ''}><span>Qualità</span><b>{d.bilancio.sopraMedia == null ? '—' : d.bilancio.sopraMedia > 0 ? `+${d.bilancio.sopraMedia}` : d.bilancio.sopraMedia}</b></div>
      </div>
      <p className="muto piccolo">{d.bilancio.confrontati ? `Risparmio rispetto al prezzo medio degli stessi prodotti negli altri supermercati${d.bilancio.offerte ? ' e al prezzo pieno delle offerte che hai preso' : ''} (${d.bilancio.confrontati === 1 ? '1 prodotto confrontato' : `${d.bilancio.confrontati} prodotti confrontati`}).` : 'Il risparmio si calcola quando gli stessi prodotti hanno un prezzo anche in altri supermercati.'}{d.bilancio.sopraMedia == null ? '' : ` Qualità: ${d.bilancio.sopraMedia > 0 ? `${d.bilancio.sopraMedia} punti sopra` : d.bilancio.sopraMedia < 0 ? `${-d.bilancio.sopraMedia} punti sotto` : 'in linea con'} la media dei prodotti delle stesse cose.`}</p>
    </section>}
    <section className="carta pagella" style={{ '--tinta': TINTE[d.colore] }}>
      <Faccina colore={d.colore} />
      <div>
        <h2>{PAROLE[d.colore]}</h2>
        {d.media != null ? <p>Media dei punteggi: <b>{d.media} su 100</b>{g.promossi.length + g.cosiCosi.length + g.scarsi.length < d.n ? ` (su ${g.promossi.length + g.cosiCosi.length + g.scarsi.length} prodotti con giudizio)` : ''}.</p>
          : <p>Per dare un voto servono prodotti scelti con la loro scheda. La prossima volta scegli i prodotti dalla lista.</p>}
        <p className="muto piccolo">Verde da {d.soglie.verde}, giallo da {d.soglie.giallo}, rosso sotto.</p>
      </div>
    </section>
    {d.prossima.length > 0 && <section className="carta prossima">
      <h2>Per la prossima volta</h2>
      {d.risparmio > 0 && <p className="grande-risparmio">Cambiando giro avresti risparmiato <b>{euro(d.risparmio)}</b>.</p>}
      <ul className="voti">{d.prossima.map((r, i) => { const a = r.alternativa; return <li key={i}>
        <b>{r.voce}</b>
        <span>{a.tipo === 'stesso' ? <>Lo stesso prodotto da <b>{a.catena}</b> costa {euro(a.costo)} invece di {euro(r.costo)}{a.fuori ? ' (non è tra i tuoi supermercati)' : ''}.</>
          : a.tipo === 'migliore' ? <><a href={`#prodotto/${a.prodotto_id}`}>{a.prodotto}</a> da <b>{a.catena}</b> ({a.giudizio.parola}) {a.differenza < 0 ? `costa ${euro(a.costo)} invece di ${euro(r.costo)}` : a.differenza === 0 ? `allo stesso prezzo, ${euro(a.costo)}` : `a ${euro(a.costo)}`}{a.qualita > (r.qualita ?? 0) ? ', ed è migliore' : ''}{a.fuori ? ' (non è tra i tuoi supermercati)' : ''}.</>
          : <>Qualità migliore: <a href={`#prodotto/${a.prodotto_id}`}>{a.prodotto}</a> ({a.giudizio.parola}) da <b>{a.catena}</b>{a.costo != null ? `, ${euro(a.costo)}${a.differenza > 0 ? ` (${euro(a.differenza)} in più)` : ''}` : ''}.</>}</span>
        {a.differenza != null && a.differenza < 0 && <span className="alternativa">Risparmi {euro(-a.differenza)}</span>}
      </li>; })}</ul>
      {fuori.length > 0 && <div className="colonna">{fuori.map((c) => <button type="button" key={c} className="b contorno viola" onClick={() => aggiungi(c)}>Aggiungi {c} ai miei supermercati</button>)}</div>}
      {aggiunte.length > 0 && <p className="ok">Aggiunto: {aggiunte.join(', ')}. La prossima spesa li tiene in conto.</p>}
    </section>}
    <section className="carta giudizi">
      <h2>Cosa hai comprato</h2>
      {g.scarsi.length > 0 && <><h3>Da ripensare</h3><ul className="voti">{g.scarsi.map((v, i) => <Riga key={i} v={v} />)}</ul></>}
      {g.cosiCosi.length > 0 && <><h3>Così così</h3><ul className="voti">{g.cosiCosi.map((v, i) => <Riga key={i} v={v} />)}</ul></>}
      {g.promossi.length > 0 && <><h3>Promossi</h3><ul className="voti">{g.promossi.map((v, i) => <Riga key={i} v={v} />)}</ul></>}
      {(g.ignoti.length > 0 || d.senzaProdotto.length > 0) && <><h3>Senza giudizio</h3><ul className="voti">{[...g.ignoti, ...d.senzaProdotto].map((v, i) => <Riga key={i} v={v} />)}</ul></>}
      <p className="muto piccolo">Il punteggio (0-100) viene da Nutri-Score, additivi, lavorazione, bio, origine e dai voti di chi compra. È un'indicazione, non un parere medico.</p>
    </section>
  </>;
}
