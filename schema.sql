-- Schéma D1 pour openpro-backend
-- Base de données SQLite pour Cloudflare Workers

-- Table des hébergements
CREATE TABLE IF NOT EXISTS accommodations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  nom TEXT NOT NULL,
  id_openpro INTEGER,
  date_creation TEXT NOT NULL DEFAULT (datetime('now')),
  date_modification TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_accommodations_id_openpro 
  ON accommodations(id_openpro);

-- Table des identifiants externes des hébergements
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

-- Table des plans tarifaires
CREATE TABLE IF NOT EXISTS rate_types (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  id_type_tarif INTEGER NULL UNIQUE,  -- ID OpenPro (nullable, peut être NULL avant création dans OpenPro)
  libelle TEXT, -- JSON pour multilingue
  description TEXT, -- JSON pour multilingue
  ordre INTEGER,
  date_creation TEXT NOT NULL DEFAULT (datetime('now')),
  date_modification TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rate_types_id_type_tarif 
  ON rate_types(id_type_tarif) WHERE id_type_tarif IS NOT NULL;

-- Table des liaisons hébergement - plans tarifaires
CREATE TABLE IF NOT EXISTS accommodation_rate_type_links (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  id_hebergement TEXT NOT NULL,
  id_rate_type TEXT NOT NULL,  -- Référence rate_types(id) - UUID interne (permet de lier sans ID OpenPro)
  id_type_tarif INTEGER,  -- Gardé pour compatibilité OpenPro (peut être NULL)
  date_creation TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(id_hebergement, id_rate_type),
  FOREIGN KEY (id_hebergement) REFERENCES accommodations(id),
  FOREIGN KEY (id_rate_type) REFERENCES rate_types(id)
);

CREATE INDEX IF NOT EXISTS idx_accommodation_rate_type_links_hebergement 
  ON accommodation_rate_type_links(id_hebergement);

-- Table des données tarifaires par date et plan tarifaire
CREATE TABLE IF NOT EXISTS accommodation_data (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  id_hebergement TEXT NOT NULL,
  id_rate_type TEXT NOT NULL,  -- Référence rate_types(id) - UUID interne (permet de lier sans ID OpenPro)
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

CREATE INDEX IF NOT EXISTS idx_accommodation_data_hebergement_date 
  ON accommodation_data(id_hebergement, date);

-- Table du stock par date
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

-- Table de configuration iCal
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

-- Table des réservations locales (créées via l'interface admin)
-- Note: id_hebergement reste INTEGER pour compatibilité, sera migré vers TEXT plus tard
CREATE TABLE IF NOT EXISTS local_bookings (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  id_fournisseur INTEGER NOT NULL,
  id_hebergement INTEGER NOT NULL, -- Sera migré vers TEXT pour référencer accommodations.id
  date_arrivee TEXT NOT NULL, -- Format: YYYY-MM-DD
  date_depart TEXT NOT NULL,  -- Format: YYYY-MM-DD
  client_nom TEXT,
  client_prenom TEXT,
  client_email TEXT,
  client_telephone TEXT,
  nb_personnes INTEGER DEFAULT 2,
  montant_total REAL,
  reference TEXT, -- Utilisé pour stocker les identifiants externes (idDossier OpenPro, UID iCal)
  reservation_platform TEXT NOT NULL DEFAULT 'Directe', -- Plateforme d'origine: 'Directe', 'OpenPro', 'Booking.com', etc.
  booking_status TEXT NOT NULL DEFAULT 'Devis', -- État: 'Devis', 'Confirmée', 'Soldée', 'Annulée', 'Passée'
  date_creation TEXT NOT NULL DEFAULT (datetime('now')),
  date_modification TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT, -- Date/heure de synchronisation avec OpenPro (NULL = en latence)
  
  CHECK (date_depart > date_arrivee),
  CHECK (nb_personnes > 0),
  CHECK (reservation_platform IN ('Directe', 'OpenPro', 'Booking.com', 'Xotelia', 'Unknown')),
  CHECK (booking_status IN ('Quote', 'Confirmed', 'Paid', 'Cancelled', 'Past'))
);

CREATE INDEX IF NOT EXISTS idx_local_bookings_hebergement 
  ON local_bookings(id_fournisseur, id_hebergement);

CREATE INDEX IF NOT EXISTS idx_local_bookings_dates 
  ON local_bookings(date_arrivee, date_depart);

CREATE INDEX IF NOT EXISTS idx_local_bookings_synced_at 
  ON local_bookings(synced_at);

CREATE INDEX IF NOT EXISTS idx_local_bookings_reservation_platform 
  ON local_bookings(reservation_platform);

CREATE INDEX IF NOT EXISTS idx_local_bookings_booking_status 
  ON local_bookings(booking_status);

CREATE INDEX IF NOT EXISTS idx_local_bookings_reference_platform 
  ON local_bookings(reference, reservation_platform);

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

