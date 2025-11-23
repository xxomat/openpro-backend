-- Migration: Ajout des colonnes synced_at et obsolete à local_bookings
-- Date: 2025-01
-- 
-- Note: SQLite ne supporte pas IF NOT EXISTS pour ALTER TABLE ADD COLUMN.
-- Si les colonnes existent déjà, ces commandes échoueront (c'est acceptable).
-- Pour vérifier si les colonnes existent déjà, utiliser :
-- PRAGMA table_info(local_bookings);

-- Ajouter la colonne synced_at si elle n'existe pas déjà
ALTER TABLE local_bookings ADD COLUMN synced_at TEXT;

-- Ajouter la colonne obsolete avec valeur par défaut
ALTER TABLE local_bookings ADD COLUMN obsolete INTEGER DEFAULT 0;

-- Créer les index (IF NOT EXISTS fonctionne pour les index)
CREATE INDEX IF NOT EXISTS idx_local_bookings_synced_at 
  ON local_bookings(synced_at);

CREATE INDEX IF NOT EXISTS idx_local_bookings_obsolete 
  ON local_bookings(obsolete);

