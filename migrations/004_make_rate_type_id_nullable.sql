-- Migration 004: Rendre id_type_tarif nullable pour permettre création DB-first
-- 
-- Cette migration permet de créer des plans tarifaires en DB avant de les créer dans OpenPro.
-- L'id_type_tarif (ID OpenPro) peut être NULL initialement et sera mis à jour après création dans OpenPro.

-- 1. Créer une nouvelle table avec id_type_tarif nullable
CREATE TABLE IF NOT EXISTS rate_types_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  id_type_tarif INTEGER NULL UNIQUE,  -- NULLABLE maintenant
  libelle TEXT, -- JSON pour multilingue
  description TEXT, -- JSON pour multilingue
  ordre INTEGER,
  date_creation TEXT NOT NULL DEFAULT (datetime('now')),
  date_modification TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Copier les données existantes (tous les id_type_tarif existants sont non-null)
INSERT INTO rate_types_new (id, id_type_tarif, libelle, description, ordre, date_creation, date_modification)
SELECT id, id_type_tarif, libelle, description, ordre, date_creation, date_modification
FROM rate_types;

-- 3. Supprimer l'ancienne table
DROP TABLE rate_types;

-- 4. Renommer la nouvelle table
ALTER TABLE rate_types_new RENAME TO rate_types;

-- 5. Recréer l'index (avec WHERE pour ne pas indexer les NULL)
CREATE INDEX IF NOT EXISTS idx_rate_types_id_type_tarif 
  ON rate_types(id_type_tarif) WHERE id_type_tarif IS NOT NULL;

-- Note: Les foreign keys dans accommodation_rate_type_links et accommodation_data
-- continuent de fonctionner car elles référencent id_type_tarif qui reste UNIQUE.
-- Les plans tarifaires sans id_type_tarif ne peuvent pas être liés tant qu'ils n'ont pas d'ID OpenPro.

