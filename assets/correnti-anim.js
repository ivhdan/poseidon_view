/* ==========================================================
   Poseidon View — animazione delle correnti stile Windy
   Particelle su canvas che seguono il campo di velocita'
   letto dai file data/correnti/AAAA-MM-GG.json
   ========================================================== */

const Correnti = (() => {

  /* ---------- Scala colori del campo (m/s) ---------- */

  const V_MAX = 0.8;
  const RAMPA = ['#0b2540', '#123a5e', '#1b5e84', '#2a8aa0', '#57b3a8', '#a9c793', '#e6c36a'];

  function hex2rgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // Tabella di 256 colori interpolati lungo la rampa
  const LUT = (() => {
    const stops = RAMPA.map(hex2rgb);
    const out = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 255 * (stops.length - 1);
      const k = Math.min(Math.floor(t), stops.length - 2);
      const f = t - k;
      for (let c = 0; c < 3; c++) {
        out[i * 3 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f;
      }
    }
    return out;
  })();

  /* ---------- Campo di velocita' ---------- */

  class Campo {
    constructor(j) {
      this.data = j.data;
      this.nx = j.nx; this.ny = j.ny;
      this.lon0 = j.lon0; this.lat0 = j.lat0;
      this.dlon = j.dlon; this.dlat = j.dlat;
      const n = j.nx * j.ny;
      this.u = new Float32Array(n);
      this.v = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        this.u[i] = j.u[i] === null ? NaN : j.u[i] / 100;   // cm/s -> m/s
        this.v[i] = j.v[i] === null ? NaN : j.v[i] / 100;
      }
    }

    // Velocita' [u, v] in m/s nel punto, interpolazione bilineare; null su terra
    at(lon, lat) {
      const fx = (lon - this.lon0) / this.dlon;
      const fy = (lat - this.lat0) / this.dlat;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      if (x0 < 0 || y0 < 0 || x0 >= this.nx - 1 || y0 >= this.ny - 1) return null;
      const tx = fx - x0, ty = fy - y0;
      const i00 = y0 * this.nx + x0, i10 = i00 + 1, i01 = i00 + this.nx, i11 = i01 + 1;
      const u = this.u, v = this.v;
      const a = u[i00], b = u[i10], c = u[i01], d = u[i11];
      if (a !== a || b !== b || c !== c || d !== d) return null;   // NaN: costa o terra
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      return [a * w00 + b * w10 + c * w01 + d * w11,
              v[i00] * w00 + v[i10] * w10 + v[i01] * w01 + v[i11] * w11];
    }

    // Valore della cella piu' vicina (per il tocco vicino alla costa)
    nearest(lon, lat) {
      const x = Math.round((lon - this.lon0) / this.dlon);
      const y = Math.round((lat - this.lat0) / this.dlat);
      if (x < 0 || y < 0 || x >= this.nx || y >= this.ny) return null;
      const i = y * this.nx + x;
      return isNaN(this.u[i]) ? null : [this.u[i], this.v[i]];
    }

    bounds() {
      return [[this.lat0 - this.dlat / 2, this.lon0 - this.dlon / 2],
              [this.lat0 + (this.ny - 0.5) * this.dlat, this.lon0 + (this.nx - 0.5) * this.dlon]];
    }

    // Immagine del campo colorato, ricampionata in Mercatore per allinearsi alla mappa
    image() {
      const b = this.bounds();
      const merc = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
      const latFrom = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
      const yS = merc(b[0][0]), yN = merc(b[1][0]);
      const W = this.nx, H = Math.round(this.ny * 1.25);
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(W, H);
      for (let r = 0; r < H; r++) {
        const lat = latFrom(yN - (r + 0.5) / H * (yN - yS));
        const j = Math.round((lat - this.lat0) / this.dlat);
        if (j < 0 || j >= this.ny) continue;
        for (let x = 0; x < W; x++) {
          const i = j * this.nx + x;
          const u = this.u[i];
          if (u !== u) continue;                      // terra: trasparente
          const s = Math.min(Math.hypot(u, this.v[i]) / V_MAX, 1);
          const k = Math.round(s * 255) * 3, p = (r * W + x) * 4;
          img.data[p] = LUT[k]; img.data[p + 1] = LUT[k + 1]; img.data[p + 2] = LUT[k + 2];
          img.data[p + 3] = 235;
        }
      }
      ctx.putImageData(img, 0, 0);
      return cv.toDataURL('image/png');
    }
  }

  /* ---------- Particelle ---------- */

  class Animazione {
    constructor(map) {
      this.map = map;
      this.campo = null;
      this.running = false;
      this.visible = true;

      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      this.maxParticles = reduce ? 0 : (coarse ? 1400 : 3500);
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.speed = 3.0;             // pixel per fotogramma a 1 m/s (velocita' visiva)

      // Pannello dedicato: sopra il campo colorato, sotto nomi delle citta' e popup
      const pane = map.createPane('particles');
      pane.style.zIndex = 450;
      pane.style.pointerEvents = 'none';
      const cv = document.createElement('canvas');
      cv.className = 'particles';
      pane.appendChild(cv);
      this.canvas = cv;
      this.ctx = cv.getContext('2d');

      map.on('movestart zoomstart', () => this.stop(true));
      map.on('moveend zoomend resize', () => this.reset());

      // Ferma tutto quando il widget non si vede (batteria)
      document.addEventListener('visibilitychange', () => {
        this.visible = !document.hidden;
        this.visible ? this.start() : this.stop(false);
      });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(es => {
          this.visible = es[0].isIntersecting;
          this.visible ? this.start() : this.stop(false);
        }).observe(map.getContainer());
      }
    }

    setCampo(campo) {
      this.campo = campo;
      if (!this.particles) this.reset();
      else this.start();
    }

    resize() {
      const s = this.map.getSize();
      this.w = s.x; this.h = s.y;
      this.canvas.width = Math.round(s.x * this.dpr);
      this.canvas.height = Math.round(s.y * this.dpr);
      this.canvas.style.width = s.x + 'px';
      this.canvas.style.height = s.y + 'px';
      // il pannello si sposta con la mappa: il canvas va riallineato all'angolo visibile
      L.DomUtil.setPosition(this.canvas, this.map.containerPointToLayerPoint([0, 0]));
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    reset() {
      this.stop(true);
      this.resize();
      const n = Math.round(Math.min(this.maxParticles, this.w * this.h / 110));
      this.particles = [];
      for (let i = 0; i < n; i++) {
        const p = { x: 0, y: 0, age: 0, life: 0 };
        this.spawn(p, true);
        this.particles.push(p);
      }
      this.start();
    }

    // Nuova posizione casuale sul mare
    spawn(p, firstTime) {
      p.life = 50 + Math.random() * 70;
      p.age = firstTime ? Math.random() * p.life : 0;
      for (let k = 0; k < 15; k++) {
        p.x = Math.random() * this.w;
        p.y = Math.random() * this.h;
        if (this.velAt(p.x, p.y)) return;
      }
      p.age = p.life;               // nessun mare trovato: rinasce al prossimo giro
    }

    velAt(x, y) {
      if (!this.campo) return null;
      const ll = this.map.containerPointToLatLng([x, y]);
      return this.campo.at(ll.lng, ll.lat);
    }

    start() {
      if (this.running || !this.visible || !this.campo || !this.particles || !this.particles.length) return;
      this.running = true;
      const loop = () => {
        if (!this.running) return;
        this.frame();
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }

    stop(clear) {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      if (clear) this.ctx.clearRect(0, 0, this.w || 0, this.h || 0);
    }

    frame() {
      const ctx = this.ctx;

      // Le scie sbiadiscono
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = 'rgba(0,0,0,0.92)';
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalCompositeOperation = 'source-over';

      // Segmenti raggruppati per velocita': 4 tratti, piu' veloce = piu' luminoso
      const gruppi = [[], [], [], []];
      for (const p of this.particles) {
        if (p.age++ > p.life) { this.spawn(p, false); continue; }
        const vel = this.velAt(p.x, p.y);
        if (!vel) { p.age = p.life + 1; continue; }
        const nx = p.x + vel[0] * this.speed;
        const ny = p.y - vel[1] * this.speed;
        const s = Math.hypot(vel[0], vel[1]);
        const g = s < 0.1 ? 0 : s < 0.25 ? 1 : s < 0.45 ? 2 : 3;
        gruppi[g].push(p.x, p.y, nx, ny);
        p.x = nx; p.y = ny;
        if (nx < 0 || ny < 0 || nx > this.w || ny > this.h) p.age = p.life + 1;
      }

      const alfa = [0.35, 0.55, 0.78, 0.98];
      ctx.lineWidth = 1.15;
      ctx.lineCap = 'round';
      for (let g = 0; g < 4; g++) {
        const a = gruppi[g];
        if (!a.length) continue;
        ctx.strokeStyle = `rgba(245, 240, 228, ${alfa[g]})`;
        ctx.beginPath();
        for (let i = 0; i < a.length; i += 4) {
          ctx.moveTo(a[i], a[i + 1]);
          ctx.lineTo(a[i + 2], a[i + 3]);
        }
        ctx.stroke();
      }
    }
  }

  return { Campo, Animazione, RAMPA, V_MAX };
})();
