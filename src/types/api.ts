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
  descriptionFr?: string;
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
  stock: Record<number, Record<string, number>>;
  rates: Record<number, Record<string, Record<number, number>>>;
  promo: Record<number, Record<string, boolean>>;
  rateTypes: Record<number, Record<string, string[]>>;
  minDuration: Record<number, Record<string, Record<number, number | null>>>;
  arrivalAllowed: Record<number, Record<string, Record<number, boolean>>>;
  rateTypeLabels: Record<number, string>;
  rateTypesList: IRateType[];
  bookings: Record<number, IBookingDisplay[]>;
  /** Map des IDs de types de tarif liés par hébergement (clé: accommodationId, valeur: array de rateTypeId) */
  rateTypeLinksByAccommodation: Record<number, number[]>;
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
