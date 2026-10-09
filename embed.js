/* ==========================================================
   Poseidon View — caricatore dei widget per Google Sites

   Da incollare in Google Sites (Inserisci > Incorpora > Incorpora codice):

     <script src="https://ivhdan.github.io/poseidon_view/embed.js" data-widget="correnti"></script>

   data-widget:  correnti | temperatura | grafico
   data-altezza: facoltativo (es. "460px"); senza, il widget riempie il riquadro.

   Il caricatore crea il contenitore al posto dello script, carica stili e
   librerie da GitHub Pages e monta il widget. Tutto il codice vive su GitHub:
   aggiornando il repo si aggiornano anche i widget gia' incorporati.
   ========================================================== */

(function () {
  var VERSIONE = '5';     // cambiarla forza i browser a ricaricare stili e script

  var script = document.currentScript;
  if (!script) return;
  var BASE = script.src.replace(/embed\.js(\?.*)?$/, '');
  var widget = script.getAttribute('data-widget') || 'correnti';
  var altezza = script.getAttribute('data-altezza');

  var root = document.createElement('div');
  root.className = 'pv-root';
  script.parentNode.insertBefore(root, script);
  if (altezza) root.style.height = altezza;
  else document.documentElement.classList.add('pv-pagina');

  // Ogni risorsa si carica una sola volta, anche con piu' widget nella stessa pagina
  var G = window.__poseidon = window.__poseidon || {};

  function css(href) {
    if (G[href]) return;
    G[href] = true;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
  }

  function js(src) {
    if (!G[src]) {
      G[src] = new Promise(function (ok, ko) {
        var s = document.createElement('script');
        s.src = src;
        s.onload = ok;
        s.onerror = function () { ko(new Error('Impossibile caricare ' + src)); };
        document.head.appendChild(s);
      });
    }
    return G[src];
  }

  var v = '?v=' + VERSIONE;
  var mappa = widget !== 'grafico';

  var meta = document.querySelector('meta[name=viewport]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1';
    document.head.appendChild(meta);
  }

  css('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Crimson+Pro:wght@400;600&display=swap');
  if (mappa) {
    css('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
    css('https://cdn.jsdelivr.net/npm/leaflet-gesture-handling@1.2.2/dist/leaflet-gesture-handling.min.css');
  }
  css(BASE + 'assets/poseidon.css' + v);

  var sequenza = mappa
    ? ['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
       'https://cdn.jsdelivr.net/npm/leaflet-gesture-handling@1.2.2/dist/leaflet-gesture-handling.min.js',
       BASE + 'assets/poseidon.js' + v,
       BASE + 'assets/animazione.js' + v,
       BASE + 'assets/w-mappe.js' + v]
    : [BASE + 'assets/poseidon.js' + v,
       BASE + 'assets/w-grafico.js' + v];

  var catena = Promise.resolve();
  sequenza.forEach(function (src) {
    catena = catena.then(function () { return js(src); });
  });

  catena
    .then(function () { PV.monta(root, widget, BASE); })
    .catch(function (e) {
      root.style.cssText += ';display:flex;align-items:center;justify-content:center;' +
        'background:#0a1e33;color:#f0e8d4;font:14px Georgia,serif;text-align:center;padding:16px';
      root.textContent = 'Widget del mare momentaneamente non disponibile.';
      if (window.console) console.warn('[Poseidon View]', e);
    });
})();
