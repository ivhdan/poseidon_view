/* ==========================================================
   Poseidon View — funzioni condivise dei widget Mito Sub
   Dati: E.U. Copernicus Marine Service, preparati ogni giorno
   dalle GitHub Actions nella cartella data/
   ========================================================== */

const PV = (() => {

  const MED_BOUNDS = [[30.2, -5.6], [46.0, 36.3]];   // tutto il Mediterraneo
  const ITA_BOUNDS = [[36.4, 7.2], [45.8, 18.6]];     // mari italiani (schermi stretti)
  const SCHERMO_STRETTO = 600;                        // px

  /* ---------- Date e numeri ---------- */

  const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
                       'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const GG = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

  function isoDate(offset = 0) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }

  function prettyDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${MESI[m - 1]} ${y}`;
  }

  // 24.37 -> "24,4"
  const num = (x, dec = 1) => x.toFixed(dec).replace('.', ',');

  // 43,12°N · 3,40°O (ovest per longitudini negative)
  function coord(ll) {
    const f = x => num(Math.abs(x), 2);
    return `${f(ll.lat)}&deg;${ll.lat >= 0 ? 'N' : 'S'} &middot; ${f(ll.lng)}&deg;${ll.lng >= 0 ? 'E' : 'O'}`;
  }

  /* ---------- Scale di colore ---------- */

  // Scala a tappe [valore, colore]: restituisce colore (rgb) per qualsiasi valore
  class Scala {
    constructor(tappe) {
      this.tappe = tappe.map(([v, h]) => {
        const n = parseInt(h.slice(1), 16);
        return [v, [(n >> 16) & 255, (n >> 8) & 255, n & 255], h];
      });
      this.min = tappe[0][0];
      this.max = tappe[tappe.length - 1][0];
      // tabella di 512 colori precalcolati: veloce nel disegno pixel per pixel
      this.N = 512;
      this.lut = new Uint8ClampedArray(this.N * 3);
      for (let i = 0; i < this.N; i++) {
        const c = this.calcola(this.min + (this.max - this.min) * i / (this.N - 1));
        this.lut.set(c, i * 3);
      }
    }
    calcola(v) {
      const t = this.tappe;
      if (v <= t[0][0]) return t[0][1];
      for (let k = 1; k < t.length; k++) {
        if (v <= t[k][0]) {
          const f = (v - t[k - 1][0]) / (t[k][0] - t[k - 1][0]);
          return t[k - 1][1].map((c, i) => Math.round(c + (t[k][1][i] - c) * f));
        }
      }
      return t[t.length - 1][1];
    }
    indice(v) {
      const i = Math.round((v - this.min) / (this.max - this.min) * (this.N - 1));
      return Math.max(0, Math.min(this.N - 1, i)) * 3;
    }
    css(v) { return `rgb(${this.calcola(v).join(',')})`; }
    // per la legenda: colori a passo regolare
    campioni(n = 24) {
      return Array.from({ length: n }, (_, i) =>
        this.css(this.min + (this.max - this.min) * i / (n - 1)));
    }
  }

  // Temperatura del mare (°C): dal blu (freddo) al rosso (caldo) fino all'amaranto
  // (caldo estremo). Scala fissa tutto l'anno: lo stesso colore = la stessa temperatura.
  const SCALA_TEMPERATURA = new Scala([
    [10, '#0a2a66'], [13, '#1554a8'], [16, '#2f88cc'], [18.5, '#6fbde0'],
    [20.5, '#b9e2e4'], [22, '#f1e7b4'], [23.5, '#f7c56c'], [25, '#f08e3e'],
    [26.5, '#e0532b'], [28, '#c42126'], [29.5, '#981237'], [31, '#6a0b32']
  ]);

  // Velocita' della corrente (m/s): dal blu notte all'ottone
  const SCALA_CORRENTE = new Scala([
    [0, '#0b2540'], [0.13, '#123a5e'], [0.27, '#1b5e84'], [0.4, '#2a8aa0'],
    [0.53, '#57b3a8'], [0.67, '#a9c793'], [0.8, '#e6c36a']
  ]);

  /* ---------- Griglie di dati (file JSON del giorno) ---------- */

  // Griglia regolare lon/lat: righe da sud a nord, colonne da ovest a est
  class Griglia {
    constructor(j) {
      this.data = j.data;
      this.nx = j.nx; this.ny = j.ny;
      this.lon0 = j.lon0; this.lat0 = j.lat0;
      this.dlon = j.dlon; this.dlat = j.dlat;
    }
    static leggi(arr, scala) {
      const out = new Float32Array(arr.length);
      for (let i = 0; i < arr.length; i++) out[i] = arr[i] === null ? NaN : arr[i] / scala;
      return out;
    }
    bounds() {
      return [[this.lat0 - this.dlat / 2, this.lon0 - this.dlon / 2],
              [this.lat0 + (this.ny - 0.5) * this.dlat, this.lon0 + (this.nx - 0.5) * this.dlon]];
    }
    // interpolazione bilineare di un array sulla griglia; null fuori dal mare
    interp(a, lon, lat) {
      const fx = (lon - this.lon0) / this.dlon, fy = (lat - this.lat0) / this.dlat;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      if (x0 < 0 || y0 < 0 || x0 >= this.nx - 1 || y0 >= this.ny - 1) return null;
      const tx = fx - x0, ty = fy - y0, i = y0 * this.nx + x0;
      const p = a[i], q = a[i + 1], r = a[i + this.nx], s = a[i + this.nx + 1];
      if (p !== p || q !== q || r !== r || s !== s) return null;
      return p * (1 - tx) * (1 - ty) + q * tx * (1 - ty) + r * (1 - tx) * ty + s * tx * ty;
    }
    // valore della cella piu' vicina (tocchi vicino alla costa)
    vicino(a, lon, lat) {
      const x = Math.round((lon - this.lon0) / this.dlon), y = Math.round((lat - this.lat0) / this.dlat);
      if (x < 0 || y < 0 || x >= this.nx || y >= this.ny) return null;
      const v = a[y * this.nx + x];
      return v !== v ? null : v;
    }

    // Immagine colorata del campo, morbida (bilineare) e proiettata in Mercatore.
    // valore(i) -> numero o NaN per la cella i; scala: una Scala.
    immagine(valore, scala, fattore = 3) {
      const nx = this.nx, ny = this.ny;
      const val = new Float32Array(nx * ny);
      for (let i = 0; i < val.length; i++) val[i] = valore(i);

      const b = this.bounds();
      const merc = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
      const latDa = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
      const yS = merc(b[0][0]), yN = merc(b[1][0]);
      const W = nx * fattore, H = Math.round(ny * 1.25 * fattore);
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(W, H);
      const px = img.data, lut = scala.lut;

      for (let r = 0; r < H; r++) {
        const lat = latDa(yN - (r + 0.5) / H * (yN - yS));
        const fy = (lat - this.lat0) / this.dlat;
        const y0 = Math.floor(fy), ty = fy - y0;
        if (y0 < -1 || y0 >= ny) continue;
        for (let c = 0; c < W; c++) {
          const fx = (c + 0.5) / fattore - 0.5;
          // media pesata dei vicini di mare: colore morbido
          const x0 = Math.floor(fx), tx = fx - x0;
          let s = 0, w = 0;
          for (let dy = 0; dy < 2; dy++) {
            const yy = y0 + dy;
            if (yy < 0 || yy >= ny) continue;
            const wy = dy ? ty : 1 - ty;
            for (let dx = 0; dx < 2; dx++) {
              const xx = x0 + dx;
              if (xx < 0 || xx >= nx) continue;
              const v = val[yy * nx + xx];
              if (v !== v) continue;
              const ww = wy * (dx ? tx : 1 - tx);
              s += v * ww; w += ww;
            }
          }
          // costa sfumata: piu' vicini di terra = piu' trasparente (niente scalini)
          if (w < 0.2) continue;
          const k = scala.indice(s / w), p = (r * W + c) * 4;
          px[p] = lut[k]; px[p + 1] = lut[k + 1]; px[p + 2] = lut[k + 2];
          px[p + 3] = Math.round(242 * Math.min(1, (w - 0.2) / 0.6));
        }
      }
      ctx.putImageData(img, 0, 0);
      return cv.toDataURL('image/png');
    }
  }

  /* ---------- Caricamento dati ---------- */

  async function json(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  }

  /* ---------- Mappa base ---------- */

  function makeMap(el) {
    const stretto = el.clientWidth < SCHERMO_STRETTO;
    const map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
      gestureHandling: true,           // due dita su smartphone, Ctrl+rotella su PC
      minZoom: 3,
      maxZoom: 10,
      maxBounds: [[18, -30], [62, 55]],
      maxBoundsViscosity: 0.8,
      zoomSnap: 0.25
    });
    // Telefono: mari italiani. Schermo largo: tutto il Mediterraneo con l'Europa intorno
    map.fitBounds(stretto ? ITA_BOUNDS : MED_BOUNDS, { padding: stretto ? [2, 2] : [10, 10] });

    const carto = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png', {
      subdomains: 'abcd', maxZoom: 19, attribution: carto
    }).addTo(map);

    // nomi delle citta' sopra i dati
    map.createPane('labels');
    map.getPane('labels').style.zIndex = 650;
    map.getPane('labels').style.pointerEvents = 'none';
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png', {
      subdomains: 'abcd', maxZoom: 19, pane: 'labels'
    }).addTo(map);

    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution(
      'E.U. <a href="https://marine.copernicus.eu/" target="_blank" rel="noopener">Copernicus Marine Service</a> Information');

    // l'iframe di Google Sites puo' cambiare misura
    if ('ResizeObserver' in window) new ResizeObserver(() => map.invalidateSize()).observe(el);
    return map;
  }

  /* ---------- Legenda ---------- */

  function legend(el, { title, unit, scala, ticks, fmt = x => num(x, Number.isInteger(x) ? 0 : 1) }) {
    const colori = scala.campioni(32);
    const grad = colori.map((c, k) => `${c} ${(k / (colori.length - 1) * 100).toFixed(1)}%`).join(', ');
    const tickHtml = ticks.map(t => {
      const pos = (t - scala.min) / (scala.max - scala.min) * 100;
      const shift = pos <= 0 ? '0' : pos >= 100 ? '-100%' : '-50%';
      return `<span style="left:${pos}%;transform:translateX(${shift})">${fmt(t)}</span>`;
    }).join('');
    el.innerHTML =
      `<div class="lg-label"><span>${title}</span><span>${unit}</span></div>` +
      `<div class="lg-bar" style="background:linear-gradient(90deg, ${grad})"></div>` +
      `<div class="lg-ticks">${tickHtml}</div>`;
  }

  /* ---------- Barra dei giorni (stile Windy) ---------- */

  function barraGiorni(strip, playBtn, giorni, onScegli, passoMs = 3500) {
    const oggi = isoDate(0);
    let attivo = -1, timer = null;

    giorni.forEach((g, i) => {
      const d = new Date(g.data + 'T12:00:00Z');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'day';
      b.innerHTML = `<span class="dw">${g.data === oggi ? 'oggi' : GG[d.getUTCDay()]}</span>` +
                    `<span class="dn">${d.getUTCDate()}</span>`;
      b.addEventListener('click', () => { ferma(); scegli(i); });
      strip.appendChild(b);
    });

    function scegli(i) {
      if (i === attivo) return;
      attivo = i;
      [...strip.children].forEach((b, k) => b.classList.toggle('on', k === i));
      const b = strip.children[i];
      if (b) strip.scrollTo({ left: b.offsetLeft - strip.clientWidth / 2 + b.clientWidth / 2, behavior: 'smooth' });
      onScegli(i);
    }
    function ferma() {
      clearInterval(timer); timer = null;
      playBtn.innerHTML = '&#9654;';
      playBtn.title = 'Avvia la previsione';
    }
    playBtn.addEventListener('click', () => {
      if (timer) { ferma(); return; }
      playBtn.innerHTML = '&#10074;&#10074;';
      playBtn.title = 'Ferma';
      timer = setInterval(() => scegli((attivo + 1) % giorni.length), passoMs);
    });
    return { scegli };
  }

  // Giorni da oggi in avanti presenti nell'indice dei dati
  function giorniDaOggi(indice) {
    const oggi = isoDate(0);
    const g = indice.giorni.filter(x => x.data >= oggi);
    return g.length ? g : indice.giorni.slice(-1);
  }

  /* ---------- Messaggi ---------- */

  function status(el, text) {
    if (!text) { el.classList.remove('show'); return; }
    el.textContent = text;
    el.classList.add('show');
  }

  /* ---------- Struttura comune del widget ---------- */

  // Testata + (barra giorni) + corpo + piede. Restituisce gli elementi utili.
  function scheletro(root, { nome, titolo, sotto, giorni = false, piede, fonte }) {
    const pagina = PV.base + nome + '/';
    const giaQui = location.href.split(/[?#]/)[0] === pagina ||
                   location.href.split(/[?#]/)[0] === pagina + 'index.html';
    root.innerHTML = `
      <div class="widget">
        <header class="w-head">
          <span class="anchor">&#9875;</span>
          <div class="w-title"><h1>${titolo}</h1><div class="sub">${sotto}</div></div>
          <span class="chip" data-el="chip">&hellip;</span>
          ${giaQui ? '' : `<a class="btn-full" href="${pagina}" target="_blank" rel="noopener" title="Apri a schermo intero">&#10530;</a>`}
        </header>
        ${giorni ? `<nav class="days" aria-label="Giorno della previsione">
          <button class="play" data-el="play" type="button" title="Avvia la previsione">&#9654;</button>
          <div class="strip" data-el="strip"></div></nav>` : ''}
        <div class="w-body" data-el="body">
          <div class="status" data-el="status"></div>
        </div>
        <footer class="w-foot">
          <span data-el="piede">${piede}</span>
          <span>Dati: <a href="${fonte}" target="_blank" rel="noopener">Copernicus Marine</a></span>
        </footer>
      </div>`;
    const q = n => root.querySelector(`[data-el="${n}"]`);
    return { chip: q('chip'), play: q('play'), strip: q('strip'), body: q('body'),
             status: q('status'), piede: q('piede') };
  }

  /* ---------- Registro dei widget ---------- */

  const widgets = {};
  function monta(root, nome, base) {
    PV.base = base;
    if (!widgets[nome]) { root.textContent = `Widget "${nome}" sconosciuto.`; return; }
    widgets[nome](root);
  }

  return {
    base: '', widgets, monta, scheletro,
    MESI, MESI_LUNGHI, num, coord, isoDate, prettyDate,
    Scala, SCALA_TEMPERATURA, SCALA_CORRENTE, Griglia,
    json, makeMap, legend, barraGiorni, giorniDaOggi, status,
    SCHERMO_STRETTO
  };
})();
