# Poseidon View

Widget sul mare Mediterraneo per il sito di **Mito Sub A.S.D.** (Susa), con dati
E.U. Copernicus Marine Service.

| Widget | Percorso | Dati |
|---|---|---|
| Temperatura superficiale del giorno | `sst/` | `SST_MED_SST_L4_NRT_OBSERVATIONS_010_004` (satellite, L4) |
| Correnti superficiali | `correnti/` | `MEDSEA_ANALYSISFORECAST_PHY_006_013` (modello, media giornaliera) |
| Temperature medie mensili dal 2000 | `trend/` | in preparazione |

I due widget a mappa leggono le tile WMTS di Copernicus direttamente dal browser:
il servizio è pubblico, quindi non servono credenziali né server.

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

- La mappa si sposta con **due dita**, così con un dito la pagina continua a scorrere.
  Su PC lo zoom con la rotella richiede **Ctrl**.
- **Toccando il mare** compare il valore puntuale (temperatura, oppure velocità e
  direzione della corrente).
- Il pulsante in alto a destra apre il widget a schermo intero.

## Configurazione

- `sst/index.html`: `SCALA_MESE` imposta la scala colori di ogni mese (°C).
- `correnti/index.html`: `V_MAX` imposta il fondo scala della velocità (m/s).
- Se Copernicus rinomina un dataset (es. il suffisso `_202311`), si aggiorna la
  costante `LAYER` / `BASE` in cima allo script.

Il widget cerca automaticamente l'ultimo giorno disponibile, fino a 4 giorni indietro.

## Licenza dati

Generated using E.U. Copernicus Marine Service Information.
