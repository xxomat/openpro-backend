/**
 * Types partagés pour l'API backend
 * 
 * Ce fichier contient les interfaces utilisées par les routes et services
 * du backend, correspondant aux structures de données exposées au frontend.
 * 
 * Convention : Toutes les interfaces sont préfixées avec "I" (ex: IAccommodation)
 * Les propriétés utilisent des noms camelCase en anglais.
 */

/**
 * Enum pour les plateformes de réservation
 */
export enum PlateformeReservation {
  BookingCom = 'Booking.com',
  Directe = 'Directe',
  OpenPro = 'OpenPro',
  Xotelia = 'Xotelia',
  Unknown = 'Unknown'
}

/**
 * Enum pour les états de réservation
 */
export enum BookingStatus {
  Quote = 'Quote',           // Intention de réservation, pas d'acompte payé
  Confirmed = 'Confirmed',   // Acompte de 30% payé
  Paid = 'Paid',             // Entièrement payée
  Cancelled = 'Cancelled',   // Annulée
  Past = 'Past'              // Jour de départ passé
}

/**
 * Interface pour un hébergement
 */
export interface IAccommodation {
  id: string;                    // ID interne dans la DB
  nom: string;                   // Nom de l'hébergement
  ids: Partial<Record<PlateformeReservation, string>>; // Map plateforme -> ID externe (OpenPro, Booking.com, etc.)
}

/**
 * Interface pour un hébergement (format legacy pour compatibilité)
 */
export interface IAccommodationLegacy {
  accommodationId: number;
  accommodationName: string;
}

export interface IRateType {
  rateTypeId: number;
  label?: unknown;
  description?: unknown; // Description complète au format multilingue (tableau ou objet)
  descriptionFr?: string; // Texte français uniquement (pour compatibilité)
  order?: number;
}

export interface IBookingDisplay {
  bookingId: number;
  accommodationId: number | string; // number pour compatibilité, string pour nouvelle structure
  arrivalDate: string; // YYYY-MM-DD
  departureDate: string;   // YYYY-MM-DD
  reference?: string; // Identifiant externe (idDossier OpenPro, UID iCal, etc.)
  clientName?: string;   // Nom du client (nom + prénom)
  clientTitle?: string; // Civilité du client (M, Mme, etc.)
  clientEmail?: string; // Email du client
  clientPhone?: string; // Téléphone du client
  clientNotes?: string; // Remarques/notes sur le client
  clientAddress?: string; // Adresse postale
  clientPostalCode?: string; // Code postal
  clientCity?: string; // Ville
  clientCountry?: string; // Pays
  clientBirthDate?: string; // Date de naissance (stocké mais non affiché dans tooltip)
  clientNationality?: string; // Nationalité (stocké mais non affiché dans tooltip)
  clientProfession?: string; // Profession (stocké mais non affiché dans tooltip)
  clientCompany?: string; // Nom de l'entreprise/société
  clientSiret?: string; // Numéro SIRET
  clientVat?: string; // Numéro de TVA intracommunautaire
  clientLanguage?: string; // Langue préférée (stocké mais non affiché dans tooltip)
  clientNewsletter?: boolean; // Consentement newsletter (stocké mais non affiché dans tooltip)
  clientTermsAccepted?: boolean; // Acceptation des CGV
  totalAmount?: number; // Prix total de la réservation
  numberOfPersons?: number; // Nombre de personnes
  numberOfNights?: number; // Nombre de nuits
  rateTypeLabel?: string; // Libellé du type de tarif
  currency?: string; // Devise du paiement (EUR, etc.)
  creationDate?: string; // Date de création du dossier
  reservationPlatform: PlateformeReservation; // Plateforme d'origine de la réservation (Unknown si non renseignée)
  bookingStatus: BookingStatus; // État de la réservation (Quote, Confirmed, Paid, Cancelled, Past)
  isPendingSync?: boolean; // true si réservation Direct locale en attente de synchronisation avec OpenPro
  isObsolete?: boolean; // true si réservation Direct supprimée localement mais toujours présente dans OpenPro
}

export interface ISupplierData {
  stock: Record<string, Record<string, number>>; // Clé: accommodationId (GUID DB)
  rates: Record<string, Record<string, Record<number, number>>>; // Clé: accommodationId (GUID DB)
  promo: Record<string, Record<string, boolean>>; // Clé: accommodationId (GUID DB)
  rateTypes: Record<string, Record<string, string[]>>; // Clé: accommodationId (GUID DB)
  minDuration: Record<string, Record<string, Record<number, number | null>>>; // Clé: accommodationId (GUID DB)
  arrivalAllowed: Record<string, Record<string, Record<number, boolean>>>; // Clé: accommodationId (GUID DB)
  rateTypeLabels: Record<number, string>;
  rateTypesList: IRateType[];
  bookings: Record<string, IBookingDisplay[]>; // Clé: accommodationId (GUID DB)
  /** Map des IDs de types de tarif liés par hébergement (clé: accommodationId (GUID DB), valeur: array de rateTypeId) */
  rateTypeLinksByAccommodation: Record<string, number[]>; // Clé: accommodationId (GUID DB)
}

export interface IRatesData {
  rates: Record<string, Record<number, number>>;
  promo: Record<string, boolean>;
  rateTypes: Record<string, string[]>;
  minDuration: Record<string, Record<number, number | null>>;
}

/**
 * Interface pour la configuration iCal
 */
export interface IIcalSyncConfig {
  id: string;
  idHebergement: string;
  platform: string;
  importUrl?: string;
  exportUrl?: string;
  dateCreation: string;
  dateModification: string;
}

/**
 * Interface pour la réponse API de gestion iCal
 */
export interface IIcalSyncConfigResponse {
  configs: IIcalSyncConfig[];
}
