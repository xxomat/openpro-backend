/**
 * Service de gestion des plans tarifaires en DB
 * 
 * Ce service gère les plans tarifaires stockés en DB, leurs liaisons avec les hébergements,
 * et la synchronisation avec OpenPro.
 */

import type { Env } from '../../index.js';
import type { IRateType } from '../../types/api.js';

/**
 * Interface pour une ligne de plan tarifaire en DB
 */
interface RateTypeRow {
  id: string;
  id_type_tarif: number;
  libelle: string | null;
  description: string | null;
  ordre: number | null;
  date_creation: string;
  date_modification: string;
}

/**
 * Interface pour une liaison hébergement - plan tarifaire en DB
 */
interface RateTypeLinkRow {
  id: string;
  id_hebergement: string;
  id_type_tarif: number;
  date_creation: string;
}

/**
 * Sauvegarde un plan tarifaire en DB
 */
export async function saveRateType(
  data: {
    idTypeTarif: number;
    libelle?: string; // JSON pour multilingue
    description?: string; // JSON pour multilingue
    ordre?: number;
  },
  env: Env
): Promise<void> {
  const now = new Date().toISOString();

  // Vérifier si le plan tarifaire existe déjà
  const existing = await env.DB.prepare(`
    SELECT id FROM rate_types
    WHERE id_type_tarif = ?
  `).bind(data.idTypeTarif).first();

  if (existing) {
    // Mettre à jour
    const updates: string[] = [];
    const values: any[] = [];

    if (data.libelle !== undefined) {
      updates.push('libelle = ?');
      values.push(data.libelle);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.ordre !== undefined) {
      updates.push('ordre = ?');
      values.push(data.ordre);
    }

    if (updates.length > 0) {
      updates.push('date_modification = ?');
      values.push(now);
      values.push(data.idTypeTarif);

      await env.DB.prepare(`
        UPDATE rate_types
        SET ${updates.join(', ')}
        WHERE id_type_tarif = ?
      `).bind(...values).run();
    }
  } else {
    // Créer
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO rate_types (id, id_type_tarif, libelle, description, ordre, date_creation, date_modification)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      data.idTypeTarif,
      data.libelle || null,
      data.description || null,
      data.ordre || null,
      now,
      now
    ).run();
  }
}

/**
 * Charge tous les plans tarifaires
 */
export async function loadRateTypes(
  env: Env
): Promise<IRateType[]> {
  const result = await env.DB.prepare(`
    SELECT * FROM rate_types
    ORDER BY ordre ASC, id_type_tarif ASC
  `).all();

  if (!result.results || result.results.length === 0) {
    return [];
  }

  return (result.results as RateTypeRow[]).map(row => {
    // Parser le libellé JSON si présent
    let label: unknown = undefined;
    if (row.libelle) {
      try {
        label = JSON.parse(row.libelle);
      } catch {
        label = row.libelle;
      }
    }

    return {
      rateTypeId: row.id_type_tarif,
      label,
      descriptionFr: row.description ? (() => {
        try {
          const desc = JSON.parse(row.description);
          return typeof desc === 'string' ? desc : desc.fr || desc.FR || undefined;
        } catch {
          return row.description;
        }
      })() : undefined,
      order: row.ordre || undefined
    };
  });
}

/**
 * Supprime un plan tarifaire
 */
export async function deleteRateType(
  idTypeTarif: number,
  env: Env
): Promise<boolean> {
  // Supprimer d'abord les liaisons
  await env.DB.prepare(`
    DELETE FROM accommodation_rate_type_links
    WHERE id_type_tarif = ?
  `).bind(idTypeTarif).run();

  // Supprimer les données tarifaires
  await env.DB.prepare(`
    DELETE FROM accommodation_data
    WHERE id_type_tarif = ?
  `).bind(idTypeTarif).run();

  // Supprimer le plan tarifaire
  const result = await env.DB.prepare(`
    DELETE FROM rate_types
    WHERE id_type_tarif = ?
  `).bind(idTypeTarif).run();

  return result.success && (result.meta.changes || 0) > 0;
}

/**
 * Lie un plan tarifaire à un hébergement
 */
export async function linkRateTypeToAccommodation(
  idHebergement: string,
  idTypeTarif: number,
  env: Env
): Promise<void> {
  // Vérifier si la liaison existe déjà
  const existing = await env.DB.prepare(`
    SELECT id FROM accommodation_rate_type_links
    WHERE id_hebergement = ? AND id_type_tarif = ?
  `).bind(idHebergement, idTypeTarif).first();

  if (!existing) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO accommodation_rate_type_links (id, id_hebergement, id_type_tarif, date_creation)
      VALUES (?, ?, ?, ?)
    `).bind(id, idHebergement, idTypeTarif, now).run();
  }
}

/**
 * Supprime la liaison entre un plan tarifaire et un hébergement
 */
export async function unlinkRateTypeFromAccommodation(
  idHebergement: string,
  idTypeTarif: number,
  env: Env
): Promise<void> {
  // Supprimer les données tarifaires associées
  await env.DB.prepare(`
    DELETE FROM accommodation_data
    WHERE id_hebergement = ? AND id_type_tarif = ?
  `).bind(idHebergement, idTypeTarif).run();

  // Supprimer la liaison
  await env.DB.prepare(`
    DELETE FROM accommodation_rate_type_links
    WHERE id_hebergement = ? AND id_type_tarif = ?
  `).bind(idHebergement, idTypeTarif).run();
}

/**
 * Charge les liaisons plans tarifaires - hébergements
 */
export async function loadAccommodationRateTypeLinks(
  idHebergement: string,
  env: Env
): Promise<number[]> {
  const result = await env.DB.prepare(`
    SELECT id_type_tarif FROM accommodation_rate_type_links
    WHERE id_hebergement = ?
    ORDER BY id_type_tarif ASC
  `).bind(idHebergement).all();

  if (!result.results || result.results.length === 0) {
    return [];
  }

  return (result.results as RateTypeLinkRow[]).map(row => row.id_type_tarif);
}

/**
 * Charge tous les plans tarifaires liés à un hébergement
 */
export async function loadRateTypesForAccommodation(
  idHebergement: string,
  env: Env
): Promise<IRateType[]> {
  const result = await env.DB.prepare(`
    SELECT rt.* FROM rate_types rt
    INNER JOIN accommodation_rate_type_links artl ON rt.id_type_tarif = artl.id_type_tarif
    WHERE artl.id_hebergement = ?
    ORDER BY rt.ordre ASC, rt.id_type_tarif ASC
  `).bind(idHebergement).all();

  if (!result.results || result.results.length === 0) {
    return [];
  }

  return (result.results as RateTypeRow[]).map(row => {
    let label: unknown = undefined;
    if (row.libelle) {
      try {
        label = JSON.parse(row.libelle);
      } catch {
        label = row.libelle;
      }
    }

    return {
      rateTypeId: row.id_type_tarif,
      label,
      descriptionFr: row.description ? (() => {
        try {
          const desc = JSON.parse(row.description);
          return typeof desc === 'string' ? desc : desc.fr || desc.FR || undefined;
        } catch {
          return row.description;
        }
      })() : undefined,
      order: row.ordre || undefined
    };
  });
}

