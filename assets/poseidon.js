/* ==========================================================
   Poseidon View — funzioni condivise dei widget
   Dati: Copernicus Marine WMTS (accesso pubblico, senza login)
   ========================================================== */

const PV = (() => {

  const WMTS = 'https://wmts.marine.copernicus.eu/teroWmts';
  const MAX_NATIVE_ZOOM = 10;            // il WMTS espone TILEMATRIX 0..10
  const MED_BOUNDS = [[30.0, -6.0], [46.2, 36.5]];
  const ITA_BOUNDS = [[36.0, 7.0], [45.8, 18.8]];

  /* ---------- Date ---------- */

  // Data in formato AAAA-MM-GG (UTC) spostata di "offset" giorni
  function isoDate(offset = 0) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }

  function prettyDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu',
                  'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
    return `${d} ${mesi[m - 1]} ${y}`;
  }

  /* ---------- URL WMTS ---------- */

  function tileUrl(layer, style, time) {
    // {z},{y},{x} li sostituisce Leaflet: il resto va codificato
    const q = [
      'SERVICE=WMTS', 'REQUEST=GetTile', 'VERSION=1.0.0',
      'LAYER=' + encodeURIComponent(layer),
      'STYLE=' + encodeURIComponent(style),
      'TILEMATRIXSET=EPSG:3857',
      'TILEMATRIX={z}', 'TILEROW={y}', 'TILECOL={x}',
      'FORMAT=image/png'
    ];
    if (time) q.push('TIME=' + time);
    return WMTS + '?' + q.join('&');
  }

  function featureInfoUrl(map, layer, latlng, time) {
    const z = Math.min(Math.round(map.getZoom()), MAX_NATIVE_ZOOM);
    const p = map.project(latlng, z);
    const col = Math.floor(p.x / 256);
    const row = Math.floor(p.y / 256);
    const i = Math.floor(p.x - col * 256);
    const j = Math.floor(p.y - row * 256);
    const q = [
      'SERVICE=WMTS', 'REQUEST=GetFeatureInfo', 'VERSION=1.0.0',
      'LAYER=' + encodeURIComponent(layer),
      'TILEMATRIXSET=EPSG:3857',
      'TILEMATRIX=' + z, 'TILEROW=' + row, 'TILECOL=' + col,
      'I=' + i, 'J=' + j,
      'INFOFORMAT=application/json'
    ];
    if (time) q.push('TIME=' + time);
    return WMTS + '?' + q.join('&');
  }

  // Cerca il primo numero valido dentro una risposta JSON di forma ignota
  function firstNumber(obj) {
    if (typeof obj === 'number' && isFinite(obj)) return obj;
    if (obj && typeof obj === 'object') {
      const keys = Array.isArray(obj) ? obj.keys() : Object.keys(obj);
      // prima le chiavi che si chiamano "value"
      if (!Array.isArray(obj) && 'value' in obj) {
        const v = firstNumber(obj.value);
        if (v !== null) return v;
      }
      for (const k of keys) {
        if (k === 'value') continue;
        const v = firstNumber(obj[k]);
        if (v !== null) return v;
      }
    }
    return null;
  }

  let featureInfoBroken = false;

  async function featureValue(map, layer, latlng, time) {
    if (featureInfoBroken) return { error: 'blocked' };
    try {
      const r = await fetch(featureInfoUrl(map, layer, latlng, time));
      if (!r.ok) return { error: 'http' };
      const v = firstNumber(await r.json());
      return v === null ? { error: 'nodata' } : { value: v };
    } catch (e) {
      // tipicamente CORS: non si riprova a ogni tocco
      featureInfoBroken = true;
      return { error: 'blocked' };
    }
  }

  /* ---------- Mappa base ---------- */

  function makeMap(id) {
    const map = L.map(id, {
      zoomControl: true,
      attributionControl: true,
      gestureHandling: true,           // due dita su smartphone, Ctrl+rotella su PC
      minZoom: 3,
      maxZoom: 12,
      maxBounds: [[20, -25], [55, 50]],
      maxBoundsViscosity: 0.8,
      worldCopyJump: false
    });
    // Su schermo stretto (telefono) si parte dai mari italiani, altrimenti tutto il Mediterraneo
    const stretto = document.getElementById(id).clientWidth < 600;
    map.fitBounds(stretto ? ITA_BOUNDS : MED_BOUNDS, { padding: [4, 4] });

    const carto = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

    // Fondo scuro senza scritte
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png', {
      subdomains: 'abcd', maxZoom: 19, attribution: carto
    }).addTo(map);

    // Nomi delle città sopra i dati
    map.createPane('labels');
    map.getPane('labels').style.zIndex = 650;
    map.getPane('labels').style.pointerEvents = 'none';
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png', {
      subdomains: 'abcd', maxZoom: 19, pane: 'labels'
    }).addTo(map);

    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution(
      'E.U. <a href="https://marine.copernicus.eu/">Copernicus Marine Service</a> Information');

    // Su mobile la mappa si ridimensiona quando l'iframe cambia misura
    window.addEventListener('resize', () => map.invalidateSize());

    return map;
  }

  /* ---------- Strato Copernicus con ricerca dell'ultimo giorno ---------- */
  // Prova la data di oggi; se nessuna tile arriva, torna indietro di un giorno
  // fino a "maxBack". Chiama onDate(data) appena trova dati validi.
  function copernicusLayer(map, { layer, style, opacity = 0.9, maxBack = 4, onDate, onFail }) {
    let back = 0;
    let current = null;

    function attempt() {
      const date = isoDate(-back);
      let ok = 0;
      const tl = L.tileLayer(tileUrl(layer, style, date), {
        maxNativeZoom: MAX_NATIVE_ZOOM,
        maxZoom: 12,
        opacity,
        crossOrigin: false,
        bounds: [[29.0, -7.0], [47.0, 37.5]]
      });
      tl.on('tileload', () => {
        if (ok++ === 0 && onDate) onDate(date);
      });
      tl.on('load', () => {
        if (ok > 0) return;
        // rimozione rinviata: Leaflet sta ancora chiudendo le tile in errore
        setTimeout(() => {
          tl.off();
          if (map.hasLayer(tl)) map.removeLayer(tl);
          if (back < maxBack) { back++; attempt(); }
          else if (onFail) onFail();
        }, 50);
      });
      tl.addTo(map);
      current = tl;
    }

    attempt();
    return { get layer() { return current; }, get date() { return isoDate(-back); } };
  }

  /* ---------- Legenda ---------- */

  function legend(el, { title, unit, min, max, colors, ticks }) {
    const grad = colors.map((c, k) => `${c} ${(k / (colors.length - 1) * 100).toFixed(1)}%`).join(', ');
    const tickHtml = ticks.map(t => {
      const pos = (t - min) / (max - min) * 100;
      const shift = pos <= 0 ? '0' : pos >= 100 ? '-100%' : '-50%';   // estremi allineati al bordo
      return `<span style="left:${pos}%;transform:translateX(${shift})">${String(t).replace('.', ',')}</span>`;
    }).join('');
    el.innerHTML =
      `<div class="lg-label"><span>${title}</span><span>${unit}</span></div>` +
      `<div class="lg-bar" style="background:linear-gradient(90deg, ${grad})"></div>` +
      `<div class="lg-ticks">${tickHtml}</div>`;
  }

  /* ---------- Messaggi ---------- */

  function status(el, text) {
    if (!text) { el.classList.remove('show'); return; }
    el.textContent = text;
    el.classList.add('show');
  }

  // 43.12 N · 3.40 O  (ovest per longitudini negative)
  function coord(ll) {
    const f = x => Math.abs(x).toFixed(2).replace('.', ',');
    return `${f(ll.lat)}&deg;${ll.lat >= 0 ? 'N' : 'S'} &middot; ${f(ll.lng)}&deg;${ll.lng >= 0 ? 'E' : 'O'}`;
  }

  return { coord, isoDate, prettyDate, tileUrl, featureValue, makeMap, copernicusLayer, legend, status };
})();
