/**
 * Service de gestion des données d'hébergement en DB
 * 
 * Ce service gère les tarifs par date et plan tarifaire, ainsi que le stock,
 * et exporte ces données vers OpenPro.
 */

import type { Env } from '../../index.js';
import { getOpenProClient } from '../openProClient.js';
import type { RequeteTarifModif, TarifModif } from '@openpro-api-react/client/types.js';
import { loadAccommodationRateTypeLinks, findRateTypeIdByOpenProId } from './rateTypeDbService.js';

/**
 * Interface pour une ligne de données tarifaires en DB
 */
interface AccommodationDataRow {
  id: string;
  id_hebergement: string;
  id_rate_type: string;  // UUID interne (référence rate_types.id)
  id_type_tarif: number | null;  // ID OpenPro (peut être NULL)
  date: string;
  prix_nuitee: number | null;
  arrivee_autorisee: boolean | null;
  depart_autorise: boolean | null;
  duree_minimale: number | null;
  duree_maximale: number | null;
  date_creation: string;
  date_modification: string;
}

/**
 * Interface pour une ligne de stock en DB
 */
interface AccommodationStockRow {
  id: string;
  id_hebergement: string;
  date: string;
  stock: number | null;
  date_creation: string;
  date_modification: string;
}

/**
 * Sauvegarde les données tarifaires pour une date et un plan tarifaire
 */
export async function saveAccommodationData(
  idHebergement: string,
  idTypeTarif: number,
  date: string,
  data: {
    prixNuitee?: number;
    arriveeAutorisee?: boolean;
    departAutorise?: boolean;
    dureeMinimale?: number;
    dureeMaximale?: number;
  },
  env: Env
): Promise<void> {
  // Trouver l'ID interne du plan tarifaire depuis son ID OpenPro
  const idRateType = await findRateTypeIdByOpenProId(idTypeTarif, env);
  if (!idRateType) {
    throw new Error(`Rate type with OpenPro ID ${idTypeTarif} not found`);
  }

  const now = new Date().toISOString();

  // Vérifier si les données existent déjà (utiliser id_rate_type)
  const existing = await env.DB.prepare(`
    SELECT id FROM accommodation_data
    WHERE id_hebergement = ? AND id_rate_type = ? AND date = ?
  `).bind(idHebergement, idRateType, date).first();

  if (existing) {
    // Mettre à jour
    const updates: string[] = [];
    const values: any[] = [];

    if (data.prixNuitee !== undefined) {
      updates.push('prix_nuitee = ?');
      values.push(data.prixNuitee);
    }
    if (data.arriveeAutorisee !== undefined) {
      updates.push('arrivee_autorisee = ?');
      values.push(data.arriveeAutorisee ? 1 : 0);
    }
    if (data.departAutorise !== undefined) {
      updates.push('depart_autorise = ?');
      values.push(data.departAutorise ? 1 : 0);
    }
    if (data.dureeMinimale !== undefined) {
      updates.push('duree_minimale = ?');
      values.push(data.dureeMinimale);
    }
    if (data.dureeMaximale !== undefined) {
      updates.push('duree_maximale = ?');
      values.push(data.dureeMaximale);
    }

    if (updates.length > 0) {
      updates.push('date_modification = ?');
      values.push(now);
      values.push(idHebergement, idRateType, date);

      await env.DB.prepare(`
        UPDATE accommodation_data
        SET ${updates.join(', ')}
        WHERE id_hebergement = ? AND id_rate_type = ? AND date = ?
      `).bind(...values).run();
    }
  } else {
    // Créer (utiliser id_rate_type)
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO accommodation_data (
        id, id_hebergement, id_rate_type, id_type_tarif, date,
        prix_nuitee, arrivee_autorisee, depart_autorise,
        duree_minimale, duree_maximale,
        date_creation, date_modification
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      idHebergement,
      idRateType,
      idTypeTarif,  // Garder pour compatibilité
      date,
      data.prixNuitee || null,
      data.arriveeAutorisee !== undefined ? (data.arriveeAutorisee ? 1 : 0) : null,
      data.departAutorise !== undefined ? (data.departAutorise ? 1 : 0) : null,
      data.dureeMinimale || null,
      data.dureeMaximale || null,
      now,
      now
    ).run();
  }
}

/**
 * Charge les données tarifaires pour un hébergement et une plage de dates
 */
export async function loadAccommodationData(
  idHebergement: string,
  dateDebut: string,
  dateFin: string,
  env: Env
): Promise<Record<string, Record<number, AccommodationDataRow>>> {
  // Joindre avec rate_types pour obtenir id_type_tarif
  const result = await env.DB.prepare(`
    SELECT ad.*, rt.id_type_tarif
    FROM accommodation_data ad
    INNER JOIN rate_types rt ON rt.id = ad.id_rate_type
    WHERE ad.id_hebergement = ? AND ad.date >= ? AND ad.date <= ?
    ORDER BY ad.date ASC, rt.id_type_tarif ASC
  `).bind(idHebergement, dateDebut, dateFin).all();

  if (!result.results || result.results.length === 0) {
    return {};
  }

  const data: Record<string, Record<number, AccommodationDataRow>> = {};
  for (const row of result.results as unknown as Array<AccommodationDataRow & { id_type_tarif: number | null }>) {
    if (!row.id_type_tarif) {
      // Ignorer les plans tarifaires sans ID OpenPro (ne peuvent pas être exportés)
      continue;
    }
    if (!data[row.date]) {
      data[row.date] = {};
    }
    data[row.date][row.id_type_tarif] = row;
  }

  return data;
}

/**
 * Sauvegarde le stock pour une date
 */
export async function saveAccommodationStock(
  idHebergement: string,
  date: string,
  stock: number,
  env: Env
): Promise<void> {
  const now = new Date().toISOString();

  // Vérifier si le stock existe déjà
  const existing = await env.DB.prepare(`
    SELECT id FROM accommodation_stock
    WHERE id_hebergement = ? AND date = ?
  `).bind(idHebergement, date).first();

  if (existing) {
    // Mettre à jour
    await env.DB.prepare(`
      UPDATE accommodation_stock
      SET stock = ?, date_modification = ?
      WHERE id_hebergement = ? AND date = ?
    `).bind(stock, now, idHebergement, date).run();
  } else {
    // Créer
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO accommodation_stock (id, id_hebergement, date, stock, date_creation, date_modification)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, idHebergement, date, stock, now, now).run();
  }
}

/**
 * Charge le stock pour un hébergement et une plage de dates
 */
export async function loadAccommodationStock(
  idHebergement: string,
  dateDebut: string,
  dateFin: string,
  env: Env
): Promise<Record<string, number>> {
  const result = await env.DB.prepare(`
    SELECT date, stock FROM accommodation_stock
    WHERE id_hebergement = ? AND date >= ? AND date <= ?
    ORDER BY date ASC
  `).bind(idHebergement, dateDebut, dateFin).all();

  if (!result.results || result.results.length === 0) {
    return {};
  }

  const stock: Record<string, number> = {};
  for (const row of result.results as unknown as AccommodationStockRow[]) {
    stock[row.date] = row.stock || 0;
  }

  return stock;
}

/**
 * Exporte les données d'hébergement vers OpenPro
 * 
 * Cette fonction charge toutes les données tarifaires et stock pour un hébergement,
 * les groupe par plan tarifaire, et les exporte vers OpenPro via l'API setRates.
 */
export async function exportAccommodationDataToOpenPro(
  idFournisseur: number,
  idOpenPro: number | string,
  idHebergement: string,
  env: Env
): Promise<void> {
  // Convertir idOpenPro en number si c'est une string
  const idOpenProNum = typeof idOpenPro === 'string' ? parseInt(idOpenPro, 10) : idOpenPro;
  if (isNaN(idOpenProNum)) {
    throw new Error(`Invalid OpenPro ID: ${idOpenPro}`);
  }
  // Charger les plans tarifaires liés à cet hébergement
  const rateTypeIds = await loadAccommodationRateTypeLinks(idHebergement, env);

  if (rateTypeIds.length === 0) {
    console.log(`[Export] No rate types linked to accommodation ${idHebergement}, skipping export`);
    return;
  }

  // Charger toutes les données tarifaires (on prend une plage large pour être sûr)
  const dateDebut = new Date().toISOString().split('T')[0];
  const dateFin = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // +1 an

  const data = await loadAccommodationData(idHebergement, dateDebut, dateFin, env);

  // Grouper les données par plan tarifaire et créer les périodes
  for (const idTypeTarif of rateTypeIds) {
    const datesForRateType: Array<{
      date: string;
      prixNuitee?: number;
      arriveeAutorisee?: boolean;
      departAutorise?: boolean;
      dureeMinimale?: number | null;
    }> = [];

    // Collecter toutes les dates avec des données pour ce plan tarifaire
    for (const [date, rateData] of Object.entries(data)) {
      const rateDataForType = rateData[idTypeTarif];
      if (rateDataForType) {
        // SQLite stocke les booleans comme 0/1, donc on doit gérer les deux cas
        const arriveeAutorisee = rateDataForType.arrivee_autorisee === true || 
          (typeof rateDataForType.arrivee_autorisee === 'number' && rateDataForType.arrivee_autorisee === 1);
        const departAutorise = rateDataForType.depart_autorise === true || 
          (typeof rateDataForType.depart_autorise === 'number' && rateDataForType.depart_autorise === 1);
        
        datesForRateType.push({
          date,
          prixNuitee: rateDataForType.prix_nuitee || undefined,
          arriveeAutorisee: arriveeAutorisee || undefined,
          departAutorise: departAutorise || undefined,
          dureeMinimale: rateDataForType.duree_minimale
        });
      }
    }

    if (datesForRateType.length === 0) {
      continue;
    }

    // Trier les dates
    datesForRateType.sort((a, b) => a.date.localeCompare(b.date));

    // Grouper en périodes contiguës avec les mêmes valeurs
    const periods: Array<{
      debut: string;
      fin: string;
      prixNuitee?: number;
      arriveeAutorisee?: boolean;
      departAutorise?: boolean;
      dureeMinimale?: number | null;
    }> = [];

    let currentPeriod: {
      debut: string;
      fin: string;
      prixNuitee?: number;
      arriveeAutorisee?: boolean;
      departAutorise?: boolean;
      dureeMinimale?: number | null;
    } | null = null;

    for (const dateData of datesForRateType) {
      const key = `${dateData.prixNuitee ?? 'none'}-${dateData.arriveeAutorisee ?? 'none'}-${dateData.departAutorise ?? 'none'}-${dateData.dureeMinimale ?? 'none'}`;

      if (currentPeriod === null) {
        currentPeriod = {
          debut: dateData.date,
          fin: dateData.date,
          prixNuitee: dateData.prixNuitee,
          arriveeAutorisee: dateData.arriveeAutorisee,
          departAutorise: dateData.departAutorise,
          dureeMinimale: dateData.dureeMinimale
        };
      } else {
        const currentKey = `${currentPeriod.prixNuitee ?? 'none'}-${currentPeriod.arriveeAutorisee ?? 'none'}-${currentPeriod.departAutorise ?? 'none'}-${currentPeriod.dureeMinimale ?? 'none'}`;

        // Vérifier si on peut étendre la période
        if (key === currentKey && isConsecutiveDate(currentPeriod.fin, dateData.date)) {
          currentPeriod.fin = dateData.date;
        } else {
          periods.push(currentPeriod);
          currentPeriod = {
            debut: dateData.date,
            fin: dateData.date,
            prixNuitee: dateData.prixNuitee,
            arriveeAutorisee: dateData.arriveeAutorisee,
            departAutorise: dateData.departAutorise,
            dureeMinimale: dateData.dureeMinimale
          };
        }
      }
    }

    if (currentPeriod !== null) {
      periods.push(currentPeriod);
    }

    // Transformer en format OpenPro
    const tarifModifs: TarifModif[] = periods
      .map(period => {
        const modif: TarifModif = {
          debut: period.debut,
          fin: period.fin,
          idTypeTarif: idTypeTarif,
          ouvert: true, // Par défaut ouvert si on a des données
          dureeMin: period.dureeMinimale ?? 1, // Par défaut 1 si non défini
          dureeMax: 14, // Par défaut 14 jours
          arriveeAutorisee: period.arriveeAutorisee ?? true, // Par défaut autorisé
          departAutorise: period.departAutorise ?? true, // Par défaut autorisé
          tarifPax: {
            listeTarifPaxOccupation: period.prixNuitee !== undefined ? [
              {
                nbPers: 2,
                prix: period.prixNuitee
              }
            ] : []
          }
        };

        // Mettre à jour les valeurs si définies
        if (period.arriveeAutorisee !== undefined) {
          modif.arriveeAutorisee = period.arriveeAutorisee;
        }

        if (period.departAutorise !== undefined) {
          modif.departAutorise = period.departAutorise;
        }

        if (period.dureeMinimale !== undefined && period.dureeMinimale !== null) {
          modif.dureeMin = period.dureeMinimale;
        }

        return modif;
      })
      .filter(modif => modif.tarifPax || modif.arriveeAutorisee !== undefined || modif.departAutorise !== undefined || modif.dureeMin !== undefined);

    if (tarifModifs.length === 0) {
      continue;
    }

    // Exporter vers OpenPro
    const openProClient = getOpenProClient(env);
    const payload: RequeteTarifModif = {
      tarifs: tarifModifs
    };

    try {
      await openProClient.setRates(idFournisseur, idOpenProNum, payload);
      console.log(`[Export] Successfully exported rate type ${idTypeTarif} for accommodation ${idHebergement} (OpenPro ID: ${idOpenProNum})`);
    } catch (error) {
      console.error(`[Export] Failed to export rate type ${idTypeTarif} for accommodation ${idHebergement}:`, error);
      // Ne pas faire échouer l'export complet si un plan tarifaire échoue
    }
  }
}

/**
 * Vérifie si deux dates sont consécutives
 */
function isConsecutiveDate(date1: string, date2: string): boolean {
  const d1 = new Date(date1 + 'T00:00:00');
  const d2 = new Date(date2 + 'T00:00:00');
  const diffTime = d2.getTime() - d1.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays === 1;
}

