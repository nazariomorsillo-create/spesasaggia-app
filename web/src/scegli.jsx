// La scelta di una cosa della lista: quale prodotto, dove costa meno, quante confezioni. Una cosa per volta.
import { useEffect, useState } from 'react';
import { api, useDati, euro, num, quanto, plurale, perUnita, QUALITA, Cartellino, Etichette, Icona, Semaforo, suCima } from './base.jsx';

const PILL = { Bio: 'bio', Italiano: 'ita', 'In offerta': 'offerta', 'Il mio preferito': 'offerta', 'Più economico': 'eco' };
const formato = (p, unita, pezzo = '') => (p.sfuso ? `sfuso, al ${perUnita(unita, pezzo)}` : p.quantita > 0 ? (unita === 'kg' && p.quantita < 1 ? `${Math.round(p.quantita * 1000)} g` : unita === 'l' && p.quantita < 1 ? `${Math.round(p.quantita * 1000)} ml` : `${num(p.quantita, 3)} ${unita === 'pz' ? (p.quantita === 1 ? (pezzo || 'pezzo') : plurale(pezzo || 'pezzo')) : unita}`) : 'formato da completare');

export function Scegli({ id, onCambiata }) {
  const s = useDati(`/api/lista/${id}/scelte`);
  const miei = useDati('/api/supermercati-giro');
  const prod = useDati(s.dati ? `/api/produttori?voce_id=${s.dati.riga.voce_id}` : null);
  const [err, setErr] = useState(''); const [fatto, setFatto] = useState(null); const [attesa, setAttesa] = useState(false);
  useEffect(() => { suCima(); setFatto(null); setErr(''); }, [id]);
  if (s.errore) return <div className="errore">{s.errore}</div>;
  if (!s.dati) return <p className="muto">Cerco i prezzi…</p>;
  const d = s.dati; const r = d.riga; const per = perUnita(r.unita, r.pezzo);
  const scegli = async (corpo, testo) => {
    setErr(''); setAttesa(true);
    try { const x = await api(`/api/lista/${r.id}/scegli`, { metodo: 'POST', corpo }); onCambiata?.(); setFatto({ testo, prossima: x.prossima, restano: x.restano }); await s.ricarica(); window.scrollTo(0, 0); }
    catch (e) { setErr(e.message); } finally { setAttesa(false); }
  };
  // In lista resta solo la voce: il prodotto lo sceglie lui al supermercato
  const lascia = async () => {
    setErr(''); setAttesa(true);
    // 0.74: si resta qui, perché adesso si sceglie in quale supermercato prenderla
    try { await api(`/api/lista/${r.id}/scegli`, { metodo: 'POST', corpo: { libera: true } }); onCambiata?.(); await s.ricarica(); }
    catch (e) { setErr(e.message); } finally { setAttesa(false); }
  };
  const dove = async (cid) => { setErr(''); try { await api(`/api/lista/${r.id}/dove`, { metodo: 'POST', corpo: { catena_libera: cid } }); onCambiata?.(); await s.ricarica(); } catch (e) { setErr(e.message); } };
  const cambiaQuantita = async (q) => { try { await api(`/api/lista/${r.id}`, { metodo: 'PUT', corpo: { quantita: Math.round(q * 100) / 100 } }); onCambiata?.(); s.ricarica(); } catch (e) { setErr(e.message); } };
  const togli = async () => { if (!confirm(`Tolgo «${r.voce}» dalla lista?`)) return; await api(`/api/lista/${r.id}`, { metodo: 'DELETE' }); onCambiata?.(); location.hash = '#lista'; };
  const consiglio = d.alternative.find((a) => a.tipi.includes('consiglio')) || null;
  const altreAlt = d.alternative.filter((a) => a !== consiglio);
  // La scelta saggia va sopra se non c'è una scelta tua (o c'è solo il più conveniente)
  const saggiaPrima = !!consiglio && (!d.principale || d.principale.motivo === 'conveniente');
  const giaMostrati = new Set([d.principale?.prodotto.id, ...d.alternative.map((a) => a.prodotto.id)]);
  const sceltaAttuale = d.scelta && !d.scelta.automatica && !d.scelta.libera ? d.scelta : null;

  return <>
    <a className="torna" href="#lista"><Icona n="indietro" d={22} />La lista</a>
    <div className="intesta"><h1>{r.voce}</h1>{d.restano > 0 && !fatto && <p>{d.restano === 1 ? 'Dopo questa ne resta 1 da scegliere.' : `Dopo questa ne restano ${d.restano} da scegliere.`}</p>}</div>

    {fatto && <section className="fatto-scelta">
      <div className="riga"><Icona n="spunta" d={28} /><b>{fatto.testo}</b></div>
      {sceltaAttuale && sceltaAttuale.prodotto.quantita > 0 && !sceltaAttuale.prodotto.sfuso && <div className="gruppo"><span className="nome-gruppo">Quante confezioni da {formato(sceltaAttuale.prodotto, r.unita)}?</span>
        <div className="passi">
          <button type="button" aria-label="Una in meno" disabled={r.quantita / sceltaAttuale.prodotto.quantita <= 1.01} onClick={() => scegli({ prodotto_id: sceltaAttuale.prodotto.id, confezioni: Math.round(r.quantita / sceltaAttuale.prodotto.quantita) - 1 }, fatto.testo)}>−</button>
          <output>{Math.round(r.quantita / sceltaAttuale.prodotto.quantita)}</output>
          <button type="button" aria-label="Una in più" onClick={() => scegli({ prodotto_id: sceltaAttuale.prodotto.id, confezioni: Math.round(r.quantita / sceltaAttuale.prodotto.quantita) + 1 }, fatto.testo)}>+</button>
        </div></div>}
      {sceltaAttuale && !sceltaAttuale.prezzi.length && <a className="b contorno viola" href={`#prodotto/${sceltaAttuale.prodotto.id}/prezzo`}>Nessun prezzo ancora: se lo sai, aggiungilo</a>}
      {fatto.prossima ? <a className="b pieno grande" href={`#scegli/${fatto.prossima.id}`}>Avanti: {fatto.prossima.voce} <Icona n="avanti" d={22} /></a>
        : <a className="b pieno grande" href="#lista"><Icona n="spunta" /> Hai scelto tutto: torna alla lista</a>}
      <button type="button" className="link" onClick={() => setFatto(null)}>Cambia scelta</button>
    </section>}

    {!fatto && <>
      {d.scelta?.libera && <div className="scelta-fatta"><Icona n="spunta" d={22} /><div><b>Adesso: lo scegli tu al supermercato{r.catena_libera === 0 ? ', dove capita' : r.catena_libera ? `, da ${(miei.dati || []).find((c) => c.id === r.catena_libera)?.nome || ''}` : ''}</b><span>in lista c'è solo «{r.voce}»</span></div></div>}
      {d.scelta?.automatica && <div className="scelta-fatta"><Icona n="spunta" d={22} /><div><b>Adesso: decido io per te</b><span>prendo il più conveniente {r.qualita !== 'qualsiasi' ? `tra quelli ${QUALITA.find(([k]) => k === r.qualita)?.[1].toLowerCase()}` : ''}</span></div></div>}
      {err && <div className="errore">{err}</div>}

      {/* 0.72 (Nazario, 04/11): prima quante confezioni, poi solo il pulsante verde, poi «Oppure…» e sotto il prodotto più conveniente.
          Se «lo scegli tu al supermercato» è già la scelta, il pulsante verde riporta alla lista (la quantità si salva da sola). */}
      <Quantita r={r} p={d.principale?.prodotto} onCambia={cambiaQuantita} />

      <section className={`libera-scelta${d.scelta?.libera ? ' attiva' : ''}`}>
        {d.scelta?.libera && <div className="dove-libera">
          <b>In quale supermercato lo prendi?</b>
          <div className="scelte">{(miei.dati || []).map((c) => <button key={c.id} type="button" aria-pressed={r.catena_libera === c.id} onClick={() => dove(c.id)}>{r.catena_libera === c.id ? '✓ ' : ''}{c.nome}</button>)}
            <button type="button" aria-pressed={r.catena_libera === 0} onClick={() => dove(0)}>{r.catena_libera === 0 ? '✓ ' : ''}Dove capita</button></div>
          {r.catena_libera == null && <span className="muto piccolo">Così nel giro lo trovi nella lista di quel supermercato. La prossima volta me lo ricordo io.</span>}
        </div>}
        {d.scelta?.libera
          ? <a className="b grande pieno-verde" href="#lista"><Icona n="spunta" d={22} /> Va bene così, torna alla lista</a>
          : <button type="button" className="b grande pieno-verde" disabled={attesa} onClick={lascia}>Lascia «{r.voce}», scelgo al supermercato</button>}
        {d.principale && <p className="in-alternativa">Oppure, in alternativa, scegli qui sotto il prodotto più conveniente.</p>}
      </section>

      {saggiaPrima && consiglio && <section className="consiglio">
        <div className="riga" style={{ gap: 10 }}><span className="pill consiglio-pill">La scelta saggia</span>{consiglio.etichette.slice(1).map((t, n) => <span key={t} className={`pill ${PILL_ALT[consiglio.tipi[n + 1]] || 'forte'}`}>{t}</span>)}</div>
        <p className="perche">{String(consiglio.perche || '').startsWith('saggia:') ? `${consiglio.perche.slice(7, 8).toUpperCase()}${consiglio.perche.slice(8)}.` : consiglio.perche === 'meno' ? `Stessa qualità, e risparmi ${euro(-consiglio.differenza)}.` : consiglio.perche === 'meglio-e-meno' ? `Qualità migliore${consiglio.giudizio ? ` (${consiglio.giudizio.parola.toLowerCase()})` : ''}, e risparmi anche ${euro(-consiglio.differenza)}.` : `Qualità migliore${consiglio.giudizio ? ` (${consiglio.giudizio.parola.toLowerCase()})` : ''} ${consiglio.differenza > 0 ? `per soli ${euro(consiglio.differenza)} in più` : 'allo stesso prezzo'}.`}</p>
        <Scheda k={consiglio} r={r} per={per} grande />
        <div className="riga fra">
          <a className="link" href={`#prodotto/${consiglio.prodotto.id}`}>Vedi la scheda</a>
          <button type="button" className="b pieno grande" disabled={attesa} onClick={() => scegli({ prodotto_id: consiglio.prodotto.id }, `${consiglio.prodotto.nome}${consiglio.dove ? `, da ${consiglio.dove.catena}` : ''}`)}>Prendi la scelta saggia</button>
        </div>
      </section>}

      {d.principale ? <section className="principale">
        <span className="etichette"><span className="pill forte">{d.principale.motivo === 'scelto' ? 'La tua scelta' : d.principale.motivo === 'detto' ? 'Quello che hai detto' : d.principale.motivo === 'preferito' ? '★ Il tuo preferito' : r.qualita !== 'qualsiasi' ? `Il più conveniente ${QUALITA.find(([k]) => k === r.qualita)?.[1].toLowerCase()}` : 'Il più conveniente'}</span></span>
        <Scheda k={d.principale} r={r} per={per} grande />
        <div className="riga fra">
          <a className="link" href={`#prodotto/${d.principale.prodotto.id}`}>Vedi la scheda</a>
          <button type="button" className={`b ${d.principale.motivo === 'scelto' ? '' : 'pieno grande'}`} disabled={attesa} onClick={() => scegli({ prodotto_id: d.principale.prodotto.id }, `${d.principale.prodotto.nome}${d.principale.dove ? `, da ${d.principale.dove.catena}` : ''}`)}>{d.principale.motivo === 'scelto' ? '✓ Va bene così' : 'Prendi questo'}</button>
        </div>
      </section> : <div className="avviso">Nessuno ha ancora segnato un prezzo per {r.voce.toLowerCase()} {d.zona?.casa ? `entro ${d.zona.raggio} km` : 'nei tuoi supermercati'}. Mettilo in lista e scegli tu al supermercato.</div>}

      {!saggiaPrima && consiglio && <section className="consiglio">
        <div className="riga" style={{ gap: 10 }}><span className="pill consiglio-pill">La scelta saggia</span>{consiglio.etichette.slice(1).map((t, n) => <span key={t} className={`pill ${PILL_ALT[consiglio.tipi[n + 1]] || 'forte'}`}>{t}</span>)}</div>
        <p className="perche">{String(consiglio.perche || '').startsWith('saggia:') ? `${consiglio.perche.slice(7, 8).toUpperCase()}${consiglio.perche.slice(8)}.` : consiglio.perche === 'meno' ? `Stessa qualità, e risparmi ${euro(-consiglio.differenza)}.` : consiglio.perche === 'meglio-e-meno' ? `Qualità migliore${consiglio.giudizio ? ` (${consiglio.giudizio.parola.toLowerCase()})` : ''}, e risparmi anche ${euro(-consiglio.differenza)}.` : `Qualità migliore${consiglio.giudizio ? ` (${consiglio.giudizio.parola.toLowerCase()})` : ''} ${consiglio.differenza > 0 ? `per soli ${euro(consiglio.differenza)} in più` : 'allo stesso prezzo'}.`}</p>
        <Scheda k={consiglio} r={r} per={per} grande />
        <div className="riga fra">
          <a className="link" href={`#prodotto/${consiglio.prodotto.id}`}>Vedi la scheda</a>
          <button type="button" className="b pieno grande" disabled={attesa} onClick={() => scegli({ prodotto_id: consiglio.prodotto.id }, `${consiglio.prodotto.nome}${consiglio.dove ? `, da ${consiglio.dove.catena}` : ''}`)}>Prendi la scelta saggia</button>
        </div>
      </section>}

      {altreAlt.length > 0 && <section className="colonna">
        <div><h2>{consiglio ? 'Altre alternative' : 'Le alternative'}</h2><p className="muto piccolo">{d.zona?.casa ? `Nei tuoi supermercati e in quelli entro ${d.zona.raggio} km da casa` : 'Nei tuoi supermercati'}, per {quanto(r.quantita, r.unita, false, r.pezzo)}. <a className="link" href="#supermercati">Cambia</a></p></div>
        {altreAlt.map((a) => <article key={a.prodotto.id} className="alternativa-card">
          <span className="etichette">{a.etichette.map((t, n) => <span key={t} className={`pill ${PILL_ALT[a.tipi[n]] || 'forte'}`}>{t}</span>)}</span>
          <Scheda k={a} r={r} per={per} />
          {a.differenza != null && <p className={`diff ${a.differenza < 0 ? 'meno' : a.differenza > 0 ? 'piu' : ''}`}>{a.differenza < 0 ? `Risparmi ${euro(-a.differenza)} rispetto alla tua scelta` : a.differenza > 0 ? `${euro(a.differenza)} in più rispetto alla tua scelta` : 'Stesso prezzo della tua scelta'}</p>}
          <div className="riga fra">
            <a className="link" href={`#prodotto/${a.prodotto.id}`}>Vedi la scheda</a>
            <button type="button" className="b pieno" disabled={attesa} onClick={() => scegli({ prodotto_id: a.prodotto.id }, `${a.prodotto.nome}${a.dove ? `, da ${a.dove.catena}` : ''}`)}>Prendi questo</button>
          </div>
        </article>)}
      </section>}

      {prod.dati?.length > 0 && <section className="carta produttori-box">
        <h2>Dai produttori locali</h2>
        <ul className="miei-prezzi">{prod.dati.slice(0, 4).map((o) => <li key={o.id}>
          <div><b>{o.produttore}</b><span>{o.nome}{o.bio ? ' · bio' : ''}{o.km != null ? ` · ${num(o.km, 1)} km` : ''}</span></div>
          <div className="dx"><Cartellino n={o.prezzo} per={o.unita === 'pz' ? 'pz' : o.unita} /><a className="b piccolo" href={`#produttore/${o.produttore_id}`}>Ordina</a></div>
        </li>)}</ul>
        <p className="muto piccolo">Ordini nell'app, ritiri dal produttore e paghi lì.</p>
      </section>}

      {d.giaMigliore && <div className="ok">{d.principale?.motivo === 'scelto' ? 'La tua scelta' : 'Questo'} è già il migliore tra {d.confrontati === 1 ? 'i 2 prodotti' : `i ${d.confrontati + 1} prodotti`} con un prezzo: niente di qualità migliore allo stesso prezzo, né di pari qualità a meno.</div>}
      {d.principale?.dove && !d.confrontati && <div className="avviso">Per ora è l'unico con un prezzo {d.zona?.casa ? `entro ${d.zona.raggio} km` : 'nei tuoi supermercati'}: non posso confrontarlo con altri. Quando qualcuno segna altri prezzi, qui compaiono le alternative.</div>}
      <button type="button" className="b rosso" onClick={togli}>Togli «{r.voce}» dalla lista</button>
    </>}
  </>;
}

const PILL_ALT = { economico: 'eco', bio: 'bio', italiano: 'ita', votato: 'offerta', migliore: 'forte', scelta: 'forte' };

// Quanto: a confezioni se il prodotto si vende a confezione, a peso se è sfuso, a pezzi se va a pezzi
function Quantita({ r, p, onCambia }) {
  const confezione = p && !p.sfuso && p.quantita > 0;
  if (confezione) {
    const n = Math.max(1, Math.round(r.quantita / p.quantita));
    const f = formato(p, r.unita, r.pezzo);
    return <div className="gruppo quanto-riga"><span className="nome-gruppo">Quante confezioni (da {f})</span>
      <div className="passi"><button type="button" aria-label="Una in meno" disabled={n <= 1} onClick={() => onCambia((n - 1) * p.quantita)}>−</button>
        <output>{n} {n === 1 ? 'confezione' : 'confezioni'}</output>
        <button type="button" aria-label="Una in più" onClick={() => onCambia((n + 1) * p.quantita)}>+</button></div></div>;
  }
  const passo = r.unita === 'pz' ? 1 : r.unita === 'l' ? 0.5 : (r.quantita <= 1 ? 0.1 : 0.5);
  return <div className="gruppo quanto-riga"><span className="nome-gruppo">{r.unita === 'pz' ? `Quanti ${plurale(r.pezzo || 'pezzo')}` : p?.sfuso ? 'Quanto ne vuoi (a peso)' : 'Quanto te ne serve'}</span>
    <div className="passi"><button type="button" aria-label="Di meno" disabled={r.quantita - passo < 0.01} onClick={() => onCambia(r.quantita - passo)}>−</button><output>{quanto(r.quantita, r.unita, false, r.pezzo)}</output><button type="button" aria-label="Di più" onClick={() => onCambia(r.quantita + passo)}>+</button></div></div>;
}

// Un prodotto con dove costa meno: nome, formato, qualità, voti, supermercato, distanza e quanto spendi
function Scheda({ k, r, per, grande = false }) {
  const p = k.prodotto; const d = k.dove;
  return <div className="scheda-prop">
    <div className="prop-testa"><div><h3>{p.nome}</h3>
      <div className="riga" style={{ gap: 8 }}><span className="muto">{formato(p, r.unita, r.pezzo)}</span><Etichette p={p} /><Semaforo q={k.qualita} piccolo sempre casa={p.non_alimentare} />{k.voto && <span className="voti-pill">★ {num(k.voto.media, 1)} ({k.voto.n})</span>}</div></div>
      {p.foto ? <img src={p.foto} alt="" loading="lazy" /> : null}</div>
    {d ? <div className="dove-box">
      <div className="dove-primo"><div><b>{d.fornitore ? `Dal fornitore ${d.catena}` : <>Da {d.mio ? '★ ' : ''}{d.catena}</>}</b><span>{[d.km != null ? `${num(d.km, 1)} km da casa` : '', `${euro(d.unitario)} al ${per}`, d.offerta ? `in offerta${d.valido_al ? ` fino al ${d.valido_al.slice(8, 10)}/${d.valido_al.slice(5, 7)}` : ''}` : ''].filter(Boolean).join(' · ')}</span></div><span className="cartellino-col"><Cartellino n={d.prezzo} per={p.sfuso ? per : undefined} grande={grande} /><small>{p.sfuso ? '' : 'la confezione'}</small></span></div>
    </div> : <p className="muto">Nessun prezzo ancora nei supermercati che guardi</p>}
  </div>;
}
