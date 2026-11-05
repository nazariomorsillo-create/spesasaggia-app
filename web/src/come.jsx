// Come funziona l'app: una pagina sola, a caratteri grandi, un passo dopo l'altro.
import { Icona } from './base.jsx';

const PASSI = [
  { icona: 'mappa', colore: 'arancio', titolo: 'Prima di tutto: i tuoi supermercati', testo: 'Apri la mappa e tocca i supermercati dove fai la spesa di solito, uno o più: «★ Aggiungi ai miei» e diventano i tuoi preferiti. Prezzi, offerte e giro della spesa guardano questi.', link: { href: '#supermercati', testo: 'Scegli i tuoi supermercati' } },
  { icona: 'cerca', colore: 'verde', titolo: 'Scrivi cosa ti serve', testo: 'Comincia a scrivere «latte» e scegli dall\'elenco. Per primo ti mostro quello che compri di solito. Se preferisci, tocca «Parla» e dillo a voce.' },
  { icona: 'offerta', colore: 'rosso', titolo: 'Oppure parti dalle offerte', testo: 'In «Offerte» vedi i prodotti in offerta oggi nei tuoi supermercati, reparto per reparto: i mandarini da uno, le banane da un altro. Tocca «Metti in lista» e vanno nella lista come tutto il resto.' },
  { icona: 'spunta', colore: 'arancio', titolo: 'Ti indico la scelta saggia', testo: 'Per ogni cosa ti dico dove costa meno e se c\'è un prodotto migliore allo stesso prezzo, o uguale ma più economico. Scegli tu.', link: { href: '#come-scegliamo', testo: 'Come scegliamo' } },
  { icona: 'negozio', colore: 'blu', titolo: 'Avvia giro spesa', testo: 'Ti dico in quali supermercati andare, in che ordine e cosa prendere in ognuno. Con «Portami qui» Google Maps ti porta in auto.' },
  { icona: 'lista', colore: 'verde', titolo: 'Al supermercato, tocca il quadrato', testo: 'Quando metti una cosa nel carrello, tocca il quadrato accanto: diventa verde ed è fatta.', esempio: true },
  { icona: 'altro', colore: 'viola', titolo: 'Com\'è andata la spesa', testo: 'Alla fine vedi la pagella con la faccina, quanto hai speso e cosa cambiare la prossima volta per risparmiare.' },
  { icona: 'scontrino', colore: 'blu', titolo: 'Aiuti tutti', testo: 'Fotografa lo scontrino, il codice a barre o un volantino: i prezzi entrano nell\'app e il confronto diventa più preciso per tutti.' },
];

export function ComeFunziona() {
  return <>
    <div className="intesta"><h1>Come funziona</h1><p>Otto passi, uno alla volta. Puoi tornare qui quando vuoi da Altro.</p></div>
    <ol className="come">
      {PASSI.map((p, i) => <li key={i} className={`passo ${p.colore}`}>
        <span className="numero" aria-hidden="true">{i + 1}</span>
        <div className="corpo">
          <h2><Icona n={p.icona} d={28} /> {p.titolo}</h2>
          <p>{p.testo}</p>
          {p.link && <a className="b pieno" href={p.link.href}><Icona n={p.icona} d={22} /> {p.link.testo}</a>}
          {p.esempio && <div className="esempio" aria-hidden="true">
            <span className="q"><Icona n="spunta" d={26} /></span><span><b>Latte</b><br /><small>preso</small></span>
          </div>}
        </div>
      </li>)}
    </ol>
    <a className="b pieno grande" href="#lista">Ho capito, torna alla lista</a>
  </>;
}

// Come scegliamo: i criteri dell'ordine dei risultati e della Scelta saggia, detti in chiaro.
const CRITERI = [
  { titolo: 'Solo prodotti con un prezzo', testo: 'Nella ricerca compaiono solo i prodotti di cui conosciamo un prezzo, preso dagli scontrini, dai volantini o inserito da chi usa l\'app. Se vuoi qualcosa che non ha ancora un prezzo, scegli la riga «Qualsiasi: scegli dopo quale».' },
  { titolo: 'Il prezzo che vedi', testo: 'Per ogni prodotto mostriamo il prezzo più basso nei tuoi supermercati. Se lì non c\'è, quello più basso nei supermercati vicino a casa tua; se non c\'è nemmeno lì, il più basso che conosciamo. Vale l\'ultimo prezzo rilevato in ogni supermercato.' },
  { titolo: 'L\'ordine dei risultati', testo: 'Prima i prodotti che compri di solito, poi la Scelta saggia, poi tutti gli altri dal prezzo al chilo (al litro o al pezzo) più basso al più alto. In fondo quelli di cui non conosciamo il formato, perché non si possono confrontare.' },
  { titolo: 'Il voto di qualità (da 0 a 100)', testo: 'Mette insieme quello che sappiamo del prodotto, contando solo i dati che ci sono: le stelle di chi l\'ha comprato (35 punti), il Nutri-Score (20), gli additivi (20), gli zuccheri (10), quanto è lavorato (10), se è bio (9), se è italiano (6). La confezione di vetro dà 5 punti in più. Il miele non perde punti per lo zucchero. Frutta e verdura fresche partono da ottimo (non lavorate, senza additivi): bio e italiano aggiungono punti; se sono estere (o di origine non indicata) e non bio arrivano al massimo a 60, perché non è garantito che non abbiano pesticidi vietati in Italia. Senza dati veri il voto non c\'è: «Qualità da scoprire».' },
  { titolo: 'La Scelta saggia', testo: 'Tra i prodotti confrontabili è quello con il miglior rapporto tra voto di qualità e prezzo al chilo, scelto solo tra quelli almeno «buoni» (55 su 100). Se un prodotto bio o italiano costa al massimo il 5% in più ed è buono quasi uguale, la Scelta saggia è quello. Se nessuno ha un voto, è il più conveniente, ma mai uno da evitare. Sotto il bollino trovi sempre il motivo.' },
  { titolo: 'Nessuno paga per essere scelto', testo: 'La Scelta saggia e l\'ordine dei risultati dipendono solo dai criteri qui sopra. Supermercati, marche e produttori non possono pagare per comparire prima o per avere il bollino. La pubblicità nell\'app è sempre separata e porta la scritta «Pubblicità».' },
  { titolo: 'Dati da migliorare', testo: 'Prezzi e dati arrivano da scontrini, volantini, etichette e da chi usa l\'app: possono essere incompleti o non aggiornati. Se trovi un errore, correggilo dalla scheda del prodotto.' },
];

export function ComeScegliamo() {
  return <>
    <div className="intesta"><h1>Come scegliamo</h1><p>Come ordiniamo i prodotti che trovi e come decidiamo la Scelta saggia.</p></div>
    <ol className="come">
      {CRITERI.map((p, i) => <li key={i} className={`passo ${['verde', 'blu', 'arancio', 'verde', 'arancio', 'viola', 'blu'][i]}`}>
        <span className="numero" aria-hidden="true">{i + 1}</span>
        <div className="corpo"><h2>{p.titolo}</h2><p>{p.testo}</p></div>
      </li>)}
    </ol>
    <button type="button" className="b pieno grande" onClick={() => history.back()}>Torna indietro</button>
  </>;
}
