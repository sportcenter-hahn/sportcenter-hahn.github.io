/* ============================================================
   Sportcenter Hahn — Formular-Handler (Kontakt + Mitgliedschaft)
   Version 1.1

   Wie es funktioniert
   ───────────────────
   Beide Seiten binden dieses Skript ein. Es sucht nach einem
   Element mit [data-forms], liest daraus die Supabase-Zugangsdaten
   und hängt sich an #kontaktformular bzw. #antragsformular.

   Die Supabase-Bibliothek (assets/js/vendor/supabase.js) wird
   lazy geladen — erst wenn die Seite fertig ist. Da sie schon
   bei der Mitspielerbörse enthalten ist, entsteht kein zusätzlicher
   Netzwerk-Request auf Seiten, die das Board einbinden.

   HTML-Einbindung (einmalig je Seite, z. B. in kontakt.html):
   ─────────────────────────────────────────────────────────────
   <form id="kontaktformular" class="rv" novalidate
         data-forms
         data-sb-url="https://DEIN-PROJEKT.supabase.co"
         data-sb-key="dein-anon-public-key"
         data-sb-lib="assets/js/vendor/supabase.js">
     …
   </form>
   <link rel="stylesheet" href="assets/css/forms-feedback.css">
   <script src="assets/js/forms.js" defer></script>
   ============================================================ */

(function () {
  'use strict';

  /* ── 0. Konfiguration ──────────────────────────────────── */
  var wurzel = document.querySelector('[data-forms]');
  if (!wurzel) return;

  var SB_URL = (wurzel.getAttribute('data-sb-url') || '').trim();
  var SB_KEY = (wurzel.getAttribute('data-sb-key') || '').trim();
  var SB_LIB = wurzel.getAttribute('data-sb-lib') || 'assets/js/vendor/supabase.js';

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SB_URL) || SB_KEY.length < 40) {
    console.warn('[forms.js] Supabase nicht konfiguriert — Formulare im Offline-Modus.');
    return;
  }

  /* ── 1. Supabase-Bibliothek lazy laden ─────────────────── */
  var sb        = null;
  var libReady  = false;
  var callbacks = [];

  function mitClient(fn) {
    if (libReady) { fn(sb); return; }
    callbacks.push(fn);
    if (document.querySelector('script[data-sbloading]')) return; // läuft schon

    // Bibliothek vielleicht schon global verfügbar (Mitspielerbörse-Seiten)
    if (window.supabase && window.supabase.createClient) {
      fertig();
      return;
    }

    var s = document.createElement('script');
    s.setAttribute('data-sbloading', '1');
    s.src = SB_LIB;
    s.onload  = fertig;
    s.onerror = function () {
      console.error('[forms.js] Supabase-Bibliothek konnte nicht geladen werden.');
      callbacks = [];
    };
    document.head.appendChild(s);
  }

  function fertig() {
    try {
      sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
      libReady = true;
      callbacks.forEach(function (fn) { fn(sb); });
      callbacks = [];
    } catch (e) {
      console.error('[forms.js] Supabase-Client-Fehler:', e);
    }
  }

  // Frühzeitig vorladen, sobald das DOM bereit ist
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { mitClient(function () {}); });
  } else {
    mitClient(function () {});
  }

  /* ── 2. Hilfsfunktionen ─────────────────────────────────── */

  function sprache() {
    return (document.documentElement.lang || 'de').slice(0, 2);
  }

  /** Fügt nach dem Formular eine Erfolgs- oder Fehlermeldung ein */
  function zeigeMeldung(form, typ, html) {
    var alt = form.parentNode.querySelector('.form-feedback');
    if (alt) alt.remove();
    var div = document.createElement('div');
    div.className = 'form-feedback form-feedback--' + typ;
    div.setAttribute('role', typ === 'fehler' ? 'alert' : 'status');
    div.setAttribute('aria-live', 'assertive');
    div.innerHTML = html;
    form.after(div);
    div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /** Markiert ein Eingabefeld als fehlerhaft */
  function feldFehler(el, text) {
    var wrap = el.closest('.field') || el.parentNode;
    wrap.classList.add('field--fehler');
    var vorh = wrap.querySelector('.field__error');
    if (vorh) { vorh.textContent = text; return; }
    var span = document.createElement('span');
    span.className  = 'field__error';
    span.textContent = text;
    el.after(span);
  }

  /** Entfernt die Fehlerkennzeichnung eines Felds */
  function feldOk(el) {
    var wrap = el.closest('.field') || el.parentNode;
    wrap.classList.remove('field--fehler');
    var vorh = wrap.querySelector('.field__error');
    if (vorh) vorh.remove();
  }

  /** Button während des Sendens sperren / entsperren */
  function setBtnLaden(btn, an) {
    btn.disabled = an;
    if (an) {
      btn.dataset.origText = btn.textContent;
      btn.textContent = 'Wird gesendet …';
    } else {
      btn.textContent = btn.dataset.origText || btn.textContent;
    }
  }

  /** Gibt einen sicheren HTML-String zurück (XSS-Schutz) */
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }


  /* ── 3. Kontaktformular (#kontaktformular) ─────────────── */
  var kForm = document.getElementById('kontaktformular');
  if (kForm) {
    kForm.setAttribute('novalidate', '');
    var kGesendet = false;

    var kF = {
      name:     kForm.querySelector('[name="name"]'),
      email:    kForm.querySelector('[name="email"]'),
      telefon:  kForm.querySelector('[name="telefon"]'),
      thema:    kForm.querySelector('[name="thema"]'),
      nachricht:kForm.querySelector('[name="nachricht"]'),
      consent:  kForm.querySelector('[name="consent"]'),
      hp:       kForm.querySelector('[name="website"]')
    };

    function pruefeKFeld(name, el) {
      if (!el) return true;
      var v = el.value.trim();
      var err = '';
      if      (name === 'name'     && v.length < 2)               err = 'Bitte mindestens 2 Zeichen eingeben.';
      else if (name === 'email'    && !/^[^@]+@[^@]+\.[^@]+$/.test(v)) err = 'Bitte eine gültige E-Mail-Adresse eingeben.';
      else if (name === 'nachricht'&& v.length < 10)              err = 'Die Nachricht muss mindestens 10 Zeichen lang sein.';
      if (err) { feldFehler(el, err); return false; }
      feldOk(el);
      return true;
    }

    ['name', 'email', 'nachricht'].forEach(function (n) {
      var el = kF[n];
      if (!el) return;
      el.addEventListener('input', function () { if (kGesendet) pruefeKFeld(n, el); });
    });

    function validiereKontakt() {
      var ok = true;
      ['name', 'email', 'nachricht'].forEach(function (n) { if (!pruefeKFeld(n, kF[n])) ok = false; });
      if (kF.consent && !kF.consent.checked) { feldFehler(kF.consent, 'Bitte zustimmen.'); ok = false; }
      else if (kF.consent) feldOk(kF.consent);
      return ok;
    }

    kForm.addEventListener('submit', function (e) {
      e.preventDefault();
      kGesendet = true;

      // Honeypot
      if (kF.hp && kF.hp.value) {
        zeigeMeldung(kForm, 'ok', '<strong>Vielen Dank!</strong> Deine Nachricht wurde gesendet.');
        kForm.reset(); return;
      }

      if (!validiereKontakt()) return;

      var btn = kForm.querySelector('[type="submit"]');
      setBtnLaden(btn, true);

      var payload = {
        name:     kF.name.value.trim(),
        email:    kF.email.value.trim(),
        telefon:  kF.telefon ? (kF.telefon.value.trim() || null) : null,
        thema:    kF.thema  ? kF.thema.value : null,
        nachricht:kF.nachricht.value.trim(),
        lang:     sprache()
      };

      mitClient(function (client) {
        client.from('contact_submissions').insert(payload).then(function (res) {
          setBtnLaden(btn, false);
          if (res.error) {
            console.error('[forms.js] Kontakt:', res.error);
            zeigeMeldung(kForm, 'fehler',
              '<strong>Es ist ein Fehler aufgetreten.</strong> Bitte versuche es erneut oder ' +
              'schreib uns direkt: <a href="mailto:mail@sportcenter-hahn.de">mail@sportcenter-hahn.de</a>');
            return;
          }
          zeigeMeldung(kForm, 'ok',
            '<strong>Vielen Dank, ' + esc(payload.name) + '!</strong> ' +
            'Deine Nachricht ist bei uns eingegangen. Wir antworten dir innerhalb von 1–2 Werktagen.');
          kForm.reset();
          kGesendet = false;
          kForm.parentNode.querySelector('.form-feedback')
            && setTimeout(function () {
              var fb = kForm.parentNode.querySelector('.form-feedback');
              if (fb) fb.remove();
            }, 12000);
        }).catch(function (err) {
          setBtnLaden(btn, false);
          console.error('[forms.js] Unerwarteter Fehler:', err);
          zeigeMeldung(kForm, 'fehler',
            '<strong>Verbindungsfehler.</strong> Bitte Internetverbindung prüfen und erneut versuchen.');
        });
      });
    });
  }


  /* ── 4. Mitgliedschaftsantrag (#antragsformular) ────────── */
  var mForm = document.getElementById('antragsformular');
  if (mForm) {
    mForm.setAttribute('novalidate', '');
    var mGesendet = false;

    var mF = {
      mitgliedschaft:    mForm.querySelector('[name="mitgliedschaft"]'),
      tarif:             mForm.querySelector('[name="tarif"]'),
      beginn:            mForm.querySelector('[name="beginn"]'),
      standort:          mForm.querySelector('[name="standort"]'),
      vorname:           mForm.querySelector('[name="vorname"]'),
      nachname:          mForm.querySelector('[name="nachname"]'),
      geburtsdatum:      mForm.querySelector('[name="geburtsdatum"]'),
      telefon:           mForm.querySelector('[name="telefon"]'),
      email:             mForm.querySelector('[name="email"]'),
      strasse:           mForm.querySelector('[name="strasse"]'),
      plz:               mForm.querySelector('[name="plz"]'),
      ort:               mForm.querySelector('[name="ort"]'),
      vertretung_name:   mForm.querySelector('[name="vertretung_name"]'),
      vertretung_telefon:mForm.querySelector('[name="vertretung_telefon"]'),
      kontoinhaber:      mForm.querySelector('[name="kontoinhaber"]'),
      iban:              mForm.querySelector('[name="iban"]'),
      bank:              mForm.querySelector('[name="bank"]'),
      sepa_mandat:       mForm.querySelector('[name="sepa_mandat"]'),
      satzung:           mForm.querySelector('[name="satzung"]'),
      consent:           mForm.querySelector('[name="consent"]'),
      whatsapp:          mForm.querySelector('[name="whatsapp"]'),
      hp:                mForm.querySelector('[name="website"]')
    };

    // IBAN: automatisch in 4er-Gruppen formatieren
    if (mF.iban) {
      mF.iban.addEventListener('input', function () {
        var pos = this.selectionStart;
        var raw = this.value.replace(/\s/g, '').toUpperCase().slice(0, 34);
        var fmt = raw.match(/.{1,4}/g);
        var newVal = fmt ? fmt.join(' ') : raw;
        this.value = newVal;
        try { this.setSelectionRange(Math.min(pos, newVal.length), Math.min(pos, newVal.length)); } catch (e) {}
      });
      mF.iban.addEventListener('blur', function () {
        this.value = this.value.trim().toUpperCase();
      });
    }

    function pruefeM(name, el) {
      if (!el) return true;
      var v = (el.value || '').trim();
      var err = '';
      switch (name) {
        case 'mitgliedschaft': if (!v) err = 'Bitte eine Mitgliedschaft wählen.'; break;
        case 'vorname':
        case 'nachname':       if (!v) err = 'Pflichtfeld.'; break;
        case 'geburtsdatum': {
          if (!v) { err = 'Bitte Geburtsdatum angeben.'; break; }
          var geb = new Date(v), now = new Date();
          if (isNaN(geb.getTime()))                        { err = 'Ungültiges Datum.'; break; }
          if (geb > now)                                   { err = 'Darf nicht in der Zukunft liegen.'; break; }
          if (now.getFullYear() - geb.getFullYear() > 120) { err = 'Bitte gültiges Geburtsdatum eingeben.'; break; }
          break;
        }
        case 'telefon':    if (v.length < 5)    err = 'Bitte Telefonnummer angeben.'; break;
        case 'email':      if (!/^[^@]+@[^@]+\.[^@]+$/.test(v)) err = 'Bitte gültige E-Mail-Adresse eingeben.'; break;
        case 'strasse':    if (v.length < 3)    err = 'Bitte Straße und Hausnummer eingeben.'; break;
        case 'plz':        if (!/^[0-9]{5}$/.test(v)) err = 'Bitte 5-stellige PLZ eingeben.'; break;
        case 'ort':        if (v.length < 2)    err = 'Bitte Ort eingeben.'; break;
        case 'kontoinhaber':if (v.length < 2)   err = 'Bitte Kontoinhaber angeben.'; break;
        case 'iban': {
          var raw = v.replace(/\s/g, '').toUpperCase();
          if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{12,30}$/.test(raw))
            err = 'Bitte gültige IBAN eingeben (z. B. DE89 3704 0044 0532 0130 00).';
          break;
        }
      }
      if (err) { feldFehler(el, err); return false; }
      feldOk(el);
      return true;
    }

    var mPflicht = ['mitgliedschaft','vorname','nachname','geburtsdatum',
                    'telefon','email','strasse','plz','ort','kontoinhaber','iban'];

    mPflicht.forEach(function (n) {
      var el = mF[n];
      if (!el) return;
      ['input','change'].forEach(function (ev) {
        el.addEventListener(ev, function () { if (mGesendet) pruefeM(n, el); });
      });
    });

    function validiereMitglied() {
      var ok = true;
      mPflicht.forEach(function (n) { if (!pruefeM(n, mF[n])) ok = false; });
      ['sepa_mandat','satzung','consent'].forEach(function (n) {
        var el = mF[n];
        if (!el) return;
        if (!el.checked) { feldFehler(el, 'Bitte anhaken.'); ok = false; }
        else feldOk(el);
      });
      return ok;
    }

    mForm.addEventListener('submit', function (e) {
      e.preventDefault();
      mGesendet = true;

      // Honeypot
      if (mF.hp && mF.hp.value) {
        zeigeMeldung(mForm, 'ok',
          '<strong>Antrag eingegangen!</strong> Wir melden uns in Kürze bei dir.');
        mForm.reset(); return;
      }

      if (!validiereMitglied()) {
        var erster = mForm.querySelector('.field--fehler input, .field--fehler select');
        if (erster) erster.focus();
        return;
      }

      var btn = mForm.querySelector('[type="submit"]');
      setBtnLaden(btn, true);

      var ibanRaw = mF.iban.value.replace(/\s/g, '').toUpperCase();

      var payload = {
        mitgliedschaft:    mF.mitgliedschaft.value,
        tarif:             mF.tarif     ? mF.tarif.value     : 'erwachsene',
        beginn:            mF.beginn    ? (mF.beginn.value   || null) : null,
        standort:          mF.standort  ? mF.standort.value  : null,
        vorname:           mF.vorname.value.trim(),
        nachname:          mF.nachname.value.trim(),
        geburtsdatum:      mF.geburtsdatum.value,
        telefon:           mF.telefon.value.trim(),
        email:             mF.email.value.trim(),
        strasse:           mF.strasse.value.trim(),
        plz:               mF.plz.value.trim(),
        ort:               mF.ort.value.trim(),
        vertretung_name:   mF.vertretung_name   ? (mF.vertretung_name.value.trim()    || null) : null,
        vertretung_telefon:mF.vertretung_telefon ? (mF.vertretung_telefon.value.trim() || null) : null,
        kontoinhaber:      mF.kontoinhaber.value.trim(),
        iban:              ibanRaw,
        bank:              mF.bank     ? (mF.bank.value.trim() || null) : null,
        sepa_mandat:       true,
        satzung_akzeptiert:true,
        consent:           true,
        whatsapp_gruppe:   mF.whatsapp ? mF.whatsapp.checked : false,
        lang:              sprache()
      };

      mitClient(function (client) {
        client.from('membership_applications').insert(payload).then(function (res) {
          setBtnLaden(btn, false);
          if (res.error) {
            console.error('[forms.js] Mitgliedschaft:', res.error);
            zeigeMeldung(mForm, 'fehler',
              '<strong>Es ist ein Fehler aufgetreten.</strong> Bitte versuche es erneut oder ' +
              'ruf uns an: <a href="tel:+4981715110">08171&nbsp;51&nbsp;110</a>.');
            return;
          }
          zeigeMeldung(mForm, 'ok',
            '<strong>Dein Antrag ist eingegangen!</strong> 🎾 ' +
            'Wir prüfen deine Angaben und melden uns per E-Mail an ' +
            '<strong>' + esc(payload.email) + '</strong>. ' +
            'Die Mitgliedschaft beginnt mit unserer schriftlichen Bestätigung.');
          mForm.reset();
          mGesendet = false;
        }).catch(function (err) {
          setBtnLaden(btn, false);
          console.error('[forms.js] Unerwarteter Fehler:', err);
          zeigeMeldung(mForm, 'fehler',
            '<strong>Verbindungsfehler.</strong> Bitte Internetverbindung prüfen und erneut versuchen.');
        });
      });
    });
  }

})();
