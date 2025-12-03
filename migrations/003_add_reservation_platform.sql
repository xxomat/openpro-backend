-- Migration 003 : Ajout du support multi-plateformes pour les réservations
-- Date : 2025
-- Description : Ajoute les champs reservation_platform et booking_status, et crée toutes les nouvelles tables

-- 1. Ajouter les colonnes à local_bookings
ALTER TABLE local_bookings ADD COLUMN reservation_platform TEXT NOT NULL DEFAULT 'Directe';
ALTER TABLE local_bookings ADD COLUMN booking_status TEXT NOT NULL DEFAULT 'Devis';

-- 2. Modifier id_hebergement pour être TEXT (sera mis à jour après création de la table accommodations)
-- Note: SQLite ne supporte pas ALTER COLUMN, on devra recréer la table si nécessaire
-- Pour l'instant, on garde INTEGER et on fera la migration dans une étape séparée

-- 3. Ajouter les contraintes CHECK
-- Note: SQLite ne supporte pas ADD CONSTRAINT, on devra recréer la table avec les contraintes
-- Pour l'instant, on ajoute juste les index

-- 4. Créer les index
CREATE INDEX IF NOT EXISTS idx_local_bookings_reservation_platform 
  ON local_bookings(reservation_platform);

CREATE INDEX IF NOT EXISTS idx_local_bookings_booking_status 
  ON local_bookings(booking_status);

CREATE INDEX IF NOT EXISTS idx_local_bookings_reference_platform 
  ON local_bookings(reference, reservation_platform);

-- 5. Mettre à jour les réservations existantes
UPDATE local_bookings 
SET reservation_platform = 'Directe', 
    booking_status = 'Confirmed'
WHERE reservation_platform IS NULL OR booking_status IS NULL;

-- 6. Créer la table accommodations (hébergements)
CREATE TABLE IF NOT EXISTS accommodations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  nom TEXT NOT NULL,
  id_openpro INTEGER,
  date_creation TEXT NOT NULL DEFAULT (datetime('now')),
  date_modification TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_accommodations_id_openpro 
  ON accommodations(id_openpro);

-- 7. Créer la table accommodation_external_ids (identifiants externes)
CREATE TABLE IF NOT EXISTS accommodation_external_ids (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  id_hebergement TEXT NOT NULL,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  date_creation TEXT NOT NULL DEFAULT (datetime('now')),
  date_modification TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(id_hebergement, platform),
  FOREIGN KEY (id_hebergement) REFERENCES accommodations(id)
);

CREATE INDEX IF NOT EXISTS idx_accommodation_external_ids_hebergement 
  ON accommodation_external_ids(id_hebergement);

-- 8. Créer la table ical_sync_config (configuration iCal)
CREATE TABLE IF NOT EXISTS ical_sync_config (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  id_hebergement TEXT NOT NULL,
  platform TEXT NOT NULL,
  import_url TEXT,
  export_url TEXT,
  date_creation TEXT NOT NULL DEFAULT (datetime('now')),
  date_modification TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(id_hebergement, platform),
  FOREIGN KEY (id_hebergement) REFERENCES accommodations(id)
);

CREATE INDEX IF NOT EXISTS idx_ical_sync_config_hebergement 
  ON ical_sync_config(id_hebergement);

-- 9. Créer la table rate_types (plans tarifaires)
CREATE TABLE IF NOT EXISTS rate_types (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  id_type_tarif INTEGER NOT NULL UNIQUE,
  libelle TEXT, -- JSON pour multilingue
  description TEXT, -- JSON pour multilingue
  ordre INTEGER,
  date_creation TEXT NOT NULL DEFAULT (datetime('now')),
  date_modification TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rate_types_id_type_tarif 
  ON rate_types(id_type_tarif);

-- 10. Créer la table accommodation_rate_type_links (liaisons hébergement - plans tarifaires)
CREATE TABLE IF NOT EXISTS accommodation_rate_type_links (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  id_hebergement TEXT NOT NULL,
  id_type_tarif INTEGER NOT NULL,
  date_creation TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(id_hebergement, id_type_tarif),
  FOREIGN KEY (id_hebergement) REFERENCES accommodations(id),
  FOREIGN KEY (id_type_tarif) REFERENCES rate_types(id_type_tarif)
);

CREATE INDEX IF NOT EXISTS idx_accommodation_rate_type_links_hebergement 
  ON accommodation_rate_type_links(id_hebergement);

-- 11. Créer la table accommodation_data (tarifs par date et plan tarifaire)
CREATE TABLE IF NOT EXISTS accommodation_data (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  id_hebergement TEXT NOT NULL,
  id_type_tarif INTEGER NOT NULL,
  date TEXT NOT NULL, -- Format YYYY-MM-DD
  prix_nuitee REAL,
  arrivee_autorisee BOOLEAN,
  depart_autorise BOOLEAN,
  duree_minimale INTEGER,
  duree_maximale INTEGER,
  date_creation TEXT NOT NULL DEFAULT (datetime('now')),
  date_modification TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(id_hebergement, id_type_tarif, date),
  FOREIGN KEY (id_hebergement) REFERENCES accommodations(id),
  FOREIGN KEY (id_type_tarif) REFERENCES rate_types(id_type_tarif)
);

CREATE INDEX IF NOT EXISTS idx_accommodation_data_hebergement_date 
  ON accommodation_data(id_hebergement, date);

-- 12. Créer la table accommodation_stock (stock par date)
CREATE TABLE IF NOT EXISTS accommodation_stock (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  id_hebergement TEXT NOT NULL,
  date TEXT NOT NULL, -- Format YYYY-MM-DD
  stock INTEGER, -- 0 ou 1
  date_creation TEXT NOT NULL DEFAULT (datetime('now')),
  date_modification TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(id_hebergement, date),
  FOREIGN KEY (id_hebergement) REFERENCES accommodations(id)
);

CREATE INDEX IF NOT EXISTS idx_accommodation_stock_hebergement 
  ON accommodation_stock(id_hebergement);

