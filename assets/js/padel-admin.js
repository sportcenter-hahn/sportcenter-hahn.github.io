/* ============================================================================
   Verwaltung der Padel-Spiele.

   Anmeldung über Supabase Auth. Das Konto legt ihr einmal im Dashboard an —
   auf der Website gibt es bewusst kein Registrierungsformular. Wer anlegen
   darf, steht zusätzlich in der Tabelle padel_admins; ein bloßes Konto reicht
   also nicht (siehe supabase/schema-padel.sql).

   Diese Seite ist auf noindex gesetzt und aus der Navigation herausgehalten.
   ========================================================================== */
(function () {
  'use strict';

  var wurzel = document.querySelector('[data-padeladmin]');
  if (!wurzel) return;

  var PLAETZE = 4;
  var URL_SB = wurzel.getAttribute('data-sb-url') || '';
  var KEY_SB = wurzel.getAttribute('data-sb-key') || '';
  var LIB    = wurzel.getAttribute('data-sb-lib');

  var anmeldung = wurzel.querySelector('[data-pa-anmeldung]');
  var bereich   = wurzel.querySelector('[data-pa-bereich]');
  var formLogin = wurzel.querySelector('[data-pa-login]');
  var formNeu   = wurzel.querySelector('[data-pa-neu]');
  var liste     = wurzel.querySelector('[data-pa-liste]');
  var status    = wurzel.querySelector('[data-pa-status]');
  var abmelden  = wurzel.querySelector('[data-pa-abmelden]');
  var wer       = wurzel.querySelector('[data-pa-wer]');

  var sb = null;

  function melden(text, art) {
    status.textContent = text || '';
    status.className = 'pf__status' + (art ? ' pf__status--' + art : '');
    status.hidden = !text;
  }
  function sicher(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; });
  }
  function fmt(iso) {
    return new Date(iso).toLocaleString('de-DE',
      { timeZone:'Europe/Berlin', weekday:'short', day:'2-digit', month:'2-digit',
        hour:'2-digit', minute:'2-digit' });
  }

  /* ------------------------------------------------------------- Übersicht */
  function laden() {
    return sb.from('padel_matches')
      .select('id,beginn,dauer_min,court,info,abgesagt,padel_zusagen(id,vorname)')
      .order('beginn', { ascending: true })
      .then(function (r) {
        if (r.error) throw r.error;
        return sb.from('padel_zusage_privat').select('zusage_id,kontakt')
          .then(function (k) {
            var kontakte = {};
            (k.data || []).forEach(function (x) { kontakte[x.zusage_id] = x.kontakt; });
            zeichnen(r.data || [], kontakte);
          });
      })
      .catch(function () { melden('Die Spiele lassen sich gerade nicht laden.', 'fehler'); });
  }

  function zeichnen(spiele, kontakte) {
    if (!spiele.length) {
      liste.innerHTML = '<li class="pr__leer">Noch keine Spiele angelegt.</li>';
      return;
    }
    liste.innerHTML = spiele.map(function (s) {
      var zusagen = s.padel_zusagen || [];
      var vorbei = new Date(s.beginn) < new Date();
      var z = vorbei ? 'vorbei' : (zusagen.length >= PLAETZE ? 'voll' : 'offen');
      var reihen = zusagen.length
        ? '<ul class="pa__spieler">' + zusagen.map(function (t) {
            return '<li><b>' + sicher(t.vorname) + '</b><span>' +
                   sicher(kontakte[t.id] || '—') + '</span></li>'; }).join('') + '</ul>'
        : '<p class="pa__keine">Noch keine Zusagen.</p>';
      return '<li class="pr__karte pr__karte--' + z + '">' +
        '<div class="pr__kopf">' +
          '<span class="pr__wann"><b>' + sicher(fmt(s.beginn)) + '</b>' +
            sicher(s.dauer_min + ' Minuten') + '</span>' +
          '<span class="pr__marke pr__marke--' + z + '">' +
            (vorbei ? 'Vorbei' : (zusagen.length >= PLAETZE ? 'Voll — findet statt' : 'Noch Plätze frei')) +
          '</span>' +
        '</div>' +
        '<p class="pr__ort">Geretsried' + (s.court ? ' · Court ' + sicher(s.court) : '') + '</p>' +
        (s.info ? '<p class="pr__info">' + sicher(s.info) + '</p>' : '') +
        '<p class="pr__zahl">' + zusagen.length + ' / ' + PLAETZE + ' Spielern</p>' +
        reihen +
        (vorbei ? '' : '<div class="pr__aktion"><button class="txtlink pr__raus" type="button" ' +
          'data-absagen="' + sicher(s.id) + '">Spiel absagen</button></div>') +
        '</li>';
    }).join('');
  }

  /* -------------------------------------------------------------- Bedienung */
  function verdrahten() {
    formNeu.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = new FormData(formNeu);
      var beginn = new Date(f.get('datum') + 'T' + f.get('zeit') + ':00');
      if (isNaN(beginn.getTime())) { melden('Bitte Datum und Uhrzeit prüfen.', 'fehler'); return; }
      var btn = formNeu.querySelector('button[type="submit"]');
      btn.disabled = true;
      sb.from('padel_matches').insert({
        beginn: beginn.toISOString(),
        dauer_min: Number(f.get('dauer')),
        court: (f.get('court') || '').trim() || null,
        info: (f.get('info') || '').trim() || null
      }).then(function (r) {
        btn.disabled = false;
        if (r.error) {
          melden('Anlegen nicht möglich. Ist dieses Konto in padel_admins eingetragen?', 'fehler');
          return;
        }
        formNeu.reset();
        melden('Spiel angelegt. Es erscheint jetzt im Roulette.', 'ok');
        laden();
      });
    });

    liste.addEventListener('click', function (e) {
      var a = e.target.closest('[data-absagen]');
      if (!a) return;
      if (!window.confirm('Dieses Spiel wirklich absagen? Es verschwindet dann für alle.')) return;
      sb.from('padel_matches').update({ abgesagt: true })
        .eq('id', a.getAttribute('data-absagen'))
        .then(function (r) {
          if (r.error) return melden('Absagen nicht möglich.', 'fehler');
          melden('Spiel abgesagt.', 'ok');
          laden();
        });
    });

    abmelden.addEventListener('click', function () {
      sb.auth.signOut().then(function () { window.location.reload(); });
    });
  }

  function angemeldet(user) {
    anmeldung.hidden = true;
    bereich.hidden = false;
    wer.textContent = user && user.email ? user.email : '';
    verdrahten();
    laden();
  }

  function starten() {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(URL_SB) || KEY_SB.length < 40) {
      melden('Supabase ist noch nicht eingerichtet — siehe README, Abschnitt 27.', 'fehler');
      return;
    }
    var s = document.createElement('script');
    s.src = LIB;
    s.onload = function () {
      sb = window.supabase.createClient(URL_SB, KEY_SB);
      sb.auth.getSession().then(function (r) {
        if (r.data && r.data.session) { angemeldet(r.data.session.user); }
        else { anmeldung.hidden = false; }
      });

      formLogin.addEventListener('submit', function (e) {
        e.preventDefault();
        var f = new FormData(formLogin);
        var btn = formLogin.querySelector('button[type="submit"]');
        btn.disabled = true;
        sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('passwort') })
          .then(function (r) {
            btn.disabled = false;
            if (r.error) { melden('Anmeldung fehlgeschlagen. E-Mail oder Passwort stimmen nicht.', 'fehler'); return; }
            melden('');
            angemeldet(r.data.user);
          });
      });
    };
    s.onerror = function () { melden('Die Verbindung zu Supabase kam nicht zustande.', 'fehler'); };
    document.head.appendChild(s);
  }

  starten();
})();
