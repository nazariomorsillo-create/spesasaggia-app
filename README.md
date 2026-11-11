# Spesa Saggia (dimmilaspesa.it)

Nome del progetto nella cartella: giro-spesa.

WS Solution SRL · versione 0.22.0 (01/11/2026)

## Novità della 0.47 — volantini a costo quasi zero

- I volantini si leggono con Claude Haiku 5.5 (0,10 $ / 0,50 $ per milione di token, contro 2 $ / 10 $ di Sonnet 5.5): circa 20 volte meno, pochi decimi di centesimo a pagina. Il modello si cambia con CLAUDE_MODELLO_VOLANTINI; per una pagina difficile c'è «Rileggi con il modello più preciso» (CLAUDE_MODELLO, Sonnet).
- 0.98: i volantini sono raccolte di pagine (una per supermercato e periodo): si sceglie il supermercato una volta, le date valgono per tutto il volantino, si riprende da dove si era, chi gestisce controlla tutte le righe dubbie in una volta. Avvisi WhatsApp per le offerte spenti (AVVISI_OFFERTE_WHATSAPP=1 per riaccenderli).
- Le pagine si leggono da sole appena arrivano (VOLANTINI_AUTOMATICI=0 per spegnere), finché la spesa del mese resta sotto CLAUDE_TETTO_MESE (5 € predefiniti). Le offerte entrano solo dopo il controllo di chi gestisce.
- Stima dei costi corretta con il listino per modello (prima usava 3 $ / 15 $, più alto del vero).
- Indirizzi di file che non esistono (/.env, /data/…, /server/…) ora rispondono 404 invece della pagina dell'app; controllo-sicurezza.sh distingue la pagina dell'app da un file vero e mostra le porte aperte verso l'esterno.

## Novità della 0.46

- Scontrini letti da soli: appena arriva la foto il server la legge (OCR) e carica subito i prezzi delle righe riconosciute con sicurezza; chi l'ha mandata vede «Fatto: sono entrati N prezzi». Le righe incerte restano «da controllare» per chi gestisce (le righe già entrate sono segnate e non si ricaricano). Si spegne con SCONTRINI_AUTOMATICI=0 nel .env.
- Niente doppi: la stessa foto non entra due volte; lo stesso scontrino (supermercato, giorno, totale, numero) da un'altra foto diventa «doppione» e non carica niente; anche a mano chiede conferma.
- Codice a barre: Open Food Facts cercato anche con il codice a 12/13 cifre, con il nome in altre lingue o solo marca; se il sito è occupato non si dice «non trovato». Messaggio più chiaro quando il prodotto non c'è in nessun archivio aperto (Yuka ha un archivio suo, chiuso).
- Volantini: scegliendo il supermercato, se le sue offerte sono già nell'app (o ci sono pagine in attesa) compare l'avviso con quante offerte e fino a quando; la stessa pagina non entra due volte; in lettura avviso e, al caricamento, le offerte identiche già presenti non si ripetono.

## Novità della 0.45 — supermercati di paese

- La mappa cerca anche gli alimentari / minimarket con un nome (shop=convenience e grocery su OpenStreetMap), dove i supermercati sono pochi o se sono di un'insegna: nei paesi il supermercato è spesso segnato così. Le zone già cercate si rileggono una volta (chiave «v2»).
- Sotto la mappa: «Non trovi il tuo supermercato? Aggiungilo tu» → nome e indirizzo, e diventa subito tra i tuoi (POST /api/negozi/nuovo). Lo stesso negozio a meno di 150 m non si duplica.

## Novità della 0.44

- Come funziona: nuovo primo passo «Prima di tutto: i tuoi supermercati», con il pulsante che apre la mappa (un tocco su «★ Aggiungi ai miei» e diventano preferiti). Ora sono otto passi.
- Home: «Invita persone» in una riga verde sotto «Avvia giro spesa», prima della pubblicità. La X la nasconde per 30 giorni; dopo aver invitato sparisce per 60. In Altro resta il riquadro completo.
- Sicurezza: nella finestrella della mappa nomi e indirizzi dei negozi (da OpenStreetMap) entrano come testo, mai come codice.

## Novità della 0.43 — niente doppioni da codice a barre, scontrino e volantino

- server/censiti.js: un solo «riconoscitore» del prodotto già censito, usato da tutti gli ingressi.
- Codice a barre: lo stesso prodotto anche se il codice arriva con o senza gli zeri davanti (UPC/EAN). Se il codice non c'è ancora ma il prodotto sì (inserito a mano, da scontrino o volantino: stesso nome e marca, stesso formato), si completa quello (codice, foto, Nutri-Score…) invece di crearne uno nuovo; il nome che c'era resta.
- Scontrino: il supermercato si riconosce dalle prime 12 righe (i nomi più lunghi prima: «Spazio Conad» prima di «Conad»). Ogni supermercato ha i suoi nomi da scontrino (tabella nomi_scontrino): lo stesso testo, la volta dopo, è subito lo stesso prodotto. Un nome visto in un altro supermercato viene proposto ma segnato «da controllare».
- Volantino: i prodotti del supermercato del volantino si cercano per primi; al caricamento, se il nome è un po' diverso ma marca e formato tornano, si usa il prodotto che c'è (e si completa marca/origine/bio). Formato diverso = prodotto nuovo, come deve essere.
- In tutti i casi, se il prodotto c'è, si aggiunge solo il prezzo.

## Novità della 0.42

- Lista: se non c'è un'offerta che conviene, l'app cerca un prodotto MIGLIORE della stessa voce allo stesso prezzo al kg/l/pz (o meno), tra i tuoi supermercati e quelli del raggio. Migliore = diventa bio e/o italiano senza perdere niente (mai da bio a non bio, mai da italiano a estero, e non molto peggiore per il resto), oppure ha un punteggio di qualità chiaramente più alto (+10 punti: Nutri-Score, NOVA, additivi, voti).
- Stesso riquadro verde con «Migliore», la foto, il perché («è bio e italiano», «qualità Ottimo invece di Buono») e il prezzo; «Prendi questo» cambia prodotto (e, se il supermercato non è tra i tuoi, la riga va presa lì); la X lo toglie per sempre da quella riga.
- Dopo «Prendi questo» il riquadro azzurro offre «Torna a «prodotto di prima»», con la quantità di prima.
- Precedenza: prima l'offerta, poi il prodotto migliore (mai due riquadri insieme).

## Novità della 0.41

- Offerta che conviene, anche nella lista: sotto la riga di un prodotto scelto compare lo stesso riquadro verde dei suggerimenti («Offerta da Lidl a 4,99 €: risparmi 1,50 €»), se in un supermercato del raggio (non tra i tuoi) costa almeno il 20% in meno e si risparmia almeno 1 € sulle confezioni che servono.
- «Prendilo da Lidl»: la riga va presa lì (righe_lista.catena_id) e il giro passa anche da quel supermercato; un riquadro azzurro lo ricorda, con «Torna a Eurospin».
- La X («non mi interessa») toglie il suggerimento da quella riga per sempre (righe_lista.offerta_nascosta); se cambi prodotto, si riparte da zero.
- La regola è una sola per suggerimenti e lista: OFFERTA_ALTROVE in server/index.js (quota 0,8 = -20%; euro 1).
- La bolla della riga mostra il prezzo nel più conveniente dei TUOI supermercati; le offerte altrove stanno solo nel riquadro.

## Novità della 0.40 — controllo di sicurezza

- Senza accesso, /api/stato dava le impostazioni generali, compreso l'indirizzo di casa salvato all'inizio: ora solo città e zona.
- Foto (prodotti, scontrini, volantini): si vedono solo da dentro l'app, non più con il solo indirizzo.
- Foto dei prodotti: solo quelle caricate qui o di Open Food Facts. Un indirizzo qualsiasi avrebbe fatto sapere a un altro sito chi apre l'app (e da dove).
- Intestazioni di sicurezza su ogni risposta: CSP (la pagina esegue solo i suoi file), niente pagine dentro altri siti (X-Frame-Options), HSTS, nosniff, Referrer-Policy, Permissions-Policy; le risposte /api non restano nelle cache (no-store).
- Cookie di accesso sempre «Secure» fuori dal computer di prova (prima dipendeva da un'intestazione di nginx).
- Lettura degli orari dai siti: niente richieste verso il server stesso o la rete interna, anche dopo un reindirizzamento.
- controllo-sicurezza.sh: controllo sul server, solo lettura (porte, file scaricabili, intestazioni, nginx, permessi, firewall).
- Prove: 50, compresa una che prova a leggere i dati senza accesso e quelli di un'altra famiglia.

## Novità della 0.39

- Suggerimenti mentre scrivi: accanto a ogni prodotto la bolla del supermercato e il prezzo. Il supermercato è quello dove costa meno tra i tuoi preferiti; se nei tuoi non c'è, il più economico nel raggio; se no, il più economico che c'è.
- Se in un altro supermercato del raggio (non tra i tuoi) il prodotto è in offerta, sotto compare un riquadro verde «Offerta da Lidl a 18,90 €: risparmi 6,00 € (fino al…)», ma solo se costa almeno il 20% in meno e si risparmiano almeno 3 euro (regola in OFFERTA_ALTROVE, server/index.js).

## Novità della 0.38

- Link d'invito: prima si apriva una pagina bianca e bisognava ricaricare (l'indirizzo #invito/… cambiava prima che l'app fosse pronta ad accorgersene). Ora l'invito si legge all'avvio e si arriva subito alla pagina d'ingresso. Stessa correzione per #giro/fatta.
- iPhone, app nella schermata Home: Apple non le passa l'accesso fatto in Safari, quindi chiedeva di nuovo il codice WhatsApp. Ora chi è già entrato in Safari riceve un gettone usa-e-getta (30 giorni) che finisce nell'icona: la prima apertura dell'app installata entra da sola. Usato una volta non vale più. Su Android non serve (l'accesso è già condiviso).

## Novità della 0.37

- Home: i due pulsanti si distinguono a colpo d'occhio. «Codice a barre» è azzurro (il colore delle informazioni sul prodotto), «Scontrino» resta arancio chiaro. Titolo corto in grande e una riga sotto che dice cosa fare; icona più grande.

## Novità della 0.36

- Lista della spesa: in grassetto il prodotto scelto (che dice già il formato) con accanto la bolla del supermercato; sotto solo il prezzo (e le confezioni, se più di una). Niente più «250 g: Fiocchi d'avena 250 g».
- Foto del prodotto nella riga, se c'è.
- Il quadratino da spuntare è arancione; spuntato diventa verde come prima.
- Cestino su ogni riga: la toglie subito, e per 7 secondi c'è «Annulla» per rimetterla.
- Doppioni: quando censisci un prodotto nuovo, prima di salvarlo l'app cerca nello stesso supermercato un prodotto con nome simile (e stesso formato), oppure lo stesso codice a barre ovunque. Se lo trova te lo mostra (foto, formato, ultimo prezzo): «Sì, è questo» aggiunge solo i dati che mancavano e il prezzo; «No, è un prodotto diverso» lo salva come nuovo.

## Novità della 0.35

- **Invita persone** in cima ad Altro: manda il link dell'app su WhatsApp con la spiegazione «più persone la usano, più i prezzi sono aggiornati e più risparmiamo tutti». È diverso da «La mia famiglia → Invita qualcuno», che serve a condividere la stessa lista.
- In Altro, «Inserisci un nuovo prodotto» e «Inserisci un prezzo» sono le prime due voci.
- Nella lista, «Svuota la lista» sta sopra «Avvia giro spesa», che ora è verde prato.
- Lista a voce rifatta: lo stato è sempre scritto («Accendo il microfono…», «Registrazione in corso» rossa con i secondi, «Microfono spento»); il microfono resta acceso anche nelle pause, si ferma da solo dopo 3 secondi di silenzio, «Ho finito di parlare» usa subito quello che ha sentito, e se il telefono si blocca l'app se ne accorge e lo dice invece di restare in attesa.
- Prove automatiche: il giorno delle prove è fisso (OGGI_PROVA), così i prezzi d'esempio non scadono col passare dei giorni.

## Novità della 0.34.1

- Nel nuovo prodotto, se tocchi «Era in offerta» compaiono «Inizio offerta» (oggi, già scritto) e «Fine offerta»: le date finiscono nel prezzo, così l'offerta sparisce da sola quando scade e, se parte più avanti, va tra quelle «In arrivo».

## Novità della 0.34

- Altro: due voci separate. «Inserisci un prezzo» (per un prodotto che c'è già: cerca, supermercato, prezzo) e «Inserisci un nuovo prodotto» (pagina #nuovo-prodotto: foto, nome, che cos'è, formato, tipo, descrizione/produttore/provenienza, prezzo e supermercato, tutto in una pagina e un solo «Salva»). Se in «Inserisci un prezzo» il prodotto non c'è, un collegamento porta alla pagina del nuovo prodotto con nome o codice già scritti.
- Dominio nuovo: spesasaggia.it. Lo script dominio-spesasaggia.sh aggiunge i nomi a nginx, allarga il certificato e fa rimandare dimmilaspesa.it a https://spesasaggia.it (con copia di sicurezza e ripristino se qualcosa va storto). Nei testi dell'app il dominio è spesasaggia.it.

## Novità della 0.33

- Offerte: due pulsanti «Di oggi» e «In arrivo». In arrivo ci sono le offerte dei volantini che cominciano nei prossimi giorni (valido_dal futuro): si vedono prima che partano e si mettono già in lista, con «Dal … al …».
- Categorie più fini al posto dei reparti (server/categorie.js): Frutta, Verdura e ortaggi, Carne e pollo, Pesce, Salumi, Formaggi latte e uova, Pane e forno, Pasta riso e cereali, Dolci biscotti e snack, Conserve sughi e scatolame, Olio aceto e condimenti, Caffè tè e colazione, Acqua e bibite, Vino e birra, Surgelati, Bimbi, Animali, Igiene e cura della persona, Detersivi e pulizia casa, Carta e usa e getta. Compaiono solo quelle con almeno un'offerta.
- Blu chiaro (#2F8FE0) al posto del blu notte dappertutto: pubblicità, «Portami qui», «Scopri di più», pill «Italia», spine dei supermercati non tuoi sulla mappa. Si abbina al verde prato.
- Dentro al contenuto niente si schiaccia più (riga delle categorie, mappa): correzione del guscio della 0.32.

## Novità della 0.32

- Nuovo prodotto in una pagina sola, a passi numerati: 1 foto e nome · 2 che cos'è (lo propone l'app dal nome: voce esistente o voce nuova con reparto e unità, correggibile) · 3 formato (anche 4 × 125 g, letto dal nome) · 4 tipo, marca, origine, bio · 5 prezzo e supermercato · 6 altri dati (codice, scontrino, scheda). Si salva una volta sola; il prezzo si scrive una volta sola; dopo il salvataggio si va alla scheda senza richiedere nulla (il prezzo si richiede solo se non l'hai scritto). Endpoint GET /api/voci/proposta?nome=.
- Mentre il modulo è aperto la lista e la pubblicità stanno nascoste.
- L'app è un «guscio»: testata e barra in basso sono ferme, scorre solo il contenuto (main#contenuto). Così la barra non può più muoversi insieme alla pagina su iPhone, nemmeno con la mappa.
- Pesce in scatola (sgombro, tonno, sardine, filetti…) si confronta a peso.

## Novità della 0.31

- Verde prato (#4CB944) al posto del verde scuro in tutta l'app: spunta, «preso», «Aperto fino alle», «Nella lista», semaforo e pagella, faccina verde, pulsante WhatsApp. Dove il verde fa da sfondo a una scritta, la scritta è verde scurissimo.
- Scheda prodotto senza foto: il riquadro dice «Aggiungi foto» e si tocca; si sceglie Fotocamera o Galleria e la foto si salva subito. Anche nel modulo di registrazione il riquadro vuoto è cliccabile.

## Novità della 0.30

- Confezioni multiple: quando si registra un prodotto (o si completa il formato dalla scheda) si chiede «Quanti pezzi ci sono nella confezione?» e poi quanto contiene un pezzo oppure tutta la confezione (4 scatolette da 125 g → 500 g). Il prezzo si confronta sul totale; la scheda mostra «confezione da 4 × 125 g (500 g)». Colonna prodotti.pezzi; dal nome si capisce anche «4 x 125 g».
- In home: icona «parti dalle offerte» verde prato; «Il codice a barre non si legge? Scrivilo a mano» in nero grassetto.
- Telefono: la pagina non si ingrandisce più da sola toccando un campo (maximum-scale=1 e campi mai sotto i 16px): era quello che faceva «ballare» la barra in basso durante lo scorrimento.

## Novità della 0.29

- Orari senza crediti: la ricerca su internet con Claude è SPENTA (si riaccende con ORARI_WEB=1 nel .env). Gli orari vengono dalla mappa e dalle pagine ufficiali dei negozi, lette dal server: prima i dati strutturati della pagina, poi il testo in italiano («dal lunedì al sabato 8:00-20:00, domenica 9-13», «lun-ven 8.30-13 / 16-19.30», «festivi chiuso»…).
- In Altro → Supermercati e negozi (solo chi gestisce), sotto ogni negozio c'è il campo «Pagina del negozio sul sito ufficiale»: incolli il link della pagina del negozio (Conad, Aldi, Lidl…) e «Leggi orari» li legge subito; poi li ricontrolla ogni mese. Se nella pagina non li trova lo dice.
- Nei negozi senza indirizzo gli orari non si cercano; `npm run orari` lo spiega.

## Novità della 0.28

- Palette C in tutta l'app: fondo bianco, grigio caldo, l'arancio dell'icona come unico colore. Barra in basso arancione con la voce attiva bianca; «Come funziona l'app» e i pulsanti principali arancio azione (#E85D04); «Fotografa il codice a barre» bordato e «Scansiona lo scontrino» chiaro; campo di ricerca, reparti scelti e sconti in nero caldo. Palette completa in MARCHIO.md.

## Novità della 0.27

- «I miei supermercati» ha una lista sola: la mappa con i negozi vicini. I tuoi (con la stella) si toccano e si aprono con gli orari della settimana; «Portami qui» e «Togli» restano a fianco. Le carte ripetute sotto sono sparite; resta solo «Tuoi, ma senza un negozio vicino» per i supermercati scelti senza un negozio nel raggio (con il campo per scrivere l'indirizzo).
- Orari da internet: per i negozi dei supermercati scelti rimasti senza orari (né mappa né sito), Claude li cerca sul web con la ricerca di Anthropic e li salva (fonte «web», con la pagina da cui vengono). Al massimo 8 negozi al giorno (ORARI_WEB_AL_GIORNO), ognuno una volta al mese, circa 5-10 centesimi a negozio; i negozi senza via non si cercano. `npm run orari -- forza` li cerca tutti subito. Ordine di ogni giorno: mappa → sito → internet.
- `npm run orari` aggiorna subito gli orari dal terminale e dice quanti negozi li hanno e da dove.

## Novità della 0.26

- Nuova pagina «Offerte» (quarta voce in basso, con il numero delle offerte): i prodotti in offerta oggi nei tuoi supermercati e in quelli nel tuo raggio, divisi per reparto (Frutta e verdura, Fresco, Dispensa…). Per ogni offerta: supermercato, prezzo, prezzo pieno barrato e sconto in percentuale, fino a quando vale, «Lo compri di solito». Si tocca «Metti in lista» e il prodotto finisce in lista già scelto; poi il giro funziona come sempre.
- In home, sotto «Oppure parla», la riga «Oppure parti dalle offerte» (compare solo se ci sono offerte). Passo nuovo in «Come funziona l'app».
- Le offerte vengono dai volantini letti da Claude e dai prezzi segnati come «in offerta». Dal volantino si salva anche il prezzo pieno (colonna prezzi.prezzo_pieno) per dire quanto si risparmia.
- Un'offerta che deve ancora cominciare non nasconde più il prezzo di oggi dello stesso prodotto.
- Chi mette in lista un prodotto preciso (dalla ricerca, dalle offerte, dal codice a barre) non deve più rifare «Scegli».
- «Avvia la spesa» si chiama «Avvia giro spesa».
- In «I miei supermercati» si tocca il negozio e il riquadro si apre con gli orari della settimana; «Portami qui in auto» resta sempre visibile.

## Novità della 0.25.1

- Fondo dell'app più tenue (#FFFAF5). «Come funziona l'app» rosso acceso; «Fotografa il codice a barre» verde e «Scansiona lo scontrino» giallo acceso.

## Novità della 0.25

- Nuovo marchio arancione: icona con il segnaposto e il carrello con la spunta, e tutta l'app negli stessi colori (fondo crema, pulsanti e collegamenti arancioni, sfumato del marchio sul microfono e sotto la testata). I colori che dicono qualcosa restano: verde = fatto/aperto/buono, rosso = errore/chiuso, giallo = prezzi. Palette completa in MARCHIO.md.
- La barra del telefono in alto diventa arancione (theme-color).

## Novità della 0.24

- Orari di apertura dei negozi: in «I miei supermercati» ogni negozio dice se è aperto («Aperto fino alle 20:00»), se chiude presto (arancione, «Chiude tra 25 minuti») o se è chiuso («riapre domani alle 8:00»). Si aggiorna da solo ogni minuto e conosce i festivi nazionali (Pasquetta compresa).
- Nel giro: se un negozio è chiuso o chiude prima che tu riesca ad arrivare (durata del giro + 15 minuti), un avviso lo dice prima di partire.
- Da dove vengono gli orari, in automatico ogni giorno sul server:
  1. dalla mappa (OpenStreetMap): ogni negozio si rilegge una volta alla settimana;
  2. dal sito del negozio, per quelli dei supermercati scelti che sulla mappa non hanno orari: prima i dati strutturati della pagina (schema.org), poi Claude legge il testo (pochi centesimi, al massimo 8 negozi al giorno, ognuno una volta al mese).
- Chiunque può correggerli a mano («Sono sbagliati? Correggili»): valgono per tutti e l'aggiornamento automatico non li tocca; «Torna agli orari automatici» li rimette.
- Per spegnere l'aggiornamento automatico: ORARI_AUTOMATICI=0 nel .env.

## Novità della 0.23.1

- Nuova icona dell'app: cartellino giallo a forma di fumetto con la spunta, su fondo verde (anche versione "maskable" per Android); la stessa icona compare nella testata e nella pagina di ingresso, con la frase nuova «La lista della spesa che ti dice dove costa meno e cosa conviene comprare».
- Il pulsante «Come funziona l'app» è arancione pieno, ben visibile.

## Novità della 0.23

- In cima alla lista c'è la ricerca scritta: mentre scrivi compaiono i prodotti, e per primi quelli che compri di solito («Lo compri di solito»). Tocchi e finisce in lista.
- «Parla» è sotto, come seconda scelta.
- Nuova pagina «Come funziona l'app» (dal link sotto Parla e da Altro), con caratteri grandi.
- Spuntare un prodotto è immediato (prima aspettava il server).
- Nuovo pulsante «Svuota la lista», con conferma.

## Novità della 0.22
- **Tariffe a scaglioni per persone attive in zona** (chi ha aperto l'app negli ultimi 30 giorni e abita entro 20 km): modificabili in Altro → La mia pubblicità → Tariffe. «Quanto costa in una zona» calcola persone attive, prezzi dei posti e canone del produttore per una città.
- **Produttori**: canone automatico dagli scaglioni (gratis fino a 250 persone attive, poi 15/25/39/59/89/119 € al mese), oppure fisso scritto a mano.
- **Pubblicità in home: 3 posti in tutto, compreso il tuo**, mostrati in ordine (1°, 2°, 3°). Prezzo ogni 2 settimane: 1° pieno (19/29/49/79/129/199 € secondo gli attivi), 2° al 90%, 3° all'80%. «+2 settimane» rinnova al prezzo del posto; scaduto, l'annuncio sparisce e il posto si libera. Il tuo annuncio è gratis e lo metti in un posto o lo togli. Con una zona, l'annuncio lo vede solo chi abita entro il raggio.

## Novità della 0.21
- **Formato del prodotto** in vista, subito sotto il nome: «In confezione / Sfuso / Non lo so» e, per la confezione, quantità con l'unità a scelta (g, kg, ml, litri, pezzi/lavaggi/rotoli). Se il nome contiene il formato («… 3 litri», «500 g») si compila da solo. Il server lo porta all'unità della voce (750 ml → 0,75 l); se la voce non ha ancora prodotti con il formato, si adatta (una voce creata a pezzi diventa a litri). Per una voce nuova reparto e unità sono proposti in automatico (ammorbidente → Casa e igiene, al litro).

## Novità della 0.20
- I miei supermercati: ogni negozio è cliccabile («Portami qui in auto»): apre Google Maps con la strada in macchina dalla posizione in cui sei. Si vedono i negozi della catena vicini a casa (i 4 più vicini).
- Altro: «Segnala produttori locali» (in fondo alla pagina c'è il modulo «Segnala un produttore»; le segnalazioni arrivano in Gestione → Produttori e canoni, con «Crea» e «Vista»), «Fotografa un volantino».
- Gestione solo per chi gestisce: il ruolo segue l'elenco ADMIN del server; chi non c'è (familiari, amici in prova) è un utente normale e non vede né può usare pubblicità, canoni, statistiche, volantini, segnalazioni.
- **Codice a barre a mano**: «Il codice a barre non si legge? Scrivilo a mano» sotto i pulsanti della home e dentro la fotocamera. Lettore più facile: risoluzione alta, messa a fuoco continua, solo i codici dei prodotti, riquadro di mira.
- **Fornitori**: il prezzo si può segnare anche da chi vende fuori dai supermercati (vendita diretta, online, farmacia): «Non l'hai comprato al supermercato?». Il prezzo vale ovunque, compare nella pagina Scegli («Dal fornitore …») e nel giro tra le cose da comprare a parte.
- Corretto il blocco (schermo bianco) dopo aver scelto la voce di un prodotto nuovo dal codice a barre. Se Open Food Facts non risponde si scrive la scheda a mano. Ogni pagina ha un «paracadute»: se qualcosa si rompe compare «Ricarica l'app» e l'errore finisce nel registro del server («[errore pagina]»).

## Novità della 0.19
- Pagina Scegli: se non hai ancora scelto un prodotto, la proposta principale è il tuo **preferito** (★); il consiglio dell'app lo confronta anche con i supermercati vicini che non sono tra i tuoi.
- In basso tre pulsanti veri: **La lista, Il giro, Altro** (Altro non è più in alto, dove non si vedeva). **Parla** è uno solo, in cima alla lista: cerchio grande quando la lista è vuota, riga con il microfono quando ci sono cose.
- Più spazio tra la ricerca e i pulsanti «Fotografa il codice a barre del prodotto» e «Scansiona lo scontrino».
- **Metti l'app sul telefono**: istruzioni secondo telefono e browser (iPhone Safari/Chrome, Android Chrome, Samsung Internet, Firefox; su Android con Chrome basta «Installa l'app»). Compare con la lista vuota finché non la si installa o si chiude; sempre in Altro → Metti l'icona sul telefono.

## Novità della 0.18
- **Casa e igiene**: il catalogo ora prende anche Open Products Facts (detersivi, carta, pulizia) e Open Beauty Facts (igiene personale) (per casa e igiene tutti i prodotti, anche quelli non segnati come venduti in Italia, perché gli archivi sono piccoli); `npm run catalogo` scarica tutti e tre (se uno dei due nuovi archivi non risponde, si salta). Il codice a barre di un detersivo riempie la scheda e lo mette nel reparto Casa e igiene.
- I prodotti non alimentari non hanno il semaforo alimentare (Nutri-Score, additivi, lavorazione): il giudizio viene solo dai voti di chi li usa; la scheda nasconde le parti alimentari.
- Le voci a pezzi possono contarsi a **lavaggi, rotoli, capsule, fogli, salviette** (Prezzi e prodotti → la voce → «Si conta a»): il confronto si fa al lavaggio o al rotolo. Il detersivo per lavatrice passa al lavaggio, la carta al rotolo. Dal catalogo «40 lavaggi», «12 rotoli», «30 capsule» si leggono da soli.

## Novità della 0.17
- **Home**: con la lista vuota si parte da «La tua lista è vuota» e il pulsante Parla; sotto «Oppure scrivi cosa ti serve» e i due pulsanti pieni «Leggi il codice a barre» (blu) e «Scansiona lo scontrino» (viola).
- **Pubblicità** rifatta: carta chiara come le altre, con due pulsanti — «Scrivimi su WhatsApp» (numero e messaggio già scritto) e «Scopri di più» (link alla pagina del sito, es. la landing). Si impostano in Altro → La mia pubblicità. L'annuncio esistente è stato convertito: WhatsApp 392 508 6998 e «Scopri di più» sulla pagina cessione del quinto Ferrara.

## Novità della 0.16
- **Pagina Scegli rifatta**: in alto la quantità (a confezioni se il prodotto si vende a confezione, a peso se è sfuso, a pezzi se va a pezzi); subito sotto la proposta principale (quello che hai scelto o detto, altrimenti il più conveniente del tipo che vuoi) con il supermercato, i km, il costo per la quantità e «Prendi questo»; poi **Le alternative**, una per tipo: il più votato, il più economico, il migliore, il miglior rapporto qualità-prezzo, il bio e l'italiano al prezzo più vicino. Ognuna nel supermercato dove costa meno tra i tuoi e quelli entro il raggio scelto sulla mappa (ricordato per famiglia), con quanto risparmi o spendi in più rispetto alla tua scelta. Un prodotto compare una volta sola, con tutte le sue etichette. Gli altri prodotti restano chiusi in fondo. Sotto la tua scelta, **il consiglio dell'app**: un prodotto di qualità migliore allo stesso prezzo (entro 5 centesimi o il 5%), oppure di pari qualità che costa meno; se non c'è, l'app dice che la scelta è già la migliore.

- **Volantini letti da Claude**: chiunque manda le pagine (Altro → Manda un volantino, foto o galleria); chi gestisce in Altro → Volantini tocca «Leggi con Claude» (serve `ANTHROPIC_API_KEY` nel .env), controlla supermercato, date dal/al, prezzi e abbinamenti (✓ prodotto già noto, oppure nuovo prodotto sotto la voce proposta) e carica: i prezzi entrano come offerte con il loro periodo e partono gli avvisi a chi ha quei prodotti tra i preferiti. Costo stimato per lettura mostrato in pagina.
- Pagina Scegli: «già la migliore» solo se c'è stato un vero confronto; se il prodotto è l'unico con un prezzo lo dice; i prodotti senza prezzo non si vedono più, se non su richiesta.

## Novità della 0.15
- **Statistiche d'uso** (Altro → Statistiche d'uso, solo chi gestisce): persone, famiglie, app installate sul telefono, attive oggi / 7 giorni / mese, aperture medie a settimana, nuove persone per settimana, da dove (Nord, Centro, Sud e isole secondo la regione dell'indirizzo di casa; città più presenti), cosa c'è dentro; e un testo pronto da copiare per i produttori. Solo numeri aggregati. L'app segna un giorno d'uso per persona a ogni apertura (`uso_giorni`) e si segnala «installata» quando parte dall'icona in Home.
- **L'app propone**: cercando una cosa («mandarini»), se c'è un'offerta la mostra subito con il supermercato più vicino a casa (prima tra i tuoi), i km, il prezzo e fino a quando vale, con «Prendi questo».
- **Periodo dell'offerta**: quando un prezzo è in offerta si possono scrivere «dal» e «al» (anche dalla scheda veloce dopo il codice a barre e correggendo un prezzo); scaduto il periodo, il prezzo non si usa più nel confronto.
- L'indirizzo di casa porta con sé città e regione (dalla mappa): la zona dei prezzi della famiglia diventa la sua città, non più Ferrara per tutti.

## Novità della 0.14
- **Prima apertura**: dopo il codice, l'app chiede dove abiti e mostra sulla mappa i supermercati veri nei dintorni (da OpenStreetMap, raggio 5-40 km): si toccano per metterli tra i propri. La stessa mappa è in Altro → I miei supermercati, dove si aggiunge e si toglie quando si vuole. I negozi trovati sulla mappa entrano nel database con la catena abbinata (`server/vicini.js`); le insegne sconosciute diventano catene nuove. Prova dal terminale: `npm run vicini -- "Via, numero, città" 10`.
- **Scontrino** dalla fotocamera o dalle foto già fatte (anche più di una); stessa scelta per la foto del prodotto.
- **Produttori locali**: niente commissione. Chi è nell'app paga un **canone mensile**; chi gestisce lo segna in Altro → Produttori e canoni («Pagato fino a», «+1 mese»). A canone scaduto il banco sparisce finché non si segna il pagamento. Gli ordini restano prenotazioni: si paga al ritiro.
- **Le mie spese**: quando è tutto preso, «Com'è andata la spesa?» chiude la spesa, la mette nello storico (Altro → Le mie spese) e dà la **pagella**: faccina verde (media dei punteggi ≥ 60), gialla (45-59) o rossa, con l'elenco dei prodotti e, **per la prossima volta**, le alternative: lo stesso prodotto dove costa meno, o uno di qualità pari o superiore a prezzo uguale o più basso (anche fuori dai tuoi supermercati, con il pulsante per aggiungerli).

## Novità della 0.13
- **Produttori locali**: chi gestisce crea il produttore (nome, indirizzo, cellulare, orari di ritiro, commissione %); il produttore entra nell'app con il suo numero e trova «Il mio banco»: i suoi prodotti (prezzo al kg/pezzo/litro, quantità minima, bio, foto, a quale voce della lista corrispondono) e gli ordini da evadere (Conferma → È pronto → Ritirato e pagato). Il cliente li trova in Altro → Produttori locali e nella pagina Scegli («Dai produttori locali»), ordina, ritira e paga dal produttore; riceve avvisi (e WhatsApp, se collegato) a ogni passaggio. La commissione si calcola sugli ordini ritirati, mese per mese (Gestione → Produttori e commissioni).

## Novità della 0.12
- **Lettura automatica degli scontrini fotografati** (Gestione → Scontrini fotografati → Leggi): l'app legge la foto (tesseract: `apt install tesseract-ocr tesseract-ocr-ita` sul server; senza, usa tesseract.js scaricando la lingua la prima volta), riconosce supermercato, data, totale e le righe con quantità e prezzo al kg, le abbina ai prodotti già noti (da «come è scritto sullo scontrino») e chi gestisce controlla, abbina quelle nuove e carica. I prezzi entrano a nome di chi ha mandato la foto, che riceve un avviso di ringraziamento.

## Novità della 0.11
- Nel giro, **Quanto risparmi**: rispetto a fare tutto in un negozio solo e, se conviene, quanto si risparmierebbe passando anche da supermercati fuori dai tuoi (con i prodotti che lì costano meno e un pulsante per aggiungerli).
- **Com'è la tua spesa**: i prodotti del giro divisi in promossi, così così e da ripensare, con un'alternativa migliore dove c'è. Dalla lista, quando è tutto preso, «Com'è andata la spesa?».

## Novità della 0.10
- **I miei supermercati** (Altro → I miei supermercati): ogni famiglia sceglie dove fa la spesa, con ricerca per nome e l'indirizzo del negozio (se la mappa non lo trova, non si salva e lo dice). Il giro e le proposte guardano solo questi; segnare un prezzo o aggiungere un negozio li mette tra i tuoi (★).
- Nella pagina Scegli, in alto, **Nei tuoi supermercati**: per ognuno il prodotto che costa meno, così si vede subito dove conviene andare.
- **Avvisi**: quando un tuo preferito (o una cosa che compri di solito) va in offerta in uno dei tuoi supermercati, compare un avviso in cima alla lista e, se WhatsApp è collegato, arriva un messaggio.
- Gestione supermercati con ricerca; le catene proposte dagli utenti sono segnate.

## Novità della 0.9
- Supermercati: pronte una sessantina di catene italiane (Coop, Conad, Esselunga, Famila, Penny, MD, Aldi…). Quando si segna un prezzo si scelgono i più usati con un tocco, gli altri cercando per nome con «Altro supermercato…»; se manca, chiunque può aggiungerlo. Se del supermercato non c'è un negozio in città, l'app chiede l'indirizzo (serve per il giro).
- Chi gestisce decide la zona dei prezzi di ogni catena (nazionale, Centro-Nord, Sud, città) in Altro → Supermercati e negozi.

## Novità della 0.8
- Per ogni cosa della lista c'è la pagina **Scegli**: le proposte (più economico, in offerta, italiano, bio, miglior scelta, il migliore, il preferito) con il supermercato dove costa meno e i prezzi altrove, il formato e le confezioni, i prodotti ancora senza prezzo e quelli del catalogo, oppure "Decidi tu per me" con il tipo. Dopo la voce o la ricerca si passa subito alla prima scelta, poi "Avanti" alla successiva.
- A voce, un prodotto preciso ("pan di stelle") viene cercato nel catalogo e proposto come "quello che hai detto".
- Nella lista le righe sono semplici: nome, cosa si è scelto, Scegli/Cambia e la spunta.

## Novità della 0.7
- Catalogo dei prodotti venduti in Italia da Open Food Facts (circa 270.000): `npm run catalogo` lo scarica e lo prepara in `data/catalogo.sqlite` (gira anche ogni lunedì alle 4:30 con cron). Codice a barre letto dal catalogo anche senza internet; nella ricerca compaiono anche i prodotti mai comprati.
- I prezzi si correggono (chi gestisce, o chi li ha inseriti) e il formato mancante di una confezione si scrive dalla scheda.
- Latte Sterilgarda dello scontrino Tosano: confezione da 4 litri.

## Novità della 0.6
- Codice a barre: se il prodotto è su Open Food Facts si crea da solo (voce, marca, formato, foto, ingredienti, additivi, Nutri-Score) e subito dopo l'app chiede prezzo e supermercato.
- Nella lista, sotto ogni cosa, le scelte con il prezzo (più economico, in offerta, italiano, bio, miglior scelta, preferito): si tocca quella che si vuole. Poi "Avvia la spesa" dà il giro dei supermercati e cosa prendere in ognuno.
- Pulsanti d'azione arancioni (Parla, Avvia), codice a barre in azzurro, scontrino in viola; spunta quadrata.
- Scontrini fotografati da chi usa l'app, in coda per chi gestisce i prezzi.

## Novità della 0.5
- Accesso con il numero di cellulare e un codice di 6 cifre su WhatsApp (niente password). Ogni famiglia ha la sua lista, le sue abitudini e il suo indirizzo di casa; si invitano gli altri di casa con un link. Prezzi, prodotti e voti sono di tutta la community.
- Amministratori: i numeri in `ADMIN` nel file `.env` (es. `ADMIN=3925086998`) vedono e modificano negozi, scontrini, impostazioni generali e pubblicità.
- Invio del codice: `WHATSAPP_PONTE_URL` e `WHATSAPP_PONTE_SEGRETO` (lo stesso ponte di LeadValue e della Segretaria). Senza ponte il codice finisce solo nel registro del server (`pm2 logs dimmilaspesa`).
- `TITOLARE` nel `.env`: chi tratta i dati, mostrato nella pagina Privacy.
- Foto dei prodotti scattate dal telefono (salvate in `data/foto`).
- Giudizio con semaforo (Ottimo, Buono, Così così, Scarso) che conta anche gli additivi (rosso, giallo, verde secondo EFSA, IARC e regole UE dell'etichetta); additivi da Open Food Facts o letti dagli ingredienti.
- Scheda prodotto nuova: foto grande, semaforo, additivi spiegati, ingredienti leggibili, prezzi sul cartellino, voto con le stelle.

## Novità della 0.4
- Grafica nuova pensata per chi ha 50-70 anni: testo grande (carattere Atkinson Hyperlegible), pulsanti grandi, tre sole voci in basso (La lista, Parla, Dove comprare).
- Lista a voce: si tocca **Parla**, si dice «due chili di patate, il latte e tre pacchi di pasta», si controlla e si mette in lista. Capisce quantità (chili, etti, grammi, litri, pacchi, bottiglie…), «bio» e «italiano», e le marche già note («la Nutella»). Le cose nuove entrano in elenco con il reparto indovinato.
- Nella lista: cerchio per spuntare quello che hai preso (non entra più nel confronto), «Cambia» per quantità, tipo e marca.
- Le scelte (italiano, bio, marca) fatte su una voce si ricordano per la volta dopo: niente preferenza unica valida per tutto.
- La gestione (inserire prezzi, prezzi e prodotti, negozi, scontrini, impostazioni, pubblicità) è tutta sotto **Altro**, con la scelta «Di solito compro».

## Novità della 0.3
- **Ricerca con sei risposte** per ogni voce: 👍 Miglior scelta (più qualità per ogni euro, fra i prodotti con qualità almeno
  40/100) · 🏆 Il migliore (qualità più alta) · 💰 Più economico · 🇮🇹 Italiano più economico · 🌱 Bio più economico · ★ Il mio preferito.
- **Qualità 0-100** (`server/qualita.js`): stelle degli utenti fino a 50 punti, Nutri-Score 20, NOVA (quanto è lavorato) 10,
  bio 12, origine Italia 8; contano solo le parti note. Senza dati: «non ancora valutabile». Nella scheda si danno le stelle.
- **Codice a barre**: «Scansiona» nella lista e in Rileva (Chrome Android con il lettore del telefono, iPhone con ZXing; serve
  https o localhost). Se il prodotto c'è si apre la scheda; se no la scheda arriva da Open Food Facts (nome, marca, formato letto
  da «250 g» / «6 x 125 g», bio, origine, Nutri-Score, NOVA, foto, ingredienti) con le voci in cui metterlo.

## Novità della 0.2
- **Ricerca in cima alla lista**: per ogni voce trovata (anche cercando la marca: «nutella» trova Crema di nocciole) il più
  economico, l'italiano più economico, il bio più economico e **il mio preferito** (★, uno per voce), con catena e prezzo al
  kg; un tocco e va in lista. Se la stessa offerta è sia la più economica sia l'italiana compare una volta con due etichette.
- **Scheda prodotto** (`#prodotto/ID`): formato, descrizione, produttore e provenienza, ingredienti, Nutri-Score, foto, note,
  prezzi per supermercato e storico; «Dati da Open Food Facts» completa i campi vuoti dal codice a barre.
- **Formato**: in confezione (con il contenuto), sfuso, oppure **da completare**: senza formato il prezzo si salva ma non si
  confronta al kg (dagli scontrini molti formati sono troncati: si completano con la confezione in mano).
- **Zone dei prezzi**: nazionale (Lidl), Centro-Nord (Eurospin), Sud, oppure solo città (Tosano, per ora); nelle impostazioni la
  zona dell'utente.
- **Dati**: scontrini Lidl (via Eridano) e Tosano (via Galleria Diamantina) del 31/10/2026; Eurospin con frutta e verdura italiane
  e prezzi del fresco fino all'1/11. I dati si caricano a versioni (`server/scontrini.js`): un archivio già avviato con la 0.1 si
  aggiorna da solo, senza doppioni.

App per la spesa al prezzo più basso fra i supermercati, con il giro più comodo. All'inizio la usa Nazario: i prezzi li carica lui
(dagli scontrini e dagli scaffali), poi si apre a tutti, gratuita con i suoi messaggi pubblicitari.

## Come ragiona
- **Prezzi per catena**, non per negozio: per le catene con prezzo nazionale (Lidl) un prezzo vale ovunque, per le altre nella città
  impostata (Ferrara). I negozi servono per il giro: per ogni catena si va al punto vendita più vicino a casa.
- **Voce e prodotto**: in lista si mette la voce (Zucchine, Crema di nocciole) che si confronta al kg, al litro o al pezzo; i prodotti
  sono le cose precise sullo scaffale, con tipo (di marca / marchio del supermercato / senza marca o sfuso), origine (Italia, estero,
  non indicata), bio, formato della confezione, codice a barre e nome sullo scontrino.
- **Scelte in lista**: Normale · Italiano · Bio · Bio italiano; marca: qualsiasi, solo di marca, solo marchio del supermercato,
  una marca precisa. Se in una catena non c'è niente che rispetti le scelte, l'app lo dice.
- **Date dei prezzi**: frutta e verdura hanno la settimana dal… al… (proposta: lunedì-domenica della rilevazione) e dopo non
  contano più; gli altri prezzi valgono 60 giorni dalla rilevazione (oltre i 30 compaiono "da ricontrollare").
- **Il calcolo**: tutte le combinazioni fino a 3 catene; per ognuna la spesa (confezioni intere, o a peso per lo sfuso), il giro
  casa → negozi → casa (km a 0,25 €), i minuti; un negozio in più deve far risparmiare almeno 3 € (si cambia nelle impostazioni).
  Le prime 4 soluzioni, il confronto con "tutto in un negozio solo" e il link del giro su Google Maps.
- **Pubblicità**: solo messaggi propri, uguali per tutti (mai scelti in base alla spesa). Per il credito: nella nota iscrizione OAM
  e banca; niente tassi o rate senza l'esempio con il TAEG.

## Provare sul Mac
```
cd ~/Progetti/giro-spesa
npm install
npm start
```
Poi apri http://localhost:3200. Al primo avvio l'archivio (data/spesa.sqlite) contiene lo scontrino Eurospin del 31/10/2026.
Indirizzi: con `GOOGLE_MAPS_KEY` nel file `.env` usa Google, altrimenti OpenStreetMap. In produzione mettere `PASSWORD` nel `.env`.

Prove: `npm run prova`. Dopo modifiche alle schermate: `npm run build`.
