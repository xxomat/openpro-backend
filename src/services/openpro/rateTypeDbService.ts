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
  id_type_tarif: number | null;  // Nullable maintenant (peut être NULL avant création dans OpenPro)
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
  id_rate_type: string;  // UUID interne (référence rate_types.id)
  id_type_tarif: number | null;  // ID OpenPro (peut être NULL)
  date_creation: string;
}

/**
 * Sauvegarde un plan tarifaire en DB
 * 
 * @param data - Données du plan tarifaire (idTypeTarif est optionnel pour permettre création DB-first)
 * @param env - Variables d'environnement
 * @returns L'ID interne (UUID) du plan tarifaire créé ou mis à jour
 */
export async function saveRateType(
  data: {
    idTypeTarif?: number;  // Optionnel maintenant (peut être NULL pour création DB-first)
    libelle?: string; // JSON pour multilingue
    description?: string; // JSON pour multilingue
    ordre?: number;
  },
  env: Env
): Promise<string> {
  const now = new Date().toISOString();

  // Si idTypeTarif est fourni, vérifier si le plan tarifaire existe déjà
  if (data.idTypeTarif !== undefined) {
    const existing = await env.DB.prepare(`
      SELECT id FROM rate_types
      WHERE id_type_tarif = ?
    `).bind(data.idTypeTarif).first<{ id: string }>();

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
      
      return existing.id;
    }
  }

  // Créer un nouveau plan tarifaire (avec ou sans id_type_tarif)
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO rate_types (id, id_type_tarif, libelle, description, ordre, date_creation, date_modification)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    data.idTypeTarif || null,  // NULL si pas fourni (création DB-first)
    data.libelle || null,
    data.description || null,
    data.ordre || null,
    now,
    now
  ).run();

  return id;
}

/**
 * Met à jour l'ID OpenPro d'un plan tarifaire après sa création dans OpenPro
 * 
 * @param idInterne - ID interne (UUID) du plan tarifaire
 * @param idTypeTarif - ID OpenPro retourné par OpenPro
 * @param env - Variables d'environnement
 */
export async function updateRateTypeOpenProId(
  idInterne: string,
  idTypeTarif: number,
  env: Env
): Promise<void> {
  await env.DB.prepare(`
    UPDATE rate_types
    SET id_type_tarif = ?, date_modification = datetime('now')
    WHERE id = ? AND id_type_tarif IS NULL
  `).bind(idTypeTarif, idInterne).run();
}

/**
 * Charge tous les plans tarifaires
 * 
 * Note: Ne retourne que les plans tarifaires qui ont un id_type_tarif (ID OpenPro),
 * car ceux sans ID OpenPro ne peuvent pas être utilisés dans l'interface.
 */
export async function loadRateTypes(
  env: Env
): Promise<IRateType[]> {
  const result = await env.DB.prepare(`
    SELECT * FROM rate_types
    WHERE id_type_tarif IS NOT NULL
    ORDER BY ordre ASC, id_type_tarif ASC
  `).all();

  if (!result.results || result.results.length === 0) {
    return [];
  }

  return (result.results as unknown as RateTypeRow[]).map(row => {
    // Parser le libellé JSON si présent
    let label: unknown = undefined;
    if (row.libelle) {
      try {
        label = JSON.parse(row.libelle);
      } catch {
        label = row.libelle;
      }
    }

    // Parser la description JSON si présente
    let description: unknown = undefined;
    if (row.description) {
      try {
        description = JSON.parse(row.description);
      } catch {
        // Si ce n'est pas du JSON valide, traiter comme une chaîne simple
        description = row.description;
      }
    }

    // Extraire descriptionFr pour compatibilité (mais on retourne aussi description complète)
    let descriptionFr: string | undefined = undefined;
    if (description) {
      if (typeof description === 'string') {
        descriptionFr = description;
      } else if (typeof description === 'object' && description !== null) {
        if (Array.isArray(description)) {
          // Format tableau Multilingue[]
          const frItem = description.find((item: any) => 
            item && typeof item === 'object' && (item.langue === 'fr' || item.langue === 'FR')
          );
          descriptionFr = frItem?.texte;
        } else {
          // Format objet { fr: "...", en: "..." }
          descriptionFr = (description as any).fr || (description as any).FR;
        }
      }
    }

    return {
      rateTypeId: row.id_type_tarif!,  // Non-null car filtré par WHERE
      label,
      description, // Description complète au format multilingue
      descriptionFr, // Texte français uniquement (pour compatibilité)
      order: row.ordre || undefined
    };
  });
}

/**
 * Trouve l'ID interne (UUID) d'un plan tarifaire depuis son ID OpenPro
 */
export async function findRateTypeIdByOpenProId(
  idTypeTarif: number,
  env: Env
): Promise<string | null> {
  const result = await env.DB.prepare(`
    SELECT id FROM rate_types
    WHERE id_type_tarif = ?
  `).bind(idTypeTarif).first<{ id: string }>();

  return result?.id || null;
}

/**
 * Supprime un plan tarifaire
 */
export async function deleteRateType(
  idTypeTarif: number,
  env: Env
): Promise<boolean> {
  // Trouver l'ID interne
  const idRateType = await findRateTypeIdByOpenProId(idTypeTarif, env);
  if (!idRateType) {
    return false;
  }

  // Supprimer d'abord les liaisons (utiliser id_rate_type)
  await env.DB.prepare(`
    DELETE FROM accommodation_rate_type_links
    WHERE id_rate_type = ?
  `).bind(idRateType).run();

  // Supprimer les données tarifaires (utiliser id_rate_type)
  await env.DB.prepare(`
    DELETE FROM accommodation_data
    WHERE id_rate_type = ?
  `).bind(idRateType).run();

  // Supprimer le plan tarifaire
  const result = await env.DB.prepare(`
    DELETE FROM rate_types
    WHERE id = ?
  `).bind(idRateType).run();

  return result.success && (result.meta.changes || 0) > 0;
}

/**
 * Lie un plan tarifaire à un hébergement
 * 
 * @param idHebergement - ID interne de l'hébergement
 * @param idTypeTarif - ID OpenPro du plan tarifaire (sera converti en ID interne)
 * @param env - Variables d'environnement
 */
export async function linkRateTypeToAccommodation(
  idHebergement: string,
  idTypeTarif: number,
  env: Env
): Promise<void> {
  // Trouver l'ID interne du plan tarifaire depuis son ID OpenPro
  const idRateType = await findRateTypeIdByOpenProId(idTypeTarif, env);
  if (!idRateType) {
    throw new Error(`Rate type with OpenPro ID ${idTypeTarif} not found`);
  }

  // Vérifier si la liaison existe déjà (utiliser id_rate_type)
  const existing = await env.DB.prepare(`
    SELECT id FROM accommodation_rate_type_links
    WHERE id_hebergement = ? AND id_rate_type = ?
  `).bind(idHebergement, idRateType).first();

  if (!existing) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO accommodation_rate_type_links (id, id_hebergement, id_rate_type, id_type_tarif, date_creation)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, idHebergement, idRateType, idTypeTarif, now).run();
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
  // Trouver l'ID interne du plan tarifaire
  const idRateType = await findRateTypeIdByOpenProId(idTypeTarif, env);
  if (!idRateType) {
    throw new Error(`Rate type with OpenPro ID ${idTypeTarif} not found`);
  }

  // Supprimer les données tarifaires associées (utiliser id_rate_type)
  await env.DB.prepare(`
    DELETE FROM accommodation_data
    WHERE id_hebergement = ? AND id_rate_type = ?
  `).bind(idHebergement, idRateType).run();

  // Supprimer la liaison (utiliser id_rate_type)
  await env.DB.prepare(`
    DELETE FROM accommodation_rate_type_links
    WHERE id_hebergement = ? AND id_rate_type = ?
  `).bind(idHebergement, idRateType).run();
}

/**
 * Charge les liaisons plans tarifaires - hébergements
 * Retourne les IDs OpenPro des plans tarifaires liés
 */
export async function loadAccommodationRateTypeLinks(
  idHebergement: string,
  env: Env
): Promise<number[]> {
  const result = await env.DB.prepare(`
    SELECT artl.id_type_tarif 
    FROM accommodation_rate_type_links artl
    INNER JOIN rate_types rt ON rt.id = artl.id_rate_type
    WHERE artl.id_hebergement = ? AND rt.id_type_tarif IS NOT NULL
    ORDER BY rt.id_type_tarif ASC
  `).bind(idHebergement).all();

  if (!result.results || result.results.length === 0) {
    return [];
  }

  return (result.results as Array<{ id_type_tarif: number }>)
    .map(row => row.id_type_tarif)
    .filter((id): id is number => id !== null);
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
    INNER JOIN accommodation_rate_type_links artl ON rt.id = artl.id_rate_type
    WHERE artl.id_hebergement = ?
    ORDER BY rt.ordre ASC, rt.id_type_tarif ASC
  `).bind(idHebergement).all();

  if (!result.results || result.results.length === 0) {
    return [];
  }

  return (result.results as unknown as RateTypeRow[]).map(row => {
    // Filtrer les plans tarifaires sans id_type_tarif
    if (row.id_type_tarif === null) {
      return null;
    }

    let label: unknown = undefined;
    if (row.libelle) {
      try {
        label = JSON.parse(row.libelle);
      } catch {
        label = row.libelle;
      }
    }

    // Parser la description JSON si présente
    let description: unknown = undefined;
    if (row.description) {
      try {
        description = JSON.parse(row.description);
      } catch {
        description = row.description;
      }
    }

    // Extraire descriptionFr pour compatibilité
    let descriptionFr: string | undefined = undefined;
    if (description) {
      if (typeof description === 'string') {
        descriptionFr = description;
      } else if (typeof description === 'object' && description !== null) {
        if (Array.isArray(description)) {
          const frItem = description.find((item: any) => 
            item && typeof item === 'object' && (item.langue === 'fr' || item.langue === 'FR')
          );
          descriptionFr = frItem?.texte;
        } else {
          descriptionFr = (description as any).fr || (description as any).FR;
        }
      }
    }

    return {
      rateTypeId: row.id_type_tarif,
      label,
      description, // Description complète au format multilingue
      descriptionFr, // Texte français uniquement (pour compatibilité)
      order: row.ordre || undefined
    };
  }).filter((rt) => rt !== null && rt.rateTypeId !== null) as IRateType[];
}

