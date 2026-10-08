# Poseidon View

Widget sul mare Mediterraneo per il sito di **Mito Sub A.S.D.** (Susa), con dati
E.U. Copernicus Marine Service.

| Widget | Percorso | Dati |
|---|---|---|
| Temperatura superficiale del giorno | `sst/` | `SST_MED_SST_L4_NRT_OBSERVATIONS_010_004` (satellite, L4) |
| Correnti superficiali animate, 10 giorni | `correnti/` | `MEDSEA_ANALYSISFORECAST_PHY_006_013` (modello, media giornaliera) |
| Temperature medie mensili dal 2000 | `trend/` | in preparazione |

- **Temperatura**: legge le tile WMTS di Copernicus direttamente dal browser
  (servizio pubblico, senza credenziali).
- **Correnti**: ogni notte la GitHub Action *Aggiorna correnti* scarica con la
  toolbox `copernicusmarine` le componenti `uo`/`vo` a circa 1 m di profondità per
  oggi e i 9 giorni successivi, le media su una griglia di 0,125° e scrive un file
  per giorno in `data/correnti/`. Il browser anima migliaia di particelle che seguono
  il campo, in stile Windy.

## Credenziali Copernicus

Nel repo, **Settings → Secrets and variables → Actions**, due segreti:

- `COPERNICUSMARINE_SERVICE_USERNAME`
- `COPERNICUSMARINE_SERVICE_PASSWORD`

Per lanciare subito l'aggiornamento: **Actions → Aggiorna correnti → Run workflow**.

## Pubblicazione con GitHub Pages

1. Su GitHub: **Settings → Pages**.
2. *Source*: **Deploy from a branch**, branch `main`, cartella `/ (root)`.
3. Dopo un minuto il sito è su `https://ivhdan.github.io/poseidon_view/`.

## Inserimento in Google Sites

Per ogni widget: **Inserisci → Incorpora → Da URL**.

| Widget | URL | Altezza consigliata |
|---|---|---|
| Temperatura | `https://ivhdan.github.io/poseidon_view/sst/` | 460 px |
| Correnti | `https://ivhdan.github.io/poseidon_view/correnti/` | 460 px |

Ogni widget riempie tutta l'altezza dell'incorporamento: basta trascinare il
bordo del riquadro in Google Sites.

## Comportamento su smartphone

- Su telefono la mappa parte dai mari italiani, su schermo largo da tutto il Mediterraneo.
- Le particelle si fermano quando il widget non è visibile, per non consumare batteria;
  su telefono sono meno numerose.
- La mappa si sposta con **due dita**, così con un dito la pagina continua a scorrere.
  Su PC lo zoom con la rotella richiede **Ctrl**.
- **Toccando il mare** compare il valore puntuale (temperatura, oppure velocità e
  direzione della corrente).
- Il pulsante in alto a destra apre il widget a schermo intero.

## Configurazione

- `sst/index.html`: `SCALA_MESE` imposta la scala colori di ogni mese (°C).
- `assets/correnti-anim.js`: `V_MAX` (fondo scala, m/s), `RAMPA` (colori del campo),
  `maxParticles` e `speed` (densità e velocità visiva delle particelle).
- `.github/workflows/correnti.yml`: orario dell'aggiornamento notturno.
- Se Copernicus rinomina un dataset (es. il suffisso `_202311`), si aggiorna la
  costante `LAYER` / `BASE` in cima allo script.

Il widget cerca automaticamente l'ultimo giorno disponibile, fino a 4 giorni indietro.

## Licenza dati

Generated using E.U. Copernicus Marine Service Information.
