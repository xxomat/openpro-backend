/**
 * Classes pour les données exposées au frontend avec class-transformer
 * 
 * Ce fichier contient les classes avec décorateurs pour mapper les noms JSON
 * vers les noms de propriétés TypeScript en camelCase.
 * 
 * IMPORTANT : Ces classes implémentent les interfaces préfixées "I" définies dans api.ts
 * Le code doit toujours utiliser les interfaces, jamais les classes directement.
 */

import 'reflect-metadata';
import { Expose, Transform } from 'class-transformer';
import type { IAccommodation, IRateType, IBookingDisplay, ISupplierData, IRatesData } from './api.js';
import { PlateformeReservation } from './api.js';

/**
 * Structure d'un hébergement
 */
export class AccommodationClass implements IAccommodation {
  @Expose({ name: 'idHebergement' })
  accommodationId!: number;

  @Expose({ name: 'nomHebergement' })
  accommodationName!: string;
}

/**
 * Structure d'un type de tarif
 */
export class RateTypeClass implements IRateType {
  @Expose({ name: 'idTypeTarif' })
  rateTypeId!: number;

  @Expose({ name: 'libelle' })
  label?: unknown;

  @Expose({ name: 'descriptionFr' })
  descriptionFr?: string;

  @Expose({ name: 'ordre' })
  order?: number;
}

/**
 * Structure d'une réservation affichée
 */
export class BookingDisplayClass implements IBookingDisplay {
  @Expose({ name: 'idDossier' })
  bookingId!: number;

  @Expose({ name: 'idHebergement' })
  accommodationId!: number;

  @Expose({ name: 'dateArrivee' })
  arrivalDate!: string; // YYYY-MM-DD

  @Expose({ name: 'dateDepart' })
  departureDate!: string;   // YYYY-MM-DD

  @Expose({ name: 'reference' })
  reference?: string;

  @Expose({ name: 'clientNom' })
  clientName?: string;

  @Expose({ name: 'clientCivilite' })
  clientTitle?: string;

  @Expose({ name: 'clientEmail' })
  clientEmail?: string;

  @Expose({ name: 'clientTelephone' })
  clientPhone?: string;

  @Expose({ name: 'clientRemarques' })
  clientNotes?: string;

  @Expose({ name: 'clientAdresse' })
  clientAddress?: string;

  @Expose({ name: 'clientCodePostal' })
  clientPostalCode?: string;

  @Expose({ name: 'clientVille' })
  clientCity?: string;

  @Expose({ name: 'clientPays' })
  clientCountry?: string;

  @Expose({ name: 'clientDateNaissance' })
  clientBirthDate?: string;

  @Expose({ name: 'clientNationalite' })
  clientNationality?: string;

  @Expose({ name: 'clientProfession' })
  clientProfession?: string;

  @Expose({ name: 'clientSociete' })
  clientCompany?: string;

  @Expose({ name: 'clientSiret' })
  clientSiret?: string;

  @Expose({ name: 'clientTva' })
  clientVat?: string;

  @Expose({ name: 'clientLangue' })
  clientLanguage?: string;

  @Expose({ name: 'clientNewsletter' })
  clientNewsletter?: boolean;

  @Expose({ name: 'clientCgvAcceptees' })
  clientTermsAccepted?: boolean;

  @Expose({ name: 'montantTotal' })
  totalAmount?: number;

  @Expose({ name: 'nbPersonnes' })
  numberOfPersons?: number;

  @Expose({ name: 'nbNuits' })
  numberOfNights?: number;

  @Expose({ name: 'typeTarifLibelle' })
  rateTypeLabel?: string;

  @Expose({ name: 'devise' })
  currency?: string;

  @Expose({ name: 'dateCreation' })
  creationDate?: string;

  @Expose({ name: 'plateformeReservation' })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value as PlateformeReservation;
    }
    return PlateformeReservation.Unknown;
  })
  reservationPlatform!: PlateformeReservation;

  @Expose({ name: 'isPendingSync' })
  isPendingSync?: boolean;

  @Expose({ name: 'isObsolete' })
  isObsolete?: boolean;
}

/**
 * Structure des données d'un fournisseur
 * 
 * Note: Cette classe ne nécessite pas de transformation car les données
 * sont déjà structurées en Records. Elle est définie pour cohérence.
 */
export class SupplierDataClass implements ISupplierData {
  stock!: Record<number, Record<string, number>>;
  rates!: Record<number, Record<string, Record<number, number>>>;
  promo!: Record<number, Record<string, boolean>>;
  rateTypes!: Record<number, Record<string, string[]>>;
  minDuration!: Record<number, Record<string, Record<number, number | null>>>;
  arrivalAllowed!: Record<number, Record<string, Record<number, boolean>>>;
  rateTypeLabels!: Record<number, string>;
  rateTypesList!: IRateType[];
  bookings!: Record<number, IBookingDisplay[]>;
  rateTypeLinksByAccommodation!: Record<number, number[]>;
}

/**
 * Structure des données de tarifs
 * 
 * Note: Cette classe ne nécessite pas de transformation car les données
 * sont déjà structurées en Records. Elle est définie pour cohérence.
 */
export class RatesDataClass implements IRatesData {
  rates!: Record<string, Record<number, number>>;
  promo!: Record<string, boolean>;
  rateTypes!: Record<string, string[]>;
  minDuration!: Record<string, Record<number, number | null>>;
}

