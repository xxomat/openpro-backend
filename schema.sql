-- Schéma D1 pour openpro-backend
-- Base de données SQLite pour Cloudflare Workers

-- Table des réservations locales (créées via l'interface admin)
CREATE TABLE IF NOT EXISTS local_bookings (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  id_fournisseur INTEGER NOT NULL,
  id_hebergement INTEGER NOT NULL,
  date_arrivee TEXT NOT NULL, -- Format: YYYY-MM-DD
  date_depart TEXT NOT NULL,  -- Format: YYYY-MM-DD
  client_nom TEXT,
  client_prenom TEXT,
  client_email TEXT,
  client_telephone TEXT,
  nb_personnes INTEGER DEFAULT 2,
  montant_total REAL,
  reference TEXT,
  date_creation TEXT NOT NULL DEFAULT (datetime('now')),
  date_modification TEXT NOT NULL DEFAULT (datetime('now')),
  
  CHECK (date_depart > date_arrivee),
  CHECK (nb_personnes > 0)
);

CREATE INDEX IF NOT EXISTS idx_local_bookings_hebergement 
  ON local_bookings(id_fournisseur, id_hebergement);

CREATE INDEX IF NOT EXISTS idx_local_bookings_dates 
  ON local_bookings(date_arrivee, date_depart);

-- Table des suggestions IA
CREATE TABLE IF NOT EXISTS ai_suggestions (
  id TEXT PRIMARY KEY,
  id_fournisseur INTEGER NOT NULL,
  id_hebergement INTEGER NOT NULL,
  suggestion_type TEXT NOT NULL, -- 'pricing', 'availability', etc.
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'applied', 'rejected'
  suggested_data TEXT NOT NULL, -- JSON string
  rationale TEXT,
  confidence_score REAL,
  date_created TEXT NOT NULL DEFAULT (datetime('now')),
  date_modified TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_supplier 
  ON ai_suggestions(id_fournisseur, status);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_accommodation 
  ON ai_suggestions(id_hebergement, status);

