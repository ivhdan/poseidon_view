/* ==========================================================
   Poseidon View — widget a mappa: correnti e temperatura
   Entrambi: tutto il Mediterraneo, oggi + 9 giorni di previsione,
   barra dei giorni, valore puntuale al tocco.
   ========================================================== */

(() => {

  const ROSA = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const FONTE = 'https://data.marine.copernicus.eu/product/MEDSEA_ANALYSISFORECAST_PHY_006_013';

  // Parte comune: scheletro, mappa, legenda, giorni, campo colorato, tocco
  async function mappaGiornaliera(root, cfg) {
    const el = PV.scheletro(root, { ...cfg, giorni: true, fonte: FONTE });

    const mapEl = document.createElement('div');
    mapEl.className = 'map';
    el.body.prepend(mapEl);
    const legEl = document.createElement('div');
    legEl.className = 'legend';
    el.body.appendChild(legEl);
    PV.legend(legEl, cfg.legenda);

    const map = PV.makeMap(mapEl);
    const extra = cfg.prepara ? cfg.prepara(map) : {};
    let overlay = null, giorni = [], attivo = -1;
    const cache = new Map();

    function carica(i) {
      const f = giorni[i].file;
      if (!cache.has(f)) cache.set(f, PV.json(cfg.dati + f).then(cfg.campo));
      return cache.get(f);
    }

    async function mostra(i) {
      attivo = i;
      try {
        const campo = await carica(i);
        if (i !== attivo) return;            // nel frattempo e' stato scelto un altro giorno
        const url = campo.immagine();
        if (overlay) overlay.setUrl(url);
        else overlay = L.imageOverlay(url, campo.bounds(), { opacity: 0.95, interactive: false }).addTo(map);
        if (cfg.mostrato) cfg.mostrato(campo, extra);
        el.chip.textContent = PV.prettyDate(campo.data);
        PV.status(el.status, '');
        if (i + 1 < giorni.length) carica(i + 1);       // precarica il giorno dopo
      } catch (e) {
        PV.status(el.status, 'Dati del giorno non disponibili.');
      }
    }

    map.on('click', async e => {
      if (attivo < 0) return;
      const campo = await carica(attivo);
      const html = cfg.tocco(campo, e.latlng.lng, e.latlng.lat);
      L.popup({ closeButton: false, autoPan: false }).setLatLng(e.latlng)
        .setContent((html || '<small>NESSUN DATO QUI</small>') + `<br><small>${PV.coord(e.latlng)}</small>`)
        .openOn(map);
    });

    PV.status(el.status, 'Carico i dati…');
    try {
      giorni = PV.giorniDaOggi(await PV.json(cfg.dati + 'index.json'));
    } catch (e) {
      PV.status(el.status, 'Dati in aggiornamento, riprova più tardi.');
      return;
    }
    PV.barraGiorni(el.strip, el.play, giorni, mostra).scegli(0);
  }

  /* ---------- Correnti ---------- */

  class CampoCorrenti extends PV.Griglia {
    constructor(j) {
      super(j);
      this.u = PV.Griglia.leggi(j.u, 100);     // cm/s -> m/s
      this.v = PV.Griglia.leggi(j.v, 100);
    }
    vel(lon, lat) {
      const u = this.interp(this.u, lon, lat);
      if (u === null) return null;
      return [u, this.interp(this.v, lon, lat)];
    }
    immagine() {
      return super.immagine(i => Math.hypot(this.u[i], this.v[i]), PV.SCALA_CORRENTE, 3);
    }
  }

  PV.widgets.correnti = root => mappaGiornaliera(root, {
    nome: 'correnti',
    titolo: 'Correnti marine',
    sotto: 'Superficie &middot; 10 giorni',
    piede: 'Tocca il mare per velocit&agrave; e direzione',
    dati: PV.base + 'data/correnti/',
    campo: j => new CampoCorrenti(j),
    legenda: { title: 'Velocità della corrente', unit: 'm/s', scala: PV.SCALA_CORRENTE,
               ticks: [0, 0.2, 0.4, 0.6, 0.8] },
    prepara: map => ({ anim: new Animazione(map) }),
    mostrato: (campo, extra) => extra.anim.setCampo(campo),
    tocco: (campo, lon, lat) => {
      let v = campo.vel(lon, lat);
      if (!v) {
        const u = campo.vicino(campo.u, lon, lat);
        if (u === null) return null;
        v = [u, campo.vicino(campo.v, lon, lat)];
      }
      const s = Math.hypot(v[0], v[1]);
      const deg = (Math.atan2(v[0], v[1]) * 180 / Math.PI + 360) % 360;   // verso cui scorre
      return `<b>${PV.num(s, 2)} m/s</b> (${PV.num(s * 1.943844)} nodi)<br>` +
             `verso ${ROSA[Math.round(deg / 45) % 8]} &middot; ${Math.round(deg)}&deg;`;
    }
  });

  /* ---------- Temperatura ---------- */

  class CampoTemperatura extends PV.Griglia {
    constructor(j) {
      super(j);
      this.t = PV.Griglia.leggi(j.t, 10);      // decimi di grado -> gradi C
    }
    immagine() {
      return super.immagine(i => this.t[i], PV.SCALA_TEMPERATURA, 3);
    }
  }

  PV.widgets.temperatura = root => mappaGiornaliera(root, {
    nome: 'temperatura',
    titolo: 'Temperatura del mare',
    sotto: 'Superficie &middot; 10 giorni',
    piede: 'Tocca il mare per leggere la temperatura',
    dati: PV.base + 'data/temperatura/',
    campo: j => new CampoTemperatura(j),
    legenda: { title: 'Temperatura dell’acqua', unit: '°C', scala: PV.SCALA_TEMPERATURA,
               ticks: [10, 14, 18, 22, 26, 30] },
    tocco: (campo, lon, lat) => {
      const t = campo.interp(campo.t, lon, lat) ?? campo.vicino(campo.t, lon, lat);
      return t === null ? null : `<b>${PV.num(t)} &deg;C</b>`;
    }
  });

})();
