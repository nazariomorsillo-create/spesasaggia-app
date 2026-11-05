// Scontrini caricati a mano da Nazario (31/10/2026). Ogni riga: testo come sullo scontrino, quantità, prezzo unitario
// (a confezione, o al kg per lo sfuso), importo, e la voce [nome, reparto, unità di confronto] con il prodotto.
// Formato della confezione (quantita, nell'unità della voce) solo quando si legge sullo scontrino: altrimenti resta
// "da completare" e il prodotto non entra nel confronto al kg finché non lo si scrive nella scheda.
// Frutta e verdura: tutte italiane (Nazario compra solo vegetali italiani).
const V = (nome, reparto, unita) => [nome, reparto, unita];
const IT = 'italia';
const conf = (nome, extra = {}) => ({ nome, ...extra });
const sfuso = (nome, extra = {}) => ({ nome, sfuso: 1, ...extra });

export const SCONTRINI = [
  {
    versione: 1, catena: { nome: 'Eurospin', ambito: 'citta' }, negozio: { indirizzo: 'Via Porta Catena 39, 44100 Ferrara', citta: 'Ferrara' },
    data: '2026-10-31', ora: '10:53', numero: '00087-00049', totale: 16.00, fresco: { dal: '2026-10-26', al: '2026-11-01' },
    righe: [
      // su Eurospin le righe "Net ... x ..." e "N PZ x ..." stanno SOPRA il prodotto a cui si riferiscono
      { testo: 'CAROTE 1kg', q: 1, pu: 1.19, importo: 1.19, voce: V('Carote', 'ortofrutta', 'kg'), prodotto: conf('Carote, confezione 1 kg', { quantita: 1 }) },
      { testo: 'CETRIOLI', q: 2.304, unita: 'kg', pu: 1.99, importo: 4.58, voce: V('Cetrioli', 'ortofrutta', 'kg'), prodotto: sfuso('Cetrioli sfusi') },
      { testo: 'PANINO VIENNESE 55', q: 5, pu: 0.25, importo: 1.25, voce: V('Panino viennese', 'pane', 'pz'), prodotto: conf('Panino viennese 55 g', { quantita: 1 }) },
      { testo: 'RADICCHIO TONDO RO', q: 0.668, unita: 'kg', pu: 2.99, importo: 2.00, voce: V('Radicchio tondo rosso', 'ortofrutta', 'kg'), prodotto: sfuso('Radicchio tondo rosso sfuso') },
      { testo: 'ZUCCHINE', q: 1.036, unita: 'kg', pu: 1.69, importo: 1.75, voce: V('Zucchine', 'ortofrutta', 'kg'), prodotto: sfuso('Zucchine sfuse') },
      { testo: 'CLEMENTINE CON FOG', q: 3.072, unita: 'kg', pu: 1.69, importo: 5.19, voce: V('Clementine con foglia', 'ortofrutta', 'kg'), prodotto: sfuso('Clementine con foglia sfuse') },
      { testo: 'SHOPPER ORTOFR.BIO', q: 4, pu: 0.01, importo: 0.04 },
    ],
  },
  {
    versione: 2, catena: { nome: 'Lidl', ambito: 'nazionale' }, negozio: { indirizzo: 'Via Eridano 2G, 44122 Ferrara', citta: 'Ferrara' },
    data: '2026-10-31', ora: '12:18', numero: '2698-0042', totale: 36.35,
    righe: [
      { testo: 'BARRETTE ARACH.FRUTT', q: 2, pu: 1.55, importo: 3.10, voce: V('Barrette di frutta secca', 'dispensa', 'pz'), prodotto: conf('Barrette arachidi e frutta Lidl', { tipo: 'supermercato' }) },
      { testo: 'ACQUA NATURALE', q: 2, pu: 0.16, importo: 0.32, voce: V('Acqua naturale', 'bevande', 'l'), prodotto: conf('Acqua naturale Lidl', { tipo: 'supermercato' }) },
      { testo: 'ORZO SOLUBILE', q: 1, pu: 1.35, importo: 1.35, voce: V('Orzo solubile', 'dispensa', 'kg'), prodotto: conf('Orzo solubile Lidl', { tipo: 'supermercato' }) },
      { testo: 'FETTE CROC.SESAMO', q: 1, pu: 0.99, importo: 0.99, voce: V('Fette croccanti', 'dispensa', 'kg'), prodotto: conf('Fette croccanti al sesamo Lidl', { tipo: 'supermercato' }) },
      { testo: 'ARACH. SALATE', q: 1, pu: 1.95, importo: 1.95, voce: V('Arachidi salate', 'dispensa', 'kg'), prodotto: conf('Arachidi salate Lidl', { tipo: 'supermercato' }) },
      { testo: 'FRESELLE INTEGRALI', q: 1, pu: 1.95, importo: 1.95, voce: V('Freselle integrali', 'dispensa', 'kg'), prodotto: conf('Freselle integrali Lidl', { tipo: 'supermercato' }) },
      { testo: 'MEREND.CACAO E LATTE', q: 1, pu: 1.75, importo: 1.75, voce: V('Merendine', 'dispensa', 'pz'), prodotto: conf('Merendine cacao e latte Lidl', { tipo: 'supermercato' }) },
      { testo: 'PANE FR.LIEVITO MADR', q: 1, pu: 1.99, importo: 1.99, voce: V('Pane con lievito madre', 'pane', 'kg'), prodotto: conf('Pane fresco al lievito madre Lidl', { tipo: 'supermercato' }) },
      { testo: 'CREMA ALLA NOCCIOLA', q: 1, pu: 1.99, importo: 1.99, voce: V('Crema di nocciole', 'dispensa', 'kg'), prodotto: conf('Crema alla nocciola Lidl', { tipo: 'supermercato' }) },
      { testo: 'CACHI', q: 1, pu: 1.45, importo: 1.45, voce: V('Cachi', 'ortofrutta', 'kg'), prodotto: conf('Cachi in confezione', { origine: IT }) },
      { testo: 'SUSINE 1KG', q: 1, pu: 1.99, importo: 1.99, voce: V('Susine', 'ortofrutta', 'kg'), prodotto: conf('Susine, confezione 1 kg', { origine: IT, quantita: 1 }) },
      { testo: 'PEPERONI ROSSI', q: 0.26, unita: 'kg', pu: 3.49, importo: 0.91, voce: V('Peperoni rossi', 'ortofrutta', 'kg'), prodotto: sfuso('Peperoni rossi sfusi', { origine: IT }) },
      { testo: 'SACCH.ORTOFR.BIOGRAD', q: 1, pu: 0.01, importo: 0.01 },
      { testo: 'SPECK AFFUMICATO AFF', q: 2, pu: 1.79, importo: 3.58, voce: V('Speck', 'fresco', 'kg'), prodotto: conf('Speck affumicato affettato Lidl', { tipo: 'supermercato' }) },
      { testo: 'SALSICCIA LUGANEGA', q: 2, pu: 3.69, importo: 7.38, voce: V('Salsiccia', 'fresco', 'kg'), prodotto: conf('Salsiccia luganega Lidl', { tipo: 'supermercato' }) },
      { testo: 'SCAMORZA AFFUM.', q: 1, pu: 1.69, importo: 1.69, voce: V('Scamorza affumicata', 'fresco', 'kg'), prodotto: conf('Scamorza affumicata Lidl', { tipo: 'supermercato' }) },
      { testo: 'MSC BASTONC.DI PESCE', q: 1, pu: 3.95, importo: 3.95, voce: V('Bastoncini di pesce', 'surgelati', 'kg'), prodotto: conf('Bastoncini di pesce MSC Lidl', { tipo: 'supermercato' }) },
    ],
  },
  {
    versione: 2, catena: { nome: 'Tosano', ambito: 'citta' }, negozio: { indirizzo: 'Via Galleria Diamantina 23, 44100 Ferrara', citta: 'Ferrara' },
    data: '2026-10-31', ora: '11:53', numero: '2420-0042', totale: 57.63,
    righe: [
      { testo: 'RUCOLA BUSTA MAXI GR.250', q: 1, pu: 1.59, importo: 1.59, voce: V('Rucola', 'ortofrutta', 'kg'), prodotto: conf('Rucola in busta 250 g', { origine: IT, quantita: 0.25 }) },
      { testo: "ALPLI'LATTE DI KEFIR GR.4", q: 1, pu: 0.99, importo: 0.99, voce: V('Kefir', 'fresco', 'kg'), prodotto: conf("Latte di kefir Alpli'", { tipo: 'marca', marca: "Alpli'" }) },
      { testo: "ALPLI'LATTE DI KEFIR GR.4", q: 1, pu: 0.99, importo: 0.99, voce: V('Kefir', 'fresco', 'kg'), prodotto: conf("Latte di kefir Alpli'", { tipo: 'marca', marca: "Alpli'" }) },
      { testo: 'TORTORA FRITTELLE ALGHE G', q: 1, pu: 1.59, importo: 1.59, voce: V('Frittelle di alghe', 'fresco', 'kg'), prodotto: conf('Frittelle di alghe Tortora', { tipo: 'marca', marca: 'Tortora' }) },
      { testo: 'SARTOR MIX FUNGHI ITAL. G', q: 1, pu: 1.99, importo: 1.99, voce: V('Funghi misti', 'ortofrutta', 'kg'), prodotto: conf('Mix funghi italiani Sartor', { tipo: 'marca', marca: 'Sartor', origine: IT }) },
      { testo: 'BELLA NAPOLI MARGHER. 2PZ', q: 1, pu: 3.49, importo: 3.49, voce: V('Pizza margherita surgelata', 'surgelati', 'pz'), prodotto: conf('Pizza margherita Bella Napoli, 2 pezzi', { tipo: 'marca', marca: 'Bella Napoli', quantita: 2 }) },
      { testo: 'TOSANO TARTUFI BIANCHI GR', q: 1, pu: 1.90, importo: 1.90, voce: V('Tartufi di cioccolato', 'dispensa', 'kg'), prodotto: conf('Tartufi bianchi Tosano', { tipo: 'supermercato' }) },
      { testo: 'DAYLY BOBINA M.USO 2R/2V/', q: 1, pu: 2.40, importo: 2.40, voce: V('Carta multiuso (rotoli)', 'casa', 'pz'), prodotto: conf('Bobina multiuso Dayly, 2 rotoli', { tipo: 'marca', marca: 'Dayly', quantita: 2 }) },
      { testo: 'PRESTIGE MAGNUM 12R/2V/60', q: 1, pu: 4.95, importo: 4.95, voce: V('Carta igienica (rotoli)', 'casa', 'pz'), prodotto: conf('Carta igienica Prestige Magnum, 12 rotoli', { tipo: 'marca', marca: 'Prestige', quantita: 12 }) },
      { testo: 'ALBA LAVATR.ARGAN&NARCISO', q: 1, pu: 3.55, importo: 3.55, voce: V('Detersivo lavatrice', 'casa', 'l'), prodotto: conf('Detersivo lavatrice Alba argan e narciso', { tipo: 'marca', marca: 'Alba' }) },
      { testo: 'DIVELLA PASSATA POMOD.GR.', q: 3, pu: 0.85, importo: 2.55, voce: V('Passata di pomodoro', 'dispensa', 'kg'), prodotto: conf('Passata di pomodoro Divella', { tipo: 'marca', marca: 'Divella' }) },
      { testo: 'CAPIT.COLLUT.OX ACT.WHIT.', q: 1, pu: 1.25, importo: 1.25, voce: V('Collutorio', 'casa', 'l'), prodotto: conf('Collutorio Ox Active White Pasta del Capitano', { tipo: 'marca', marca: 'Pasta del Capitano' }) },
      { testo: 'N.DERMA DET.INT.DELICATO', q: 1, pu: 0.99, importo: 0.99, voce: V('Detergente intimo', 'casa', 'l'), prodotto: conf('Detergente intimo delicato N.Derma', { tipo: 'marca', marca: 'N.Derma' }) },
      { testo: 'DELICIUS FIL.SGOMBRO OG G', q: 1, pu: 3.99, importo: 3.99, voce: V('Filetti di sgombro', 'dispensa', 'kg'), prodotto: conf('Filetti di sgombro Delicius', { tipo: 'marca', marca: 'Delicius' }) },
      { testo: 'STERILG.LATTE MIC.UHT.PS', q: 1, pu: 3.99, importo: 3.99, voce: V('Latte UHT parzialmente scremato', 'fresco', 'l'), prodotto: conf('Latte microfiltrato UHT parz. scremato Sterilgarda', { tipo: 'marca', marca: 'Sterilgarda', quantita: 4 }) },
      { testo: 'SGAM.BRONZO GNOCCHET.SARD', q: 1, pu: 1.09, importo: 1.09, voce: V('Pasta di semola', 'dispensa', 'kg'), prodotto: conf('Gnocchetti sardi al bronzo Sgambaro', { tipo: 'marca', marca: 'Sgambaro' }) },
      { testo: 'SGAMB.BRO.PASTA MISTA 82', q: 1, pu: 1.09, importo: 1.09, voce: V('Pasta di semola', 'dispensa', 'kg'), prodotto: conf('Pasta mista n. 82 al bronzo Sgambaro', { tipo: 'marca', marca: 'Sgambaro' }) },
      { testo: 'VALLE MELE AC.MELE BIO ML', q: 1, pu: 2.50, importo: 2.50, voce: V('Aceto di mele', 'dispensa', 'l'), prodotto: conf('Aceto di mele bio Valle Mele', { tipo: 'marca', marca: 'Valle Mele', bio: 1 }) },
      { testo: 'SGAM.BRONZO REGINETTE 331', q: 1, pu: 1.09, importo: 1.09, voce: V('Pasta di semola', 'dispensa', 'kg'), prodotto: conf('Reginette n. 331 al bronzo Sgambaro', { tipo: 'marca', marca: 'Sgambaro' }) },
      { testo: 'BMS LENTICCHIE.PICC.BIO.I', q: 1, pu: 2.00, importo: 2.00, voce: V('Lenticchie', 'dispensa', 'kg'), prodotto: conf('Lenticchie piccole bio BMS', { tipo: 'marca', marca: 'BMS', bio: 1, note: 'Sullo scontrino «BIO.I»: forse bio italiane, da controllare sulla confezione' }) },
      { testo: 'ZORZI SEMI MIX INSALATA G', q: 1, pu: 2.50, importo: 2.50, voce: V('Semi misti', 'dispensa', 'kg'), prodotto: conf('Mix di semi per insalata Zorzi', { tipo: 'marca', marca: 'Zorzi' }) },
      { testo: 'CIPOLLE ROSSE KG.1 CAL.50', q: 1, pu: 1.48, importo: 1.48, voce: V('Cipolle rosse', 'ortofrutta', 'kg'), prodotto: conf('Cipolle rosse, confezione 1 kg', { origine: IT, quantita: 1 }) },
      { testo: 'P.CAPITANO DENT.CARBONE M', q: 1, pu: 1.05, importo: 1.05, voce: V('Dentifricio', 'casa', 'pz'), prodotto: conf('Dentifricio al carbone Pasta del Capitano', { tipo: 'marca', marca: 'Pasta del Capitano' }) },
      { testo: 'VELIERO ACCIU.ITA.OO VV G', q: 1, pu: 2.99, importo: 2.99, voce: V("Acciughe sott'olio", 'dispensa', 'kg'), prodotto: conf('Acciughe italiane Veliero', { tipo: 'marca', marca: 'Veliero', origine: IT }) },
      { testo: 'COTTON PULIOREC.SCAT.BIAN', q: 1, pu: 0.95, importo: 0.95, voce: V('Cotton fioc', 'casa', 'pz'), prodotto: conf('Bastoncini puliorecchie Cotton', { tipo: 'marca', marca: 'Cotton' }) },
      { testo: "TUSCE' MAIONESE VASO ML.2", q: 1, pu: 1.20, importo: 1.20, voce: V('Maionese', 'dispensa', 'l'), prodotto: conf("Maionese in vaso Tusce'", { tipo: 'marca', marca: "Tusce'" }) },
      { testo: 'ROSMARINO CONF.GR.30 MAGN', q: 1, pu: 0.98, importo: 0.98, voce: V('Rosmarino', 'ortofrutta', 'kg'), prodotto: conf('Rosmarino, confezione 30 g', { origine: IT, quantita: 0.03 }) },
      { testo: 'SIBILLINA GARGANELLI GR.5', q: 1, pu: 2.50, importo: 2.50, voce: V("Pasta all'uovo", 'dispensa', 'kg'), prodotto: conf('Garganelli Sibillina', { tipo: 'marca', marca: 'Sibillina' }) },
      { testo: 'SCONTO A PAGARE', q: 1, pu: -0.03, importo: -0.03 },
    ],
  },
];
