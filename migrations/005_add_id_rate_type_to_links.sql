-- Migration 005: Ajouter id_rate_type pour référencer rate_types(id) au lieu de id_type_tarif
-- Permet de lier des plans tarifaires sans ID OpenPro (nécessaire pour fonctionner sans OpenPro)
--
-- Cette migration :
-- 1. Ajoute id_rate_type (TEXT) dans accommodation_rate_type_links et accommodation_data
-- 2. Remplit id_rate_type depuis rate_types(id) en utilisant id_type_tarif comme correspondance
-- 3. Recrée les tables avec les nouvelles foreign keys vers rate_types(id)
-- 4. Garde id_type_tarif pour compatibilité avec OpenPro

-- ============================================
-- PARTIE 1: accommodation_rate_type_links
-- ============================================

-- 1. Créer la nouvelle table avec id_rate_type
CREATE TABLE IF NOT EXISTS accommodation_rate_type_links_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  id_hebergement TEXT NOT NULL,
  id_rate_type TEXT NOT NULL,  -- Nouveau: référence rate_types(id) - UUID interne
  id_type_tarif INTEGER,  -- Gardé pour compatibilité OpenPro (peut être NULL)
  date_creation TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(id_hebergement, id_rate_type),
  FOREIGN KEY (id_hebergement) REFERENCES accommodations(id),
  FOREIGN KEY (id_rate_type) REFERENCES rate_types(id)
);

-- 2. Copier les données existantes en remplissant id_rate_type
INSERT INTO accommodation_rate_type_links_new (id, id_hebergement, id_rate_type, id_type_tarif, date_creation)
SELECT 
  artl.id, 
  artl.id_hebergement, 
  rt.id AS id_rate_type,  -- UUID interne depuis rate_types
  artl.id_type_tarif,  -- Garder pour compatibilité
  artl.date_creation
FROM accommodation_rate_type_links artl
INNER JOIN rate_types rt ON rt.id_type_tarif = artl.id_type_tarif;

-- 3. Supprimer l'ancienne table
DROP TABLE accommodation_rate_type_links;

-- 4. Renommer la nouvelle table
ALTER TABLE accommodation_rate_type_links_new RENAME TO accommodation_rate_type_links;

-- 5. Recréer l'index
CREATE INDEX IF NOT EXISTS idx_accommodation_rate_type_links_hebergement 
  ON accommodation_rate_type_links(id_hebergement);

-- ============================================
-- PARTIE 2: accommodation_data
-- ============================================

-- 6. Créer la nouvelle table avec id_rate_type
CREATE TABLE IF NOT EXISTS accommodation_data_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  id_hebergement TEXT NOT NULL,
  id_rate_type TEXT NOT NULL,  -- Nouveau: référence rate_types(id) - UUID interne
  id_type_tarif INTEGER,  -- Gardé pour compatibilité OpenPro (peut être NULL)
  date TEXT NOT NULL, -- Format YYYY-MM-DD
  prix_nuitee REAL,
  arrivee_autorisee BOOLEAN,
  depart_autorise BOOLEAN,
  duree_minimale INTEGER,
  duree_maximale INTEGER,
  date_creation TEXT NOT NULL DEFAULT (datetime('now')),
  date_modification TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(id_hebergement, id_rate_type, date),
  FOREIGN KEY (id_hebergement) REFERENCES accommodations(id),
  FOREIGN KEY (id_rate_type) REFERENCES rate_types(id)
);

-- 7. Copier les données existantes en remplissant id_rate_type
INSERT INTO accommodation_data_new (
  id, id_hebergement, id_rate_type, id_type_tarif, date, 
  prix_nuitee, arrivee_autorisee, depart_autorise, 
  duree_minimale, duree_maximale, date_creation, date_modification
)
SELECT 
  ad.id, 
  ad.id_hebergement, 
  rt.id AS id_rate_type,  -- UUID interne depuis rate_types
  ad.id_type_tarif,  -- Garder pour compatibilité
  ad.date,
  ad.prix_nuitee,
  ad.arrivee_autorisee,
  ad.depart_autorise,
  ad.duree_minimale,
  ad.duree_maximale,
  ad.date_creation,
  ad.date_modification
FROM accommodation_data ad
INNER JOIN rate_types rt ON rt.id_type_tarif = ad.id_type_tarif;

-- 8. Supprimer l'ancienne table
DROP TABLE accommodation_data;

-- 9. Renommer la nouvelle table
ALTER TABLE accommodation_data_new RENAME TO accommodation_data;

-- 10. Recréer l'index
CREATE INDEX IF NOT EXISTS idx_accommodation_data_hebergement_date 
  ON accommodation_data(id_hebergement, date);

-- ============================================
-- NOTES
-- ============================================
-- 
-- Après cette migration :
-- - Les foreign keys référencent maintenant rate_types(id) (UUID interne)
-- - On peut lier des plans tarifaires même s'ils n'ont pas encore d'ID OpenPro
-- - id_type_tarif est gardé pour compatibilité mais n'est plus utilisé dans les foreign keys
-- - Le code doit être adapté pour utiliser id_rate_type au lieu de id_type_tarif dans les liaisons

