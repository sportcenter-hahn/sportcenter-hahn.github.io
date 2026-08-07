-- ============================================================
-- Sportcenter Hahn — Formular-Tabellen + RLS
-- Ausführen im Supabase Dashboard → SQL Editor → Run
-- ============================================================


-- ============================================================
-- 1. Kontaktanfragen
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL    DEFAULT now(),
  status      text        NOT NULL    DEFAULT 'neu'
                CHECK (status IN ('neu', 'bearbeitet', 'archiviert')),

  name        text        NOT NULL    CHECK (char_length(name)      BETWEEN 2 AND 200),
  email       text        NOT NULL    CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  telefon     text                    CHECK (telefon IS NULL OR char_length(telefon) <= 50),
  thema       text                    CHECK (thema IN (
                'Platzbuchung','Mitgliedschaft','Training',
                'Turnier oder Liga','Sportsbar & Events','Karriere','Sonstiges'
              )),
  nachricht   text        NOT NULL    CHECK (char_length(nachricht) BETWEEN 10 AND 4000),
  lang        text        NOT NULL    DEFAULT 'de' CHECK (lang IN ('de','en','es'))
);

CREATE INDEX IF NOT EXISTS contact_submissions_created_at_idx
  ON public.contact_submissions (created_at DESC);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

-- Anonyme Besucher: nur INSERT erlaubt
CREATE POLICY "anon_can_insert_contact"
  ON public.contact_submissions FOR INSERT TO anon WITH CHECK (true);

-- Admins (eingeloggt): lesen + Status ändern
CREATE POLICY "auth_can_select_contact"
  ON public.contact_submissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_can_update_contact_status"
  ON public.contact_submissions FOR UPDATE TO authenticated
  USING (true) WITH CHECK (status IN ('neu', 'bearbeitet', 'archiviert'));


-- ============================================================
-- 2. Mitgliedschaftsanträge
-- ============================================================
CREATE TABLE IF NOT EXISTS public.membership_applications (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL    DEFAULT now(),
  status             text        NOT NULL    DEFAULT 'neu'
                       CHECK (status IN ('neu', 'bearbeitet', 'archiviert')),
  lang               text        NOT NULL    DEFAULT 'de' CHECK (lang IN ('de','en','es')),

  -- 1 · Gewünschte Mitgliedschaft
  mitgliedschaft     text        NOT NULL,
  tarif              text        NOT NULL    DEFAULT 'erwachsene'
                       CHECK (tarif IN ('erwachsene','schueler','studenten','u11')),
  beginn             date,                   -- null = nächstmöglicher Termin
  standort           text                    CHECK (standort IN ('Geretsried','Wolfratshausen','Beide')),

  -- 2 · Persönliche Daten
  vorname            text        NOT NULL    CHECK (char_length(vorname)   BETWEEN 1 AND 100),
  nachname           text        NOT NULL    CHECK (char_length(nachname)  BETWEEN 1 AND 100),
  geburtsdatum       date        NOT NULL,
  telefon            text        NOT NULL    CHECK (char_length(telefon)   BETWEEN 5 AND 50),
  email              text        NOT NULL    CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  strasse            text        NOT NULL    CHECK (char_length(strasse)   BETWEEN 3 AND 200),
  plz                text        NOT NULL    CHECK (plz ~ '^[0-9]{5}$'),
  ort                text        NOT NULL    CHECK (char_length(ort)       BETWEEN 2 AND 100),

  -- 3 · Minderjährige (optional)
  vertretung_name    text,
  vertretung_telefon text,

  -- 4 · SEPA-Lastschriftmandat
  kontoinhaber       text        NOT NULL    CHECK (char_length(kontoinhaber) BETWEEN 2 AND 200),
  iban               text        NOT NULL    CHECK (
                       iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{12,30}$'
                     ),
  bank               text,
  sepa_mandat        boolean     NOT NULL    DEFAULT false,

  -- 5 · Zustimmungen
  satzung_akzeptiert boolean     NOT NULL    DEFAULT false,
  consent            boolean     NOT NULL    DEFAULT false,
  whatsapp_gruppe    boolean     NOT NULL    DEFAULT false
);

CREATE INDEX IF NOT EXISTS membership_applications_created_at_idx
  ON public.membership_applications (created_at DESC);

ALTER TABLE public.membership_applications ENABLE ROW LEVEL SECURITY;

-- Anonyme Besucher: nur INSERT — und nur wenn alle Pflicht-Checkboxen gesetzt sind
CREATE POLICY "anon_can_insert_membership"
  ON public.membership_applications FOR INSERT TO anon
  WITH CHECK (
    sepa_mandat        = true
    AND satzung_akzeptiert = true
    AND consent            = true
  );

-- Admins: lesen + Status ändern
CREATE POLICY "auth_can_select_membership"
  ON public.membership_applications FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_can_update_membership_status"
  ON public.membership_applications FOR UPDATE TO authenticated
  USING (true) WITH CHECK (status IN ('neu', 'bearbeitet', 'archiviert'));
