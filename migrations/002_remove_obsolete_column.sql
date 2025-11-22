-- Migration: Suppression de la colonne obsolete et nettoyage des réservations obsolètes
-- Date: 2025-11-22
-- 
-- Cette migration :
-- 1. Supprime tous les enregistrements avec obsolete = 1 (réservations obsolètes qui ne doivent pas être dans la DB)
-- 2. Supprime la colonne obsolete (SQLite nécessite une recréation de table)
-- 3. Supprime l'index idx_local_bookings_obsolete

-- Étape 1: Supprimer tous les enregistrements obsolètes
DELETE FROM local_bookings WHERE obsolete = 1;

-- Étape 2: Supprimer l'index obsolete
DROP INDEX IF EXISTS idx_local_bookings_obsolete;

-- Étape 3: Recréer la table sans la colonne obsolete
-- SQLite ne supporte pas DROP COLUMN, donc on doit recréer la table
CREATE TABLE IF NOT EXISTS local_bookings_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  id_fournisseur INTEGER NOT NULL,
  id_hebergement INTEGER NOT NULL,
  date_arrivee TEXT NOT NULL,
  date_depart TEXT NOT NULL,
  client_nom TEXT,
  client_prenom TEXT,
  client_email TEXT,
  client_telephone TEXT,
  nb_personnes INTEGER DEFAULT 2,
  montant_total REAL,
  reference TEXT,
  date_creation TEXT NOT NULL DEFAULT (datetime('now')),
  date_modification TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT,
  
  CHECK (date_depart > date_arrivee),
  CHECK (nb_personnes > 0)
);

-- Étape 4: Copier les données (sans la colonne obsolete)
INSERT INTO local_bookings_new (
  id, id_fournisseur, id_hebergement, date_arrivee, date_depart,
  client_nom, client_prenom, client_email, client_telephone,
  nb_personnes, montant_total, reference,
  date_creation, date_modification, synced_at
)
SELECT 
  id, id_fournisseur, id_hebergement, date_arrivee, date_depart,
  client_nom, client_prenom, client_email, client_telephone,
  nb_personnes, montant_total, reference,
  date_creation, date_modification, synced_at
FROM local_bookings
WHERE obsolete = 0 OR obsolete IS NULL;

-- Étape 5: Supprimer l'ancienne table
DROP TABLE local_bookings;

-- Étape 6: Renommer la nouvelle table
ALTER TABLE local_bookings_new RENAME TO local_bookings;

-- Étape 7: Recréer les index (sauf obsolete)
CREATE INDEX IF NOT EXISTS idx_local_bookings_hebergement 
  ON local_bookings(id_fournisseur, id_hebergement);

CREATE INDEX IF NOT EXISTS idx_local_bookings_dates 
  ON local_bookings(date_arrivee, date_depart);

CREATE INDEX IF NOT EXISTS idx_local_bookings_synced_at 
  ON local_bookings(synced_at);

