/* ==========================================================
   Poseidon View — animazione delle correnti stile Windy
   Migliaia di particelle su canvas seguono il campo di velocita'.
   Il campo deve offrire vel(lon, lat) -> [u, v] in m/s oppure null.
   ========================================================== */

const Animazione = (() => {

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
      return this.campo.vel(ll.lng, ll.lat);
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

  return Animazione;
})();
