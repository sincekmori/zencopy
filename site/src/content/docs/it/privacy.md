---
title: Privacy
description: Cosa lascia il tuo dispositivo, cosa vi resta e chi altro è coinvolto.
sidebar:
  hidden: true
---

ZenCopy è un'app desktop locale.
Non ha server, né account, né telemetria.

## Cosa lascia il tuo dispositivo

Quando premi il trigger (<span data-os-modifier>Ctrl/⌘</span> + C + C), il contenuto degli appunti catturato viene inviato direttamente al provider LLM che _tu_ hai configurato — nient'altro, e da nessun'altra parte.
Cosa venga inviato esattamente dipende dall'azione eseguita:

- Il prompt renderizzato, che può incorporare il contesto della cattura come [variabili di template](/it/configuration/): il testo e il markup copiati, il nome dell'app di origine e il titolo della finestra, l'URL della pagina, la data e la tua lingua.
- Per un'immagine o dei file copiati, viene allegato il contenuto stesso (fino a 10 MB per cattura) — e per i file, i loro percorsi completi.
  Per impostazione predefinita il popup chiede conferma prima di inviarli.

Un singolo copia normale non viene mai catturato né inviato.
Il contenuto degli appunti che altre app contrassegnano come riservato (es. i gestori di password) viene ignorato.

A parte le catture, il controllo degli aggiornamenti chiede a GitHub solo i metadati della release — mai i tuoi contenuti.

## Cosa resta sul tuo dispositivo

- Le tue chiavi API (`ai-sdk-catalog.json` nella directory di configurazione dell'app — mai incluse nel pacchetto, mai caricate).
- Le tue impostazioni (tema, lingua, posizione del popup, …).
- I file di log.
  I log oscurano i segreti e non includono mai i contenuti copiati né le chiavi API.

- Statistiche d'uso (un interruttore nelle impostazioni, attivo per impostazione predefinita): quale azione è stata eseguita su quale tipo di cattura, con il modello e il numero di token, così i costi restano calcolabili.
  Solo un file locale — mai il contenuto copiato, mai inviato da nessuna parte.

## Terze parti

Il tuo uso di un provider LLM è regolato dai termini e dall'informativa sulla privacy di quel provider.
ZenCopy non aggiunge intermediari: il tuo contenuto va solo al provider che configuri, e il suo uso e i suoi costi sono tuoi.

## Non fidarti sulla parola

ZenCopy è open source (Apache-2.0).
Ogni affermazione di questa pagina può essere verificata sul [codice sorgente](https://github.com/sincekmori/zencopy).
