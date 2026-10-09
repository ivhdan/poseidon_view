# Poseidon View

Widget sul mare Mediterraneo per il sito di **Mito Sub A.S.D.** (Susa), con dati
E.U. Copernicus Marine Service.

| Widget | `data-widget` | Dati |
|---|---|---|
| Temperatura del mare, oggi + 9 giorni | `temperatura` | modello `MEDSEA_ANALYSISFORECAST_PHY_006_013`, ~1 m |
| Correnti animate, oggi + 9 giorni | `correnti` | modello `MEDSEA_ANALYSISFORECAST_PHY_006_013`, ~1 m |
| Temperatura media mensile dal 2000 | `grafico` | rianalisi `MEDSEA_MULTIYEAR_PHY_006_004` + analisi per i mesi recenti |

Anteprima e codici pronti: `https://ivhdan.github.io/poseidon_view/`

## Inserimento in Google Sites

**Inserisci → Incorpora → Incorpora codice**, poi incolla una riga:

```html
<script src="https://ivhdan.github.io/poseidon_view/embed.js" data-widget="temperatura"></script>
<script src="https://ivhdan.github.io/poseidon_view/embed.js" data-widget="correnti"></script>
<script src="https://ivhdan.github.io/poseidon_view/embed.js" data-widget="grafico"></script>
```

Il widget riempie il riquadro: l'altezza si regola trascinandone il bordo
(consigliati 460–500 px per le mappe, 400–420 px per il grafico).
Tutto il codice vive su GitHub: ogni modifica al repo arriva da sola ai widget
già incorporati. Dopo una modifica a stili o script, aumentare `VERSIONE` in
`embed.js` per forzare i browser a ricaricarli.

## Come si aggiornano i dati

| Workflow | Quando | Cosa fa |
|---|---|---|
| *Aggiorna mare (giornaliero)* | ogni giorno 05:17 UTC | `scripts/correnti.py` e `scripts/temperatura.py` → `data/correnti/`, `data/temperatura/` |
| *Aggiorna grafico (mensile)* | il 12 di ogni mese | `scripts/trend.py` → `data/trend.json` (media pesata per area, Atlantico escluso) |
| *Scopri dataset* | a mano | elenca i dataset Copernicus disponibili sul ramo `diagnostica` |

Si possono lanciare subito da **Actions → nome del workflow → Run workflow**.
Le credenziali Copernicus sono nei segreti del repo
(`COPERNICUSMARINE_SERVICE_USERNAME`, `COPERNICUSMARINE_SERVICE_PASSWORD`).

## Comportamento

- **Telefono**: le mappe partono dai mari italiani; su schermo largo mostrano tutto il
  Mediterraneo con l'Europa intorno. Si spostano con due dita (con un dito scorre la
  pagina); su PC lo zoom con la rotella richiede Ctrl.
- **Tocco sul mare**: temperatura, oppure velocità (m/s e nodi) e direzione della corrente.
- **Barra dei giorni** con ▶ per vedere la previsione scorrere.
- **Grafico**: si scorre con un dito (o trascinando col mouse, o con le frecce) per
  tornare agli anni passati; toccando un mese compare il valore e la differenza dalla
  media di quel mese.
- Le particelle si fermano quando il widget non è visibile (batteria).

## Personalizzazione

- `assets/poseidon.js`: `SCALA_TEMPERATURA` (blu → rosso → amaranto, scala fissa
  10–31 °C), `SCALA_CORRENTE`, inquadrature `MED_BOUNDS` / `ITA_BOUNDS`.
- `assets/animazione.js`: `maxParticles`, `speed` (densità e velocità delle particelle).
- `assets/w-grafico.js`: anni visibili per schermata (3 su telefono, 8 su PC).

## Licenza dati

Generated using E.U. Copernicus Marine Service Information.
