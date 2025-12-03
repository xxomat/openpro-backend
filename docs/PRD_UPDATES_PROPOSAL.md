# Proposition de mises à jour - PRD Backend

## Changements majeurs à documenter

### 1. Nouveau paradigme architectural

**Section à ajouter/modifier :** Section 1.1 "Objectif du projet" et nouvelle section "1.4 Paradigme de données"

**Contenu proposé :**

```markdown
### 1.4 Paradigme de données - Backend DB comme source de vérité

**Changement majeur :** OpenPro devient un système satellite utilisé uniquement comme source de réservations et comme destination d'export pour la diffusion des hébergements sur les sites institutionnels.

**Source de vérité :** La base de données D1 du backend est désormais la source de vérité pour :
- Les hébergements disponibles (liste, noms, identifiants externes)
- Les plans tarifaires (types de tarifs, descriptions, ordre)
- Les liaisons plans tarifaires/hébergements
- Les données de tarifs (prix, durées min/max, arrivée/départ autorisés) par date et plan tarifaire
- Le stock par date
- Toutes les réservations (Directes, OpenPro, plateformes externes)

**Rôle d'OpenPro :**
- **Source de réservations :** OpenPro envoie des notifications de réservations via webhook GET
- **Destination d'export :** Les données d'hébergements, tarifs et stock sont exportées vers OpenPro au démarrage du backend et après chaque modification
- **Diffusion :** OpenPro utilise les données exportées pour mettre en ligne les hébergements sur les sites institutionnels

**Synchronisation :**
- **Au démarrage :** 
  - Synchronisation des réservations OpenPro (import depuis OpenPro vers DB)
  - Export des données d'hébergements vers OpenPro
- **Après modifications :** Export automatique des données modifiées vers OpenPro
- **Webhooks :** Réception en temps réel des nouvelles réservations OpenPro
- **iCal :** Synchronisation bidirectionnelle avec les plateformes externes (Booking.com, etc.)
```

### 2. Gestion d'un seul fournisseur

**Section à ajouter/modifier :** Section 2.1 "Stack technologique" et nouvelle section "2.4 Configuration du fournisseur"

**Contenu proposé :**

```markdown
### 2.4 Configuration du fournisseur

Le système gère un seul fournisseur, configuré via la variable d'environnement `SUPPLIER_ID`.

**Configuration :**
- **Variable d'environnement :** `SUPPLIER_ID` (string, convertie en number)
- **Fichier de configuration :** `wrangler.toml` (développement) ou secrets Cloudflare (production)
- **Fonction helper :** `getSupplierId(env)` dans `src/config/supplier.ts` pour récupérer et valider la valeur
- **Validation :** La fonction `getSupplierId()` valide que la variable est définie et est un nombre valide

**Validation dans les routes :** Toutes les routes qui acceptent un `idFournisseur` en paramètre valident que celui-ci correspond à `SUPPLIER_ID`. Les requêtes avec un `idFournisseur` différent sont rejetées avec une erreur 400.

**Avantages :**
- Configuration flexible via variables d'environnement
- Pas besoin de modifier le code pour changer le fournisseur
- Sécurité renforcée (pas de manipulation d'ID)
- Performance améliorée (pas de requêtes multi-fournisseurs)
- Compatible avec les secrets Cloudflare pour la production
```

### 3. Gestion des hébergements

**Section à ajouter/modifier :** Section 3.1 "Routes fournisseurs" - Nouvelle sous-section "3.1.0 Hébergements"

**Contenu proposé :**

```markdown
#### 3.1.0 Hébergements (nouveau)

Les hébergements sont désormais gérés directement dans la DB backend et peuvent être créés/modifiés via l'interface admin.

**Routes :**
- `GET /api/accommodations` - Liste tous les hébergements
- `POST /api/accommodations` - Créer un hébergement
  - **Corps :**
    ```typescript
    {
      nom: string;
      ids: {
        Directe: string;        // OBLIGATOIRE - ID interne dans la DB
        OpenPro?: string;       // Optionnel - ID OpenPro
        'Booking.com'?: string; // Optionnel - ID Booking.com
        Xotelia?: string;       // Optionnel - ID Xotelia
      }
    }
    ```
  - **Validation :** L'ID `Directe` est obligatoire et doit être fourni par l'admin
- `PUT /api/accommodations/:id` - Modifier un hébergement
- `DELETE /api/accommodations/:id` - Supprimer un hébergement
- `POST /api/accommodations/:id/external-ids` - Ajouter/modifier un identifiant externe
- `GET /api/accommodations/:id/external-ids` - Récupérer les identifiants externes

**Structure de données :**
- Chaque hébergement a un ID interne (string) qui correspond à l'ID `Directe`
- Les identifiants externes (OpenPro, Booking.com, etc.) sont stockés dans la table `accommodation_external_ids`
- L'ID OpenPro est utilisé pour l'export des données vers OpenPro

**Vérification au démarrage :**
- Le backend vérifie que tous les hébergements en DB avec un ID OpenPro existent dans OpenPro
- Si un hébergement DB n'existe pas dans OpenPro : un avertissement est enregistré pour l'admin
- Note : L'API OpenPro ne permet pas de créer un hébergement, donc on ne peut que vérifier et avertir (voir section 3.9)
```

### 4. Trois sources de réservations

**Section à ajouter/modifier :** Nouvelle section "3.7 Réservations multi-plateformes"

**Contenu proposé :**

```markdown
#### 3.7 Réservations multi-plateformes

Le système gère trois sources de réservations, toutes stockées dans la table `local_bookings` :

**1. Réservations Directes** (`reservation_platform = 'Directe'`)
- Créées via l'interface admin
- Stockées directement en DB avec `booking_status = 'Quote'` par défaut
- Peuvent être synchronisées vers OpenPro (fonctionnalité future)

**2. Réservations OpenPro** (`reservation_platform = 'OpenPro'`)
- Reçues via webhook GET : `/api/webhooks/openpro/booking?idFournisseur=X&idDossier=Y`
- Synchronisées au démarrage du backend
- Stockées avec `booking_status = 'Confirmed'` par défaut
- Utilisent `idDossier` comme `reference`

**3. Réservations plateformes externes** (`reservation_platform = 'Booking.com'`, etc.)
- Synchronisées via iCal (cron toutes les 15 minutes)
- Import depuis les URLs iCal configurées dans `ical_sync_config`
- Utilisent l'UID iCal comme `reference`

**Champ `reservation_platform` :**
- Enum : `'Directe' | 'OpenPro' | 'Booking.com' | 'Xotelia' | 'Unknown'`
- Permet d'identifier l'origine de chaque réservation
- Utilisé pour filtrer les réservations dans les exports iCal

**Champ `booking_status` :**
- Enum : `'Quote' | 'Confirmed' | 'Paid' | 'Cancelled' | 'Past'`
- Remplace l'ancien champ `is_cancelled`
- Gestion automatique :
  - `'Past'` : Mise à jour automatique pour les réservations dont la date de départ est passée
  - `'Cancelled'` : Conservé lors de la synchronisation OpenPro si déjà annulée en DB
```

### 5. Webhook OpenPro (format GET)

**Section à modifier :** Section 3.2 "Routes webhooks"

**Contenu proposé :**

```markdown
### 3.2 Routes webhooks (`/api/webhooks`)

#### 3.2.1 Webhook OpenPro - Format GET (nouveau format principal)

- `GET /api/webhooks/openpro/booking?idFournisseur=X&idDossier=Y` - Réception des webhooks OpenPro
  - **Paramètres query :**
    - `idFournisseur` : ID du fournisseur (doit correspondre à `SUPPLIER_ID`)
    - `idDossier` : ID du dossier de réservation OpenPro
  - **Comportement :**
    1. Valide que `idFournisseur === SUPPLIER_ID`
    2. Récupère le dossier depuis OpenPro via `getBooking()`
    3. Mappe le dossier vers le format DB via `mapOpenProDossierToBooking()`
    4. Vérifie si la réservation existe déjà en DB (par `reference = idDossier` et `reservation_platform = 'OpenPro'`)
    5. Si existe et `booking_status !== 'Cancelled'` : met à jour
    6. Si existe et `booking_status === 'Cancelled'` : conserve le statut (ne pas réactiver)
    7. Si n'existe pas : insère avec `booking_status = 'Confirmed'`
  - **Réponse :** `{ received: true, message: 'Booking processed' }`
```

### 6. Synchronisation iCal bidirectionnelle

**Section à ajouter :** Nouvelle section "3.8 Synchronisation iCal"

**Contenu proposé :**

```markdown
#### 3.8 Synchronisation iCal bidirectionnelle

Le système gère la synchronisation bidirectionnelle avec les plateformes externes (Booking.com, etc.) via le format iCal.

**Configuration iCal :**
- `GET /api/ical-config` - Liste toutes les configurations iCal
- `POST /api/ical-config` - Créer une configuration iCal
  - **Corps :**
    ```typescript
    {
      idHebergement: string;
      platform: PlateformeReservation;  // Enum: 'Booking.com', 'Directe', 'OpenPro', 'Xotelia', 'Unknown'
      importUrl?: string;                // URL pour importer les réservations
      exportUrl?: string;                 // URL générée par le backend pour exporter
    }
    ```
- `DELETE /api/ical-config/:id` - Supprimer une configuration

**Export iCal :**
- `GET /api/ical/export/:idHebergement/:platform` - Génère un flux iCal d'export
  - **Paramètres :**
    - `idHebergement` : ID de l'hébergement (string)
    - `platform` : Valeur de l'enum `PlateformeReservation` (ex: 'Booking.com', 'Xotelia')
  - **Filtrage :** Exclut automatiquement :
    - Les réservations de la plateforme cible (ex: pas de réservations Booking.com dans l'export Booking.com)
    - Les réservations avec `booking_status = 'Cancelled'`
  - **Format :** iCalendar standard (RFC 5545)
  - **Utilisation :** L'URL d'export est visible dans l'admin pour copier/coller dans la plateforme externe

**Import iCal :**
- Exécuté automatiquement par le cron job toutes les 15 minutes
- Lit les URLs d'import configurées
- Parse les événements iCal
- Compare avec les réservations existantes en DB
- Insère les nouvelles réservations
- Met à jour les réservations modifiées
- Marque comme annulées les réservations supprimées du flux

**Cron job :**
- Route : `GET /cron/sync-ical-imports`
- Fréquence : Toutes les 15 minutes (configuré dans `wrangler.toml`)
- Déclenchement : Automatique via Cloudflare Cron Triggers
```

### 7. Synchronisation au démarrage

**Section à ajouter :** Nouvelle section "3.9 Synchronisation au démarrage"

**Contenu proposé :**

```markdown
#### 3.9 Synchronisation au démarrage

Lors du démarrage du backend, plusieurs opérations sont exécutées dans un ordre spécifique pour garantir la cohérence :

**Ordre d'exécution :**
1. Vérification des hébergements (prérequis pour les étapes suivantes)
2. Synchronisation des plans tarifaires (prérequis pour les liens)
3. Synchronisation des liens plans tarifaires/hébergements (nécessite hébergements et plans tarifaires)
4. Synchronisation des réservations OpenPro (peut être exécutée en parallèle)
5. Export des données d'hébergements vers OpenPro (en dernier, après que tout soit synchronisé)

**1. Vérification des hébergements :**
- Fonction : `verifyAccommodationsOnStartup()` (à implémenter)
- Comportement :
  1. Charge tous les hébergements depuis la DB (table `accommodations`)
  2. Fetche tous les hébergements depuis OpenPro via `listAccommodations(SUPPLIER_ID)`
  3. Pour chaque hébergement en DB avec un ID OpenPro :
     - Vérifie qu'il existe dans OpenPro
     - Si absent dans OpenPro : enregistre un avertissement pour l'admin
  4. **Note importante :** L'API OpenPro ne permet pas de créer un hébergement, donc on ne peut que vérifier et avertir
  5. Les avertissements sont loggés et peuvent être exposés via un endpoint de statut pour l'interface admin

**2. Synchronisation des plans tarifaires :**
- Fonction : `syncRateTypesOnStartup()` (à implémenter)
- Comportement :
  1. Charge tous les plans tarifaires depuis la DB (table `rate_types`)
  2. Fetche tous les plans tarifaires depuis OpenPro via `listRateTypes(SUPPLIER_ID)`
  3. Pour chaque plan tarifaire présent en DB mais absent d'OpenPro :
     - Crée automatiquement dans OpenPro via `openProClient.createRateType()`
  4. Garantit que OpenPro est synchronisé avec la DB backend au démarrage

**3. Synchronisation des liens plans tarifaires/hébergements :**
- Fonction : `syncRateTypeLinksOnStartup()` (à implémenter)
- Comportement :
  1. Charge tous les liens depuis la DB (table `accommodation_rate_type_links`)
  2. Pour chaque hébergement avec un ID OpenPro :
     - Fetche les liens depuis OpenPro via `listAccommodationRateTypeLinks()`
     - Compare avec les liens en DB
     - Pour chaque lien présent en DB mais absent dans OpenPro :
       - Crée automatiquement le lien dans OpenPro via `linkRateTypeToAccommodation()`
     - Pour chaque lien présent dans OpenPro mais absent en DB :
       - Optionnel : peut être supprimé d'OpenPro ou laissé tel quel (selon la stratégie)
  3. Force tout écart dans OpenPro pour garantir la cohérence

**4. Synchronisation des réservations OpenPro :**
- Fonction : `syncOpenProBookingsOnStartup()`
- Comportement :
  1. Récupère toutes les réservations OpenPro via `listBookings(SUPPLIER_ID)`
  2. Pour chaque réservation OpenPro :
     - Si absente en DB : insère avec `booking_status = 'Confirmed'`
     - Si présente et `booking_status = 'Cancelled'` : conserve (ne pas réactiver)
     - Si présente et dates différentes : conserve les dates de la DB
     - Sinon : met à jour les autres champs
  3. Pour chaque réservation en DB avec `reservation_platform = 'OpenPro'` :
     - Si absente dans OpenPro et `booking_status !== 'Cancelled'` : marque comme `booking_status = 'Cancelled'`
  4. Met à jour automatiquement `booking_status = 'Past'` pour les réservations dont la date de départ est passée

**5. Export des données d'hébergements vers OpenPro :**
- Fonction : `exportAccommodationDataOnStartup()`
- Comportement :
  1. Charge tous les hébergements depuis la DB
  2. Pour chaque hébergement avec un ID OpenPro :
     - Charge les données de tarifs et stock depuis la DB
     - Transforme au format OpenPro
     - Exporte via `openProClient.setRates()` et `openProClient.updateStock()`

**Exécution :**
- Utilise `executionCtx.waitUntil()` pour ne pas bloquer le démarrage
- Les erreurs sont loggées mais n'empêchent pas le démarrage du backend
```

### 8. Mise à jour des routes suppliers

**Section à modifier :** Section 3.1 "Routes fournisseurs"

**Contenu à ajouter pour chaque route modifiée :**

```markdown
#### 3.1.2 Tarifs (modifié)

- `GET /api/suppliers/:idFournisseur/accommodations/:idHebergement/rates` - Récupérer les tarifs
  - **Changement :** Charge maintenant depuis la DB backend uniquement (plus depuis OpenPro)
  - Les données sont stockées dans `accommodation_data` et `accommodation_stock`

#### 3.1.3 Stock (modifié)

- `GET /api/suppliers/:idFournisseur/accommodations/:idHebergement/stock` - Récupérer le stock
  - **Changement :** Charge maintenant depuis la DB backend uniquement
- `POST /api/suppliers/:idFournisseur/accommodations/:idHebergement/stock` - Mettre à jour le stock
  - **Changement :** 
    1. Sauvegarde d'abord en DB via `saveAccommodationStock()`
    2. Export ensuite vers OpenPro via `openProClient.updateStock()`
  - **Validation :** `idFournisseur` doit correspondre à `SUPPLIER_ID`

#### 3.1.4 Types de tarifs (modifié)

- `GET /api/suppliers/:idFournisseur/rate-types` - Liste des types de tarifs
  - **Changement :** Charge depuis la DB backend (table `rate_types`)
- `POST /api/suppliers/:idFournisseur/rate-types` - Créer un type de tarif
  - **Changement :**
    1. Sauvegarde d'abord en DB via `saveRateType()`
    2. Export ensuite vers OpenPro automatiquement via `openProClient.createRateType()`
- `PUT /api/suppliers/:idFournisseur/rate-types/:idTypeTarif` - Modifier un type de tarif
  - **Changement :**
    1. Met à jour dans OpenPro
    2. Met à jour en DB
- `DELETE /api/suppliers/:idFournisseur/rate-types/:idTypeTarif` - Supprimer un type de tarif
  - **Changement :**
    1. Supprime dans OpenPro
    2. Supprime en DB

**Synchronisation au démarrage :**
- Le backend charge tous les plans tarifaires depuis la DB
- Le backend fetche tous les plans tarifaires depuis OpenPro
- Pour chaque plan tarifaire présent en DB mais absent d'OpenPro, le backend le crée automatiquement dans OpenPro
- Le backend synchronise également les liens plans tarifaires/hébergements (voir section 3.9)
- Garantit que OpenPro est synchronisé avec la DB backend au démarrage

#### 3.1.7 Mise à jour en bulk (modifié)

- `POST /api/suppliers/:idFournisseur/bulk-update` - Sauvegarder les modifications
  - **Changement :**
    1. Sauvegarde chaque date en DB via `saveAccommodationData()`
    2. Transforme et exporte vers OpenPro via `openProClient.setRates()`
    3. Appelle `exportAccommodationDataToOpenPro()` pour synchronisation complète

#### 3.1.8 Réservations (nouveau)

- `GET /api/suppliers/:idFournisseur/local-bookings` - Liste toutes les réservations
  - **Changement :** Retourne toutes les réservations (toutes plateformes) depuis la DB
  - **Champs inclus :** `reservation_platform`, `booking_status`
  - **Validation :** `idFournisseur` doit correspondre à `SUPPLIER_ID`
```

### 9. Schéma de base de données

**Section à ajouter :** Nouvelle section "5.3 Schéma de base de données D1"

**Contenu proposé :**

```markdown
### 5.3 Schéma de base de données D1

**Nouvelles tables :**

1. **`accommodations`** - Hébergements
   - `id` (TEXT PRIMARY KEY) - ID interne (correspond à l'ID Directe)
   - `nom` (TEXT NOT NULL) - Nom de l'hébergement
   - `id_openpro` (INTEGER) - ID OpenPro (optionnel)
   - `date_creation`, `date_modification`

2. **`accommodation_external_ids`** - Identifiants externes
   - `id_hebergement` (TEXT) - Référence à accommodations.id
   - `platform` (TEXT) - Plateforme ('Booking.com', 'Xotelia', etc.)
   - `external_id` (TEXT) - ID externe
   - Index unique sur `(id_hebergement, platform)`

3. **`ical_sync_config`** - Configuration iCal
   - `id_hebergement` (TEXT) - Référence à accommodations.id
   - `platform` (TEXT) - Plateforme
   - `import_url` (TEXT) - URL pour importer
   - `export_url` (TEXT) - URL générée pour exporter
   - Index unique sur `(id_hebergement, platform)`

4. **`rate_types`** - Plans tarifaires
   - `id_type_tarif` (INTEGER NOT NULL) - ID OpenPro
   - `libelle` (TEXT) - JSON multilingue
   - `description` (TEXT) - JSON multilingue
   - `ordre` (INTEGER)
   - Index unique sur `id_type_tarif`

5. **`accommodation_rate_type_links`** - Liaisons hébergements/plans tarifaires
   - `id_hebergement` (TEXT) - Référence à accommodations.id
   - `id_type_tarif` (INTEGER) - Référence à rate_types.id_type_tarif
   - Index unique sur `(id_hebergement, id_type_tarif)`

6. **`accommodation_data`** - Données de tarifs par date
   - `id_hebergement` (TEXT) - Référence à accommodations.id
   - `id_type_tarif` (INTEGER) - Référence à rate_types.id_type_tarif
   - `date` (TEXT) - Date (YYYY-MM-DD)
   - `prix_nuitee` (REAL) - Prix à la nuitée
   - `arrivee_autorisee` (BOOLEAN) - Arrivée autorisée
   - `depart_autorise` (BOOLEAN) - Départ autorisé
   - `duree_minimale` (INTEGER) - Durée minimale
   - `duree_maximale` (INTEGER) - Durée maximale
   - Index unique sur `(id_hebergement, id_type_tarif, date)`

7. **`accommodation_stock`** - Stock par date
   - `id_hebergement` (TEXT) - Référence à accommodations.id
   - `date` (TEXT) - Date (YYYY-MM-DD)
   - `stock` (INTEGER) - Stock disponible
   - Index unique sur `(id_hebergement, date)`

**Modifications à `local_bookings` :**
- Ajout `reservation_platform` (TEXT NOT NULL DEFAULT 'Directe') - Plateforme d'origine
- Ajout `booking_status` (TEXT NOT NULL DEFAULT 'Quote') - État de la réservation
- Modification `id_hebergement` (TEXT) - Référence à accommodations.id
- Le champ `reference` existant est utilisé pour les identifiants externes (idDossier OpenPro, UID iCal)
- Index sur `reservation_platform`, `booking_status`, et `(reference, reservation_platform)`
```

### 10. Routes cron mises à jour

**Section à modifier :** Section 3.4 "Routes cron"

**Contenu à ajouter :**

```markdown
#### 3.4.2 Synchronisation iCal (nouveau)

- `GET /cron/sync-ical-imports` - Synchronisation automatique des imports iCal
  - **Déclenchement :** Automatique via Cloudflare Cron (toutes les 15 minutes)
  - **Fréquence :** `*/15 * * * *` (configuré dans `wrangler.toml`)
  - **Comportement :**
    1. Charge toutes les configurations iCal actives (avec `import_url`)
    2. Pour chaque configuration :
       - Télécharge le flux iCal depuis `import_url`
       - Parse les événements
       - Compare avec les réservations existantes en DB (par `reference` et `reservation_platform`)
       - Insère les nouvelles réservations
       - Met à jour les réservations modifiées
       - Marque comme annulées les réservations supprimées du flux
  - **Logs :** Enregistre le nombre de réservations importées/mises à jour
```

---

## Résumé des sections à modifier/ajouter

1. ✅ Section 1.1 - Ajouter le nouveau paradigme
2. ✅ Section 1.4 - Nouvelle section "Paradigme de données"
3. ✅ Section 2.4 - Nouvelle section "Configuration du fournisseur"
4. ✅ Section 3.1.0 - Nouvelle sous-section "Hébergements"
5. ✅ Section 3.1.2 à 3.1.8 - Modifier les routes existantes
6. ✅ Section 3.2 - Modifier "Routes webhooks"
7. ✅ Section 3.7 - Nouvelle section "Réservations multi-plateformes"
8. ✅ Section 3.8 - Nouvelle section "Synchronisation iCal"
9. ✅ Section 3.9 - Nouvelle section "Synchronisation au démarrage"
10. ✅ Section 3.4.2 - Ajouter "Synchronisation iCal" dans cron
11. ✅ Section 5.3 - Nouvelle section "Schéma de base de données D1"

