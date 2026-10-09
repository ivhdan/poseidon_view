/* ==========================================================
   Poseidon View — grafico della temperatura media mensile
   del Mediterraneo dal 2000. Si scorre con un dito (o
   trascinando col mouse) per vedere gli anni passati.
   ========================================================== */

(() => {

  const FONTE = 'https://data.marine.copernicus.eu/product/MEDSEA_MULTIYEAR_PHY_006_004';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const ASSE = 40;          // larghezza colonna dell'asse Y (px)
  const BASSO = 26;         // spazio per le etichette degli anni (px)
  const ALTO = 26;          // spazio sopra la curva per le etichette (px)

  function svg(tag, attr = {}, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attr) e.setAttribute(k, attr[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // Retta dei minimi quadrati sulle medie annue -> gradi per decennio
  function tendenza(annue) {
    const p = annue.filter(a => a.media !== null);
    if (p.length < 5) return null;
    const n = p.length, mx = p.reduce((s, a) => s + a.anno, 0) / n,
          my = p.reduce((s, a) => s + a.media, 0) / n;
    let num = 0, den = 0;
    for (const a of p) { num += (a.anno - mx) * (a.media - my); den += (a.anno - mx) ** 2; }
    return { perDecennio: num / den * 10, da: p[0].anno, a: p[n - 1].anno };
  }

  PV.widgets.grafico = async root => {
    const el = PV.scheletro(root, {
      nome: 'grafico',
      titolo: 'Il Mediterraneo si scalda',
      sotto: 'Media mensile in superficie',
      piede: '<span class="lg-line"></span> mensile &nbsp; <span class="lg-dash"></span> media annua',
      fonte: FONTE
    });
    el.body.classList.add('chart-body');

    let dati;
    PV.status(el.status, 'Carico la serie storica…');
    try {
      dati = await PV.json(PV.base + 'data/trend.json');
    } catch (e) {
      PV.status(el.status, 'Serie storica in preparazione, riprova più tardi.');
      return;
    }
    PV.status(el.status, '');

    /* ---- Dati ---- */

    const [a0, m0] = dati.inizio.split('-').map(Number);
    const mesi = dati.valori.map((v, k) => ({
      k, v, anno: a0 + Math.floor((m0 - 1 + k) / 12), mese: (m0 - 1 + k) % 12
    }));
    const validi = mesi.filter(m => m.v !== null);
    const ultimo = validi[validi.length - 1];

    // medie annue solo per gli anni completi
    const annue = [];
    for (let y = a0; y <= ultimo.anno; y++) {
      const m = mesi.filter(x => x.anno === y && x.v !== null);
      annue.push({ anno: y, media: m.length === 12 ? m.reduce((s, x) => s + x.v, 0) / 12 : null });
    }
    const record = validi.reduce((a, b) => (b.v > a.v ? b : a));
    const trend = tendenza(annue);

    const chipLungo = `${PV.MESI[ultimo.mese]} ${ultimo.anno} · ${PV.num(ultimo.v)} °C`;
    el.chip.title = `Ultimo mese: ${PV.MESI_LUNGHI[ultimo.mese]} ${ultimo.anno}`;

    /* ---- Struttura: asse Y fisso + area scorrevole ---- */

    const wrap = document.createElement('div');
    wrap.className = 'chart';
    wrap.innerHTML = `
      <div class="chart-note">
        <span>${trend ? `Tendenza ${trend.da}&ndash;${trend.a}:
          <b>${trend.perDecennio >= 0 ? '+' : '&minus;'}${PV.num(Math.abs(trend.perDecennio), 2)} &deg;C</b> ogni 10 anni` : ''}</span>
        <span class="chart-hint">&#8592; scorri</span>
      </div>
      <div class="chart-grid">
        <svg class="chart-axis" aria-hidden="true"></svg>
        <div class="chart-scroll" tabindex="0" aria-label="Grafico scorrevole: temperature mensili dal ${dati.inizio.slice(0, 4)}">
          <svg class="chart-svg" role="img"></svg>
          <div class="chart-tip" hidden></div>
        </div>
        <button class="chart-nav prev" type="button" title="Anni precedenti">&#8249;</button>
        <button class="chart-nav next" type="button" title="Anni successivi">&#8250;</button>
      </div>`;
    el.body.appendChild(wrap);

    const axis = wrap.querySelector('.chart-axis');
    const scroller = wrap.querySelector('.chart-scroll');
    const plot = wrap.querySelector('.chart-svg');
    const tip = wrap.querySelector('.chart-tip');
    const hint = wrap.querySelector('.chart-hint');

    // scala verticale fissa per tutta la serie: confronto onesto tra anni
    const vMin = Math.floor(Math.min(...validi.map(m => m.v)) - 0.5);
    const vMax = Math.ceil(Math.max(...validi.map(m => m.v)) + 0.5);
    let pxMese = 10, H = 300, Wtot = 0;
    const X = k => 8 + k * pxMese + pxMese / 2;
    const Y = v => ALTO + (vMax - v) / (vMax - vMin) * (H - ALTO - BASSO);

    function disegna() {
      const box = scroller.getBoundingClientRect();
      H = Math.max(180, Math.round(box.height));
      const stretto = root.clientWidth < PV.SCHERMO_STRETTO;
      el.chip.textContent = stretto ? `${PV.num(ultimo.v)} °C` : chipLungo;
      const anniVisibili = stretto ? 3 : 8;
      pxMese = Math.max(7, (box.width - 16) / (anniVisibili * 12));
      Wtot = Math.round(16 + mesi.length * pxMese);

      /* asse Y */
      axis.innerHTML = '';
      axis.setAttribute('viewBox', `0 0 ${ASSE} ${H}`);
      axis.setAttribute('height', H);
      const passo = vMax - vMin > 10 ? 4 : 2;
      for (let v = Math.ceil(vMin / passo) * passo; v <= vMax; v += passo) {
        const t = svg('text', { x: ASSE - 6, y: Y(v) + 4, class: 'ax-t', 'text-anchor': 'end' }, axis);
        t.textContent = v + '°';
      }

      /* area del grafico */
      plot.innerHTML = '';
      plot.setAttribute('width', Wtot);
      plot.setAttribute('height', H);
      plot.setAttribute('viewBox', `0 0 ${Wtot} ${H}`);
      plot.setAttribute('aria-label', `Temperatura media mensile del Mediterraneo da ${dati.inizio} a ` +
        `${ultimo.anno}-${String(ultimo.mese + 1).padStart(2, '0')}. Record: ${PV.MESI_LUNGHI[record.mese]} ` +
        `${record.anno}, ${PV.num(record.v)} gradi.`);

      // gradiente verticale: la linea prende il colore della sua temperatura
      const defs = svg('defs', {}, plot);
      const g = svg('linearGradient', { id: 'pv-grad', gradientUnits: 'userSpaceOnUse',
                                        x1: 0, x2: 0, y1: Y(vMin), y2: Y(vMax) }, defs);
      for (let i = 0; i <= 20; i++) {
        const v = vMin + (vMax - vMin) * i / 20;
        svg('stop', { offset: i / 20, 'stop-color': PV.SCALA_TEMPERATURA.css(v) }, g);
      }

      // fasce alterne per gli anni, griglia, etichette degli anni
      for (let y = a0; y <= ultimo.anno; y++) {
        const k0 = Math.max(0, (y - a0) * 12 - (m0 - 1));
        const k1 = Math.min(mesi.length, (y - a0 + 1) * 12 - (m0 - 1));
        const x0 = X(k0) - pxMese / 2, x1 = X(k1 - 1) + pxMese / 2;
        if ((y - a0) % 2) svg('rect', { x: x0, y: ALTO, width: x1 - x0, height: H - ALTO - BASSO, class: 'yr-band' }, plot);
        svg('line', { x1: x0, x2: x0, y1: ALTO, y2: H - BASSO + 4, class: 'yr-sep' }, plot);
        const t = svg('text', { x: (x0 + x1) / 2, y: H - 8, class: 'yr-t', 'text-anchor': 'middle' }, plot);
        t.textContent = y;
      }
      for (let v = Math.ceil(vMin / passo) * passo; v <= vMax; v += passo) {
        svg('line', { x1: 0, x2: Wtot, y1: Y(v), y2: Y(v), class: 'grid' }, plot);
      }

      // media annua (tratteggiata, ottone)
      let dA = '';
      annue.forEach(a => {
        if (a.media === null) return;
        const k = (a.anno - a0) * 12 - (m0 - 1);
        const xa = X(Math.max(0, k)) - pxMese / 2, xb = X(Math.min(mesi.length - 1, k + 11)) + pxMese / 2;
        dA += `M${xa.toFixed(1)},${Y(a.media).toFixed(1)}H${xb.toFixed(1)}`;
      });
      svg('path', { d: dA, class: 'annual' }, plot);

      // linea mensile
      let d = '', su = false;
      mesi.forEach(m => {
        if (m.v === null) { su = false; return; }
        d += `${su ? 'L' : 'M'}${X(m.k).toFixed(1)},${Y(m.v).toFixed(1)}`;
        su = true;
      });
      svg('path', { d, class: 'monthly', stroke: 'url(#pv-grad)' }, plot);

      // record
      const rx = X(record.k), ry = Y(record.v);
      svg('circle', { cx: rx, cy: ry, r: 4.5, class: 'rec-dot' }, plot);
      const rt = svg('text', { x: rx, y: ry - 10, class: 'rec-t', 'text-anchor': 'middle' }, plot);
      rt.textContent = `record ${PV.num(record.v)}°`;

      // segno di selezione (spostato al tocco)
      svg('line', { class: 'cross', y1: ALTO, y2: H - BASSO, x1: -10, x2: -10 }, plot);
      svg('circle', { class: 'cross-dot', r: 5, cx: -10, cy: -10 }, plot);
    }

    /* ---- Selezione di un mese: tocco o mouse ---- */

    function seleziona(clientX) {
      const r = plot.getBoundingClientRect();
      const k = Math.round((clientX - r.left - 8 - pxMese / 2) / pxMese);
      const m = mesi[Math.max(0, Math.min(mesi.length - 1, k))];
      if (!m || m.v === null) return;
      const x = X(m.k), y = Y(m.v);
      const cross = plot.querySelector('.cross'), dot = plot.querySelector('.cross-dot');
      cross.setAttribute('x1', x); cross.setAttribute('x2', x);
      dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      dot.setAttribute('fill', PV.SCALA_TEMPERATURA.css(m.v));
      const media = mesi.filter(z => z.mese === m.mese && z.v !== null);
      const clim = media.reduce((s, z) => s + z.v, 0) / media.length;
      const diff = m.v - clim;
      tip.innerHTML = `<small>${PV.MESI_LUNGHI[m.mese]} ${m.anno}</small><br><b>${PV.num(m.v)} &deg;C</b>` +
        `<br><small>${diff >= 0 ? '+' : '&minus;'}${PV.num(Math.abs(diff))}&deg; sulla media di ${PV.MESI_LUNGHI[m.mese]}</small>`;
      tip.hidden = false;
      const tw = tip.offsetWidth;
      let left = x - tw / 2;
      left = Math.max(scroller.scrollLeft + 4, Math.min(left, scroller.scrollLeft + scroller.clientWidth - tw - 4));
      tip.style.left = left + 'px';
      tip.style.top = Math.max(2, y - tip.offsetHeight - 14) + 'px';
      if (y - tip.offsetHeight - 14 < 2) tip.style.top = (y + 14) + 'px';
    }

    // tocco breve = selezione; trascinamento orizzontale = scorrimento nativo
    plot.addEventListener('click', e => seleziona(e.clientX));
    plot.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && !trascina) seleziona(e.clientX); });
    plot.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') tip.hidden = true; });

    // mouse: trascinare per scorrere, come con il dito
    let trascina = null;
    scroller.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse') return;
      trascina = { x: e.clientX, s: scroller.scrollLeft, mosso: false };
    });
    window.addEventListener('pointermove', e => {
      if (!trascina) return;
      const dx = e.clientX - trascina.x;
      if (Math.abs(dx) > 3) { trascina.mosso = true; scroller.classList.add('drag'); tip.hidden = true; }
      scroller.scrollLeft = trascina.s - dx;
    });
    window.addEventListener('pointerup', () => {
      if (trascina && trascina.mosso) scroller.addEventListener('click', e => e.stopPropagation(), { capture: true, once: true });
      trascina = null; scroller.classList.remove('drag');
    });

    // frecce (PC) e tastiera
    const salto = () => scroller.clientWidth * 0.8;
    wrap.querySelector('.prev').addEventListener('click', () => scroller.scrollBy({ left: -salto(), behavior: 'smooth' }));
    wrap.querySelector('.next').addEventListener('click', () => scroller.scrollBy({ left: salto(), behavior: 'smooth' }));
    scroller.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') scroller.scrollBy({ left: -pxMese * 12, behavior: 'smooth' });
      if (e.key === 'ArrowRight') scroller.scrollBy({ left: pxMese * 12, behavior: 'smooth' });
    });
    scroller.addEventListener('scroll', () => {
      hint.classList.toggle('off', scroller.scrollLeft < scroller.scrollWidth - scroller.clientWidth - 40);
    }, { passive: true });

    /* ---- Primo disegno: si parte dagli anni piu' recenti ---- */

    function ridisegna() {
      tip.hidden = true;
      const finale = scroller.scrollLeft >= scroller.scrollWidth - scroller.clientWidth - 2;
      const quota = scroller.scrollWidth ? scroller.scrollLeft / scroller.scrollWidth : 1;
      disegna();
      scroller.scrollLeft = finale ? scroller.scrollWidth : quota * scroller.scrollWidth;
    }
    disegna();
    scroller.scrollLeft = scroller.scrollWidth;
    if ('ResizeObserver' in window) {
      let w = root.clientWidth, h = root.clientHeight;
      new ResizeObserver(() => {
        if (root.clientWidth === w && root.clientHeight === h) return;
        w = root.clientWidth; h = root.clientHeight;
        ridisegna();
      }).observe(root);
    }
  };

})();
