-- Migration 006: Migrer id_hebergement de INTEGER (ID OpenPro) vers TEXT (GUID DB)
-- Permet d'utiliser les GUIDs de la DB au lieu des IDs OpenPro
--
-- Cette migration :
-- 1. Crée une nouvelle table local_bookings_new avec id_hebergement TEXT
-- 2. Convertit les IDs OpenPro en GUIDs en cherchant dans accommodations/accommodation_external_ids
-- 3. Supprime l'ancienne table et renomme la nouvelle

-- ============================================
-- PARTIE 1: Créer la nouvelle table
-- ============================================

CREATE TABLE IF NOT EXISTS local_bookings_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  id_fournisseur INTEGER NOT NULL,
  id_hebergement TEXT NOT NULL, -- Maintenant TEXT (GUID DB)
  date_arrivee TEXT NOT NULL,
  date_depart TEXT NOT NULL,
  client_nom TEXT,
  client_prenom TEXT,
  client_email TEXT,
  client_telephone TEXT,
  nb_personnes INTEGER DEFAULT 2,
  montant_total REAL,
  reference TEXT,
  reservation_platform TEXT NOT NULL DEFAULT 'Directe',
  booking_status TEXT NOT NULL DEFAULT 'Devis',
  date_creation TEXT NOT NULL DEFAULT (datetime('now')),
  date_modification TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT,
  
  CHECK (date_depart > date_arrivee),
  CHECK (nb_personnes > 0),
  CHECK (reservation_platform IN ('Directe', 'OpenPro', 'Booking.com', 'Xotelia', 'Unknown')),
  CHECK (booking_status IN ('Quote', 'Confirmed', 'Paid', 'Cancelled', 'Past')),
  FOREIGN KEY (id_hebergement) REFERENCES accommodations(id)
);

-- ============================================
-- PARTIE 2: Migrer les données
-- ============================================

-- Copier les données en convertissant les IDs OpenPro en GUIDs
-- On cherche d'abord dans accommodations.id_openpro, puis dans accommodation_external_ids
INSERT INTO local_bookings_new (
  id,
  id_fournisseur,
  id_hebergement,
  date_arrivee,
  date_depart,
  client_nom,
  client_prenom,
  client_email,
  client_telephone,
  nb_personnes,
  montant_total,
  reference,
  reservation_platform,
  booking_status,
  date_creation,
  date_modification,
  synced_at
)
SELECT 
  lb.id,
  lb.id_fournisseur,
  COALESCE(
    -- Méthode 1: Chercher dans accommodations.id_openpro
    (SELECT a.id FROM accommodations a WHERE a.id_openpro = lb.id_hebergement LIMIT 1),
    -- Méthode 2: Chercher dans accommodation_external_ids
    (SELECT aei.id_hebergement 
     FROM accommodation_external_ids aei 
     WHERE aei.platform = 'OpenPro' AND aei.external_id = CAST(lb.id_hebergement AS TEXT)
     LIMIT 1),
    -- Fallback: Si aucun match, on garde l'ID OpenPro comme string (sera nettoyé manuellement si nécessaire)
    CAST(lb.id_hebergement AS TEXT)
  ) AS id_hebergement,
  lb.date_arrivee,
  lb.date_depart,
  lb.client_nom,
  lb.client_prenom,
  lb.client_email,
  lb.client_telephone,
  lb.nb_personnes,
  lb.montant_total,
  lb.reference,
  lb.reservation_platform,
  lb.booking_status,
  lb.date_creation,
  lb.date_modification,
  lb.synced_at
FROM local_bookings lb;

-- ============================================
-- PARTIE 3: Recréer les index
-- ============================================

CREATE INDEX IF NOT EXISTS idx_local_bookings_hebergement_new 
  ON local_bookings_new(id_fournisseur, id_hebergement);

CREATE INDEX IF NOT EXISTS idx_local_bookings_dates_new 
  ON local_bookings_new(date_arrivee, date_depart);

CREATE INDEX IF NOT EXISTS idx_local_bookings_reservation_platform_new 
  ON local_bookings_new(reservation_platform);

CREATE INDEX IF NOT EXISTS idx_local_bookings_booking_status_new 
  ON local_bookings_new(booking_status);

CREATE INDEX IF NOT EXISTS idx_local_bookings_reference_platform_new 
  ON local_bookings_new(reference, reservation_platform);

-- ============================================
-- PARTIE 4: Remplacer l'ancienne table
-- ============================================

-- Supprimer l'ancienne table
DROP TABLE IF EXISTS local_bookings;

-- Renommer la nouvelle table
ALTER TABLE local_bookings_new RENAME TO local_bookings;

-- Renommer les index
DROP INDEX IF EXISTS idx_local_bookings_hebergement_new;
DROP INDEX IF EXISTS idx_local_bookings_dates_new;
DROP INDEX IF EXISTS idx_local_bookings_reservation_platform_new;
DROP INDEX IF EXISTS idx_local_bookings_booking_status_new;
DROP INDEX IF EXISTS idx_local_bookings_reference_platform_new;

CREATE INDEX IF NOT EXISTS idx_local_bookings_hebergement 
  ON local_bookings(id_fournisseur, id_hebergement);

CREATE INDEX IF NOT EXISTS idx_local_bookings_dates 
  ON local_bookings(date_arrivee, date_depart);

CREATE INDEX IF NOT EXISTS idx_local_bookings_reservation_platform 
  ON local_bookings(reservation_platform);

CREATE INDEX IF NOT EXISTS idx_local_bookings_booking_status 
  ON local_bookings(booking_status);

CREATE INDEX IF NOT EXISTS idx_local_bookings_reference_platform 
  ON local_bookings(reference, reservation_platform);

