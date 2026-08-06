/* ============================================================================
   Regel-Quiz.

   Fragen stehen in assets/data/quiz.json, getrennt nach Sportart. Weitere
   Fragen einfach an die Liste anhaengen — der Code zaehlt selbst nach.
   Nach jeder Antwort sofort Rueckmeldung samt Erklaerung, am Ende die Bilanz.
   ========================================================================== */
(function () {
  'use strict';
  var wurzel = document.querySelector('[data-quiz]');
  if (!wurzel) return;

  var lang = (document.documentElement.lang || 'de').slice(0, 2);
  var T = {
    de: { frage:'Frage', von:'von', richtig:'Richtig', falsch:'Leider nicht',
          weiter:'Weiter', fertig:'Auswertung', nochmal:'Nochmal',
          bilanz:'Du hast {a} von {b} richtig.',
          lob:['Da ist noch Luft — die Erklärungen oben helfen.','Solide Grundlage.','Stark. Das sitzt.','Perfekt. Du kannst schiedsrichtern.'],
          fehler:'Die Fragen lassen sich gerade nicht laden.', start:'Quiz starten' },
    en: { frage:'Question', von:'of', richtig:'Correct', falsch:'Not quite',
          weiter:'Next', fertig:'Result', nochmal:'Again',
          bilanz:'You got {a} out of {b} right.',
          lob:['Room to grow — the explanations above help.','Solid basics.','Strong. That sticks.','Perfect. You could referee.'],
          fehler:'The questions cannot be loaded right now.', start:'Start the quiz' },
    es: { frage:'Pregunta', von:'de', richtig:'Correcto', falsch:'No exactamente',
          weiter:'Siguiente', fertig:'Resultado', nochmal:'Otra vez',
          bilanz:'Has acertado {a} de {b}.',
          lob:['Queda margen; las explicaciones de arriba ayudan.','Buena base.','Muy bien. Lo tienes.','Perfecto. Podrías arbitrar.'],
          fehler:'Las preguntas no se pueden cargar ahora.', start:'Empezar el cuestionario' }
  }[lang] || null;
  if (!T) T = { frage:'', von:'', richtig:'', falsch:'', weiter:'', fertig:'', nochmal:'', bilanz:'{a}/{b}', lob:['','','',''], fehler:'', start:'' };

  var bereich = wurzel.querySelector('[data-quiz-bereich]');
  var tabs    = wurzel.querySelectorAll('[data-quiz-sport]');
  var daten   = null, fragen = [], i = 0, punkte = 0, beantwortet = false;

  function sicher(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; });
  }

  function starten(sport) {
    fragen = (daten[sport] || []).slice();
    i = 0; punkte = 0;
    Array.prototype.forEach.call(tabs, function (t) {
      t.setAttribute('aria-pressed', t.getAttribute('data-quiz-sport') === sport ? 'true' : 'false');
    });
    zeichnen();
  }

  function zeichnen() {
    if (i >= fragen.length) return auswerten();
    beantwortet = false;
    var f = fragen[i];
    bereich.innerHTML =
      '<p class="qz__zaehler">' + sicher(T.frage) + ' ' + (i + 1) + ' ' + sicher(T.von) + ' ' + fragen.length + '</p>' +
      '<div class="qz__balken"><span style="width:' + Math.round(i / fragen.length * 100) + '%"></span></div>' +
      '<h3 class="qz__frage">' + sicher(f.frage) + '</h3>' +
      '<ul class="qz__antworten">' + f.antworten.map(function (a, n) {
        return '<li><button class="qz__antwort" type="button" data-antwort="' + n + '">' +
               sicher(a) + '</button></li>';
      }).join('') + '</ul>' +
      '<div class="qz__feedback" hidden></div>';
  }

  function auswerten() {
    var anteil = punkte / fragen.length;
    var lob = T.lob[anteil === 1 ? 3 : (anteil >= 0.7 ? 2 : (anteil >= 0.4 ? 1 : 0))];
    bereich.innerHTML =
      '<p class="qz__zaehler">' + sicher(T.fertig) + '</p>' +
      '<p class="qz__ergebnis">' + punkte + '<small>/' + fragen.length + '</small></p>' +
      '<p class="qz__bilanz">' + sicher(T.bilanz.replace('{a}', punkte).replace('{b}', fragen.length)) + '</p>' +
      '<p class="qz__lob">' + sicher(lob) + '</p>' +
      '<button class="btn btn--clay btn--sm" type="button" data-quiz-neu>' + sicher(T.nochmal) + '</button>';
  }

  bereich.addEventListener('click', function (e) {
    var a = e.target.closest('[data-antwort]');
    if (a && !beantwortet) {
      beantwortet = true;
      var gewaehlt = Number(a.getAttribute('data-antwort'));
      var f = fragen[i];
      var ok = gewaehlt === f.richtig;
      if (ok) punkte++;
      Array.prototype.forEach.call(bereich.querySelectorAll('[data-antwort]'), function (b) {
        var n = Number(b.getAttribute('data-antwort'));
        b.disabled = true;
        if (n === f.richtig) b.classList.add('qz__antwort--richtig');
        else if (n === gewaehlt) b.classList.add('qz__antwort--falsch');
      });
      var fb = bereich.querySelector('.qz__feedback');
      fb.className = 'qz__feedback qz__feedback--' + (ok ? 'ok' : 'weg');
      fb.innerHTML = '<b>' + sicher(ok ? T.richtig : T.falsch) + '</b>' +
        '<p>' + sicher(f.erklaerung) + '</p>' +
        '<button class="btn btn--clay btn--sm" type="button" data-weiter>' +
        sicher(i + 1 >= fragen.length ? T.fertig : T.weiter) + '</button>';
      fb.hidden = false;
      return;
    }
    if (e.target.closest('[data-weiter]')) { i++; zeichnen(); return; }
    if (e.target.closest('[data-quiz-neu]')) { starten(document.querySelector('[data-quiz-sport][aria-pressed="true"]').getAttribute('data-quiz-sport')); }
  });

  Array.prototype.forEach.call(tabs, function (t) {
    t.addEventListener('click', function () { starten(t.getAttribute('data-quiz-sport')); });
  });

  fetch(wurzel.getAttribute('data-quelle'))
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) { daten = d; starten('tennis'); })
    .catch(function () { bereich.innerHTML = '<p class="qz__zaehler">' + sicher(T.fehler) + '</p>'; });
})();
