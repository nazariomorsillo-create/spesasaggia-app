-- Giro spesa (31/10/2026): prezzi dei supermercati per catena, lista della spesa, giro più conveniente.
CREATE TABLE IF NOT EXISTS impostazioni (chiave TEXT PRIMARY KEY, valore TEXT NOT NULL);

-- Catena: i prezzi valgono per tutta Italia (nazionale, es. Lidl) o per città (es. Esselunga Ferrara)
CREATE TABLE IF NOT EXISTS catene (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  ambito TEXT NOT NULL DEFAULT 'citta'             -- nazionale | centro-nord | sud | citta
);
-- Punti vendita: servono per il giro (il prezzo è della catena)
CREATE TABLE IF NOT EXISTS negozi (
  id INTEGER PRIMARY KEY,
  catena_id INTEGER NOT NULL REFERENCES catene(id),
  indirizzo TEXT NOT NULL,
  citta TEXT NOT NULL DEFAULT '',
  lat REAL, lng REAL,
  attivo INTEGER NOT NULL DEFAULT 1
);
-- Voce: cosa si mette in lista e si confronta fra catene (Zucchine, Crema di nocciole), con l'unità del confronto
CREATE TABLE IF NOT EXISTS voci (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  reparto TEXT NOT NULL DEFAULT 'dispensa',        -- ortofrutta | pane | fresco | dispensa | surgelati | bevande | casa | altro
  unita TEXT NOT NULL DEFAULT 'pz'                 -- kg | l | pz
);
-- Prodotto: una cosa precisa sullo scaffale
CREATE TABLE IF NOT EXISTS prodotti (
  id INTEGER PRIMARY KEY,
  voce_id INTEGER NOT NULL REFERENCES voci(id),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'senza',              -- marca (Nutella, Barilla) | supermercato (marchio della catena) | senza (sfuso, generico)
  marca TEXT NOT NULL DEFAULT '',
  catena_id INTEGER REFERENCES catene(id),         -- per il marchio del supermercato: di quale catena
  origine TEXT NOT NULL DEFAULT '',                -- italia | estero | '' (non indicata)
  bio INTEGER NOT NULL DEFAULT 0,
  quantita REAL,                                   -- quanto contiene una confezione, nell'unità della voce (1 kg, 0,35 kg, 2 pz); NULL = sfuso o formato da completare
  ean TEXT NOT NULL DEFAULT '',
  nome_scontrino TEXT NOT NULL DEFAULT ''          -- come compare sugli scontrini (per riconoscerlo)
);
CREATE INDEX IF NOT EXISTS ix_prodotti_voce ON prodotti(voce_id);
-- Prezzo rilevato: per confezione (o al kg per lo sfuso) e per unità della voce; ortofrutta con la settimana dal-al
CREATE TABLE IF NOT EXISTS prezzi (
  id INTEGER PRIMARY KEY,
  prodotto_id INTEGER NOT NULL REFERENCES prodotti(id) ON DELETE CASCADE,
  catena_id INTEGER NOT NULL REFERENCES catene(id),
  citta TEXT NOT NULL DEFAULT '',                  -- zona del prezzo: la città, l'area (centro-nord, sud) o '' se nazionale
  prezzo REAL NOT NULL,                            -- € a confezione, o €/unità per lo sfuso
  unitario REAL NOT NULL,                          -- € per kg / l / pz
  offerta INTEGER NOT NULL DEFAULT 0,
  rilevato_il TEXT NOT NULL,
  valido_dal TEXT,
  valido_al TEXT,
  fonte TEXT NOT NULL DEFAULT 'manuale',           -- scontrino | scaffale | manuale
  scontrino_id INTEGER,
  creato_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_prezzi ON prezzi(prodotto_id, catena_id, rilevato_il);
CREATE TABLE IF NOT EXISTS scontrini (
  id INTEGER PRIMARY KEY,
  catena_id INTEGER REFERENCES catene(id),
  negozio_id INTEGER REFERENCES negozi(id),
  data TEXT NOT NULL,
  ora TEXT NOT NULL DEFAULT '',
  numero TEXT NOT NULL DEFAULT '',
  totale REAL NOT NULL DEFAULT 0,
  righe TEXT NOT NULL DEFAULT '[]',                -- JSON [{testo, quantita, unita, prezzo_unita, importo, prodotto_id}]
  creato_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS righe_lista (
  id INTEGER PRIMARY KEY,
  voce_id INTEGER NOT NULL REFERENCES voci(id),
  prodotto_id INTEGER REFERENCES prodotti(id),     -- se si vuole proprio quel prodotto
  quantita REAL NOT NULL DEFAULT 1,
  qualita TEXT NOT NULL DEFAULT 'qualsiasi',       -- qualsiasi | italiano | bio | bio_italiano
  marca TEXT NOT NULL DEFAULT 'qualsiasi',         -- qualsiasi | marca | supermercato | brand:<nome>
  ordine INTEGER NOT NULL DEFAULT 0
);
-- La mia pubblicità (solo messaggi propri, uguali per tutti)
CREATE TABLE IF NOT EXISTS annunci (
  id INTEGER PRIMARY KEY,
  titolo TEXT NOT NULL,
  testo TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  bottone TEXT NOT NULL DEFAULT '',
  nota TEXT NOT NULL DEFAULT '',                   -- chi fa la pubblicità (per il credito: iscrizione OAM e banca)
  attivo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS geocache (q TEXT PRIMARY KEY, lat REAL, lng REAL, creato_at TEXT NOT NULL DEFAULT (datetime('now')));
-- 0.14: zone già cercate sulla mappa (supermercati intorno a casa), per non rifare la stessa ricerca
CREATE TABLE IF NOT EXISTS zone_cercate (chiave TEXT PRIMARY KEY, quando TEXT NOT NULL);

-- Il prodotto preferito di ogni voce (per ora un solo utente: 'io')
CREATE TABLE IF NOT EXISTS preferiti (
  utente TEXT NOT NULL DEFAULT 'io',
  voce_id INTEGER NOT NULL REFERENCES voci(id),
  prodotto_id INTEGER NOT NULL REFERENCES prodotti(id) ON DELETE CASCADE,
  PRIMARY KEY (utente, voce_id)
);

-- Valutazioni dei prodotti (1-5 stelle); con la community diventano la media di tutti gli utenti
CREATE TABLE IF NOT EXISTS valutazioni (
  utente TEXT NOT NULL DEFAULT 'io',
  prodotto_id INTEGER NOT NULL REFERENCES prodotti(id) ON DELETE CASCADE,
  stelle INTEGER NOT NULL,
  commento TEXT NOT NULL DEFAULT '',
  creato_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (utente, prodotto_id)
);

-- quello che una famiglia sceglie per una voce (italiano, bio, marca) vale anche la prossima volta
CREATE TABLE IF NOT EXISTS abitudini (
  famiglia_id INTEGER NOT NULL DEFAULT 0,
  voce_id INTEGER NOT NULL REFERENCES voci(id) ON DELETE CASCADE,
  qualita TEXT NOT NULL DEFAULT 'qualsiasi',
  marca TEXT NOT NULL DEFAULT 'qualsiasi',
  PRIMARY KEY (famiglia_id, voce_id)
);

-- 0.5: accesso con il numero di telefono e un codice; ogni famiglia ha la sua lista
CREATE TABLE IF NOT EXISTS famiglie (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  casa TEXT NOT NULL DEFAULT '',          -- JSON {indirizzo, lat, lng}: partenza e arrivo del giro
  citta TEXT NOT NULL DEFAULT '',         -- vuoto = quella delle impostazioni generali
  area TEXT NOT NULL DEFAULT '',          -- centro-nord | sud | vuoto
  creata_il TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS utenti (
  id INTEGER PRIMARY KEY,
  telefono TEXT NOT NULL UNIQUE,          -- solo cifre, senza +39
  nome TEXT NOT NULL DEFAULT '',
  famiglia_id INTEGER REFERENCES famiglie(id),
  admin INTEGER NOT NULL DEFAULT 0,
  creato_il TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_accesso TEXT
);
CREATE TABLE IF NOT EXISTS sessioni (
  impronta TEXT PRIMARY KEY,              -- sha256 del gettone nel cookie
  utente_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  scade TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS codici (
  telefono TEXT PRIMARY KEY,
  impronta TEXT NOT NULL,
  scade TEXT NOT NULL,
  tentativi INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS invii_codici (telefono TEXT NOT NULL, ip TEXT NOT NULL DEFAULT '', il TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS inviti (
  codice TEXT PRIMARY KEY,
  famiglia_id INTEGER NOT NULL REFERENCES famiglie(id) ON DELETE CASCADE,
  scade TEXT NOT NULL
);

-- 0.5.2: scontrini fotografati dagli utenti, da leggere
CREATE TABLE IF NOT EXISTS scontrini_foto (
  id INTEGER PRIMARY KEY,
  utente_id INTEGER REFERENCES utenti(id) ON DELETE SET NULL,
  foto TEXT NOT NULL,
  catena TEXT NOT NULL DEFAULT '',
  stato TEXT NOT NULL DEFAULT 'da leggere',   -- da leggere | letto | scartato
  creato_il TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 0.10: i supermercati dove va una famiglia (il giro e le proposte guardano questi)
CREATE TABLE IF NOT EXISTS famiglia_catene (
  famiglia_id INTEGER NOT NULL REFERENCES famiglie(id) ON DELETE CASCADE,
  catena_id INTEGER NOT NULL REFERENCES catene(id) ON DELETE CASCADE,
  PRIMARY KEY (famiglia_id, catena_id)
);
-- avvisi per la famiglia: un preferito in offerta, un prezzo che scende
CREATE TABLE IF NOT EXISTS avvisi (
  id INTEGER PRIMARY KEY,
  famiglia_id INTEGER NOT NULL REFERENCES famiglie(id) ON DELETE CASCADE,
  testo TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  letto INTEGER NOT NULL DEFAULT 0,
  creato_il TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 0.13: produttori locali — vendono i loro prodotti nell'app, si ritira da loro, commissione sul venduto
CREATE TABLE IF NOT EXISTS produttori (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  descrizione TEXT NOT NULL DEFAULT '',
  indirizzo TEXT NOT NULL DEFAULT '',
  citta TEXT NOT NULL DEFAULT '',
  lat REAL, lng REAL,
  telefono TEXT NOT NULL DEFAULT '',          -- cellulare del produttore: riceve gli ordini e, se entra nell'app, gestisce le sue cose
  orari TEXT NOT NULL DEFAULT '',             -- quando si ritira, in parole: "martedì e venerdì 17-19"
  commissione REAL NOT NULL DEFAULT 10,       -- % sul venduto
  attivo INTEGER NOT NULL DEFAULT 1,
  creato_il TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS offerte (
  id INTEGER PRIMARY KEY,
  produttore_id INTEGER NOT NULL REFERENCES produttori(id) ON DELETE CASCADE,
  voce_id INTEGER REFERENCES voci(id),        -- a quale cosa della lista corrisponde (Zucchine, Uova…)
  nome TEXT NOT NULL,
  descrizione TEXT NOT NULL DEFAULT '',
  prezzo REAL NOT NULL,
  unita TEXT NOT NULL DEFAULT 'kg',           -- kg | pz | l
  passo REAL NOT NULL DEFAULT 1,              -- quantità minima e scatto (0.5 kg, 6 uova…)
  bio INTEGER NOT NULL DEFAULT 0,
  foto TEXT NOT NULL DEFAULT '',
  disponibile INTEGER NOT NULL DEFAULT 1,
  creato_il TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ordini (
  id INTEGER PRIMARY KEY,
  produttore_id INTEGER NOT NULL REFERENCES produttori(id),
  famiglia_id INTEGER NOT NULL REFERENCES famiglie(id),
  utente_id INTEGER REFERENCES utenti(id),
  stato TEXT NOT NULL DEFAULT 'nuovo',        -- nuovo | confermato | pronto | ritirato | annullato
  righe TEXT NOT NULL DEFAULT '[]',           -- JSON [{offerta_id, nome, quantita, unita, prezzo, importo}]
  totale REAL NOT NULL DEFAULT 0,
  commissione REAL NOT NULL DEFAULT 0,        -- quanto spetta alla piattaforma su questo ordine
  ritiro TEXT NOT NULL DEFAULT '',            -- quando passa a ritirare
  note TEXT NOT NULL DEFAULT '',
  creato_il TEXT NOT NULL DEFAULT (datetime('now')),
  aggiornato_il TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 0.14: le spese fatte (quando si chiude la lista): cosa, dove, a quanto, con il giudizio e l'alternativa migliore
CREATE TABLE IF NOT EXISTS spese (
  id INTEGER PRIMARY KEY,
  famiglia_id INTEGER NOT NULL REFERENCES famiglie(id),
  data TEXT NOT NULL,                     -- giorno della spesa
  righe TEXT NOT NULL,                    -- JSON [{voce, prodotto, prodotto_id, catena, quantita, unita, costo, qualita, alternativa}]
  catene TEXT NOT NULL DEFAULT '[]',      -- JSON dei supermercati del giro
  n INTEGER NOT NULL DEFAULT 0,
  totale REAL,                            -- somma dei costi noti
  media REAL,                             -- media dei punteggi (0-100) dei prodotti con giudizio
  colore TEXT NOT NULL DEFAULT 'grigio',  -- verde | giallo | rosso | grigio
  creata_il TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS spese_famiglia ON spese(famiglia_id, data);

-- 0.15: un segno per ogni giorno in cui una persona apre l'app (per le statistiche d'uso; niente altro)
CREATE TABLE IF NOT EXISTS uso_giorni (utente_id INTEGER NOT NULL, giorno TEXT NOT NULL, PRIMARY KEY (utente_id, giorno));

-- 0.16: volantini fotografati, letti da Claude e controllati da chi gestisce prima di caricare le offerte
CREATE TABLE IF NOT EXISTS volantini (
  id INTEGER PRIMARY KEY,
  utente_id INTEGER REFERENCES utenti(id) ON DELETE SET NULL,
  foto TEXT NOT NULL,
  catena_id INTEGER REFERENCES catene(id),
  stato TEXT NOT NULL DEFAULT 'da leggere',   -- da leggere | letto | scartato
  lettura TEXT,                               -- JSON di Claude con gli abbinamenti
  costo REAL,                                 -- euro spesi per leggerlo (stima)
  creato_il TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 0.20: produttori locali segnalati da chi usa l'app (chi gestisce li contatta e li mette nell'app)
CREATE TABLE IF NOT EXISTS segnalazioni (
  id INTEGER PRIMARY KEY,
  utente_id INTEGER REFERENCES utenti(id) ON DELETE SET NULL,
  nome TEXT NOT NULL, telefono TEXT NOT NULL DEFAULT '', dove TEXT NOT NULL DEFAULT '', cosa TEXT NOT NULL DEFAULT '',
  stato TEXT NOT NULL DEFAULT 'nuova',          -- nuova | vista
  creata_il TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 0.49: etichette lette con Claude (foto della confezione quando il codice a barre non si trova): costo e chi
CREATE TABLE IF NOT EXISTS etichette_lette (
  id INTEGER PRIMARY KEY,
  utente_id INTEGER REFERENCES utenti(id) ON DELETE SET NULL,
  costo REAL NOT NULL DEFAULT 0,
  creata_il TEXT NOT NULL DEFAULT (datetime('now'))
);
