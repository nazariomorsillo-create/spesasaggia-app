// Statistiche d'uso per chi gestisce: persone, installazioni, quanto si usa l'app e da dove. Solo numeri aggregati.
import { useState } from 'react';
import { useDati, num } from './base.jsx';

const dataIt = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
const perc = (n, tot) => (tot ? `${Math.round((n / tot) * 100)}%` : '0%');

function Barre({ righe, etichetta, valore }) {
  const max = Math.max(1, ...righe.map(valore));
  return <ul className="barre">{righe.map((r, i) => <li key={i}><span className="barra-eti">{etichetta(r)}</span><span className="barra"><span style={{ width: `${(valore(r) / max) * 100}%` }} /></span><b>{valore(r)}</b></li>)}</ul>;
}

export function Statistiche() {
  const s = useDati('/api/statistiche'); const [copiato, setCopiato] = useState(false);
  if (s.errore) return <div className="errore">{s.errore}</div>;
  if (!s.dati) return <p className="muto">Conto…</p>;
  const d = s.dati; const zoneNote = d.zone.filter((z) => z.zona !== 'Non indicata'); const totZone = zoneNote.reduce((t, z) => t + z.famiglie, 0);
  const pl = (n, uno, tanti) => `${n} ${n === 1 ? uno : tanti}`;
  const testo = `Spesa Saggia, dati al ${dataIt(d.aggiornate)}/${d.aggiornate.slice(0, 4)}: ${pl(d.persone, 'persona', 'persone')} in ${pl(d.famiglie, 'famiglia', 'famiglie')}, ${d.installazioni} con l'app installata sul telefono; ${pl(d.attivi.mese, 'persona attiva', 'persone attive')} nell'ultimo mese (${d.attivi.settimana} negli ultimi 7 giorni), in media ${num(d.frequenza, 1)} aperture a settimana a testa. Da dove: ${zoneNote.filter((z) => z.famiglie).map((z) => `${z.zona} ${perc(z.famiglie, totZone)}`).join(', ') || 'zona non ancora indicata'}${d.citta.length ? `; città più presenti: ${d.citta.slice(0, 5).map((c) => c.citta).join(', ')}` : ''}. ${d.contenuti.prezzi} prezzi segnati (${d.contenuti.prezziMese} nell'ultimo mese), ${pl(d.contenuti.spese, 'spesa chiusa', 'spese chiuse')}, ${pl(d.contenuti.scontrini, 'scontrino fotografato', 'scontrini fotografati')}.`;
  const copia = async () => { try { await navigator.clipboard.writeText(testo); setCopiato(true); setTimeout(() => setCopiato(false), 3000); } catch { /* niente */ } };
  const Num = ({ n, t }) => <div className="numero"><b>{n}</b><span>{t}</span></div>;
  return <>
    <div className="intesta"><h1>Statistiche d'uso</h1><p>Numeri aggregati, aggiornati a oggi. Niente nomi né telefoni.</p></div>
    <section className="carta">
      <h2>Chi usa l'app</h2>
      <div className="numeri">
        <Num n={d.persone} t="persone entrate" /><Num n={d.famiglie} t="famiglie" /><Num n={d.installazioni} t="app installate sul telefono" />
        <Num n={d.attivi.oggi} t="attive oggi" /><Num n={d.attivi.settimana} t="attive negli ultimi 7 giorni" /><Num n={d.attivi.mese} t="attive nell'ultimo mese" />
      </div>
      <p className="muto">Chi ha aperto l'app nell'ultimo mese lo fa in media <b>{num(d.frequenza, 1)} volte a settimana</b>.</p>
      <p className="muto piccolo">«Installata» conta chi apre l'app dall'icona sulla schermata Home. Chi la usa dal browser conta tra le persone ma non tra le installazioni.</p>
    </section>
    <section className="carta">
      <h2>Da dove</h2>
      {totZone ? <Barre righe={zoneNote} etichetta={(z) => `${z.zona} (${perc(z.famiglie, totZone)})`} valore={(z) => z.famiglie} /> : <p className="muto">Nessuna famiglia ha ancora indicato casa.</p>}
      {d.zone.find((z) => z.zona === 'Non indicata')?.famiglie > 0 && <p className="muto piccolo">{d.zone.find((z) => z.zona === 'Non indicata').famiglie} famiglie senza indirizzo di casa.</p>}
      {d.citta.length > 0 && <><h3>Città più presenti</h3><Barre righe={d.citta} etichetta={(c) => c.citta} valore={(c) => c.famiglie} /></>}
    </section>
    <section className="carta">
      <h2>Nuove persone per settimana</h2>
      <Barre righe={d.settimane} etichetta={(x) => `dal ${dataIt(x.settimana)}`} valore={(x) => x.utenti} />
      <h3>Persone attive al giorno (ultime 2 settimane)</h3>
      <Barre righe={d.giorni} etichetta={(x) => dataIt(x.giorno)} valore={(x) => x.utenti} />
    </section>
    <section className="carta">
      <h2>Cosa c'è dentro</h2>
      <div className="numeri">
        <Num n={d.contenuti.prezzi} t="prezzi segnati" /><Num n={d.contenuti.prezziMese} t="nell'ultimo mese" /><Num n={d.contenuti.prodotti} t="prodotti con scheda" />
        <Num n={d.contenuti.spese} t="spese chiuse" /><Num n={d.contenuti.scontrini} t="scontrini fotografati" /><Num n={d.contenuti.voti} t="voti ai prodotti" />
        <Num n={d.produttori.attivi} t="produttori attivi" /><Num n={d.produttori.ordini} t="prenotazioni ai produttori" /><Num n={d.produttori.ordiniMese} t="nell'ultimo mese" />
      </div>
    </section>
    <section className="carta">
      <h2>Testo pronto per i produttori</h2>
      <p className="testo-copia">{testo}</p>
      <button type="button" className="b pieno" onClick={copia}>{copiato ? 'Copiato' : 'Copia il testo'}</button>
    </section>
  </>;
}
