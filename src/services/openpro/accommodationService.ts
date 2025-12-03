/**
 * Service de gestion des hébergements
 * 
 * Ce service gère les hébergements stockés en DB, incluant leurs identifiants externes
 * pour les différentes plateformes.
 */

import type { Env } from '../../index.js';
import type { IAccommodation } from '../../types/api.js';
import { PlateformeReservation } from '../../types/api.js';

/**
 * Interface pour une ligne d'hébergement en DB
 */
interface AccommodationRow {
  id: string;
  nom: string;
  id_openpro: number | null;
  date_creation: string;
  date_modification: string;
}

/**
 * Interface pour un identifiant externe en DB
 */
interface ExternalIdRow {
  id: string;
  id_hebergement: string;
  platform: string;
  external_id: string;
  date_creation: string;
  date_modification: string;
}

/**
 * Crée un hébergement en DB
 * 
 * L'hébergement doit avoir un ID pour la plateforme "Directe" (obligatoire, fourni par l'admin).
 */
export async function createAccommodation(
  data: {
    nom: string;
    ids: Record<PlateformeReservation, string> & { [PlateformeReservation.Directe]: string };
  },
  env: Env
): Promise<IAccommodation> {
  // Vérifier que l'ID Directe est fourni
  if (!data.ids || !data.ids[PlateformeReservation.Directe]) {
    throw new Error('L\'ID pour la plateforme "Directe" est obligatoire');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const ids = data.ids;

  // Extraire l'ID OpenPro si présent
  const idOpenPro = ids[PlateformeReservation.OpenPro] 
    ? parseInt(ids[PlateformeReservation.OpenPro], 10) 
    : null;

  await env.DB.prepare(`
    INSERT INTO accommodations (id, nom, id_openpro, date_creation, date_modification)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    id,
    data.nom,
    idOpenPro,
    now,
    now
  ).run();

  // Stocker tous les IDs externes dans la table dédiée (y compris Directe)
  for (const [platform, externalId] of Object.entries(ids)) {
    if (externalId && platform !== PlateformeReservation.Directe) {
      // Pour Directe, on ne stocke pas dans accommodation_external_ids car c'est l'ID interne
      // Pour les autres plateformes, on stocke dans la table dédiée
      await setAccommodationExternalId(id, platform, externalId, env);
    }
  }

  const accommodation = await loadAccommodation(id, env);
  if (!accommodation) {
    throw new Error('Failed to load created accommodation');
  }
  return accommodation;
}

/**
 * Met à jour un hébergement
 */
export async function updateAccommodation(
  id: string,
  data: {
    nom?: string;
    ids?: Partial<Record<PlateformeReservation, string>>;
  },
  env: Env
): Promise<IAccommodation | null> {
  const updates: string[] = [];
  const values: any[] = [];

  if (data.nom !== undefined) {
    updates.push('nom = ?');
    values.push(data.nom);
  }

  // Si des IDs sont fournis, mettre à jour id_openpro si OpenPro est présent
  if (data.ids && data.ids[PlateformeReservation.OpenPro]) {
    const idOpenPro = parseInt(data.ids[PlateformeReservation.OpenPro], 10);
    if (!isNaN(idOpenPro)) {
      updates.push('id_openpro = ?');
      values.push(idOpenPro);
    }
  }

  if (updates.length > 0) {
    updates.push('date_modification = ?');
    values.push(new Date().toISOString());
    values.push(id);

    await env.DB.prepare(`
      UPDATE accommodations
      SET ${updates.join(', ')}
      WHERE id = ?
    `).bind(...values).run();
  }

  // Mettre à jour les IDs externes
  if (data.ids) {
    for (const [platform, externalId] of Object.entries(data.ids)) {
      if (externalId) {
        await setAccommodationExternalId(id, platform, externalId, env);
      }
    }
  }

  return loadAccommodation(id, env);
}

/**
 * Supprime un hébergement
 */
export async function deleteAccommodation(
  id: string,
  env: Env
): Promise<boolean> {
  const result = await env.DB.prepare(`
    DELETE FROM accommodations
    WHERE id = ?
  `).bind(id).run();

  return result.success && (result.meta.changes || 0) > 0;
}

/**
 * Charge un hébergement par ID
 */
export async function loadAccommodation(
  id: string,
  env: Env
): Promise<IAccommodation | null> {
  const row = await env.DB.prepare(`
    SELECT * FROM accommodations
    WHERE id = ?
  `).bind(id).first() as AccommodationRow | null;

  if (!row) {
    return null;
  }

  // Charger les identifiants externes
  const externalIdsResult = await env.DB.prepare(`
    SELECT platform, external_id FROM accommodation_external_ids
    WHERE id_hebergement = ?
  `).bind(id).all();

  const ids: Partial<Record<PlateformeReservation, string>> = {};
  
  // L'ID Directe est toujours l'ID interne de l'hébergement
  ids[PlateformeReservation.Directe] = row.id;
  
  // Ajouter l'ID OpenPro depuis la colonne id_openpro
  if (row.id_openpro) {
    ids[PlateformeReservation.OpenPro] = String(row.id_openpro);
  }
  
  // Ajouter les autres IDs externes
  if (externalIdsResult.results) {
    for (const extRow of externalIdsResult.results as ExternalIdRow[]) {
      // Vérifier que la plateforme est valide
      if (Object.values(PlateformeReservation).includes(extRow.platform as PlateformeReservation)) {
        ids[extRow.platform as PlateformeReservation] = extRow.external_id;
      }
    }
  }

  return {
    id: row.id,
    nom: row.nom,
    ids
  };
}

/**
 * Charge tous les hébergements
 */
export async function loadAllAccommodations(
  env: Env
): Promise<IAccommodation[]> {
  const result = await env.DB.prepare(`
    SELECT * FROM accommodations
    ORDER BY nom ASC
  `).all();

  if (!result.results || result.results.length === 0) {
    return [];
  }

  const accommodations: IAccommodation[] = [];

  for (const row of result.results as AccommodationRow[]) {
    // Charger les identifiants externes pour chaque hébergement
    const externalIdsResult = await env.DB.prepare(`
      SELECT platform, external_id FROM accommodation_external_ids
      WHERE id_hebergement = ?
    `).bind(row.id).all();

    const ids: Partial<Record<PlateformeReservation, string>> = {};
    
    // L'ID Directe est toujours l'ID interne de l'hébergement
    ids[PlateformeReservation.Directe] = row.id;
    
    // Ajouter l'ID OpenPro depuis la colonne id_openpro
    if (row.id_openpro) {
      ids[PlateformeReservation.OpenPro] = String(row.id_openpro);
    }
    
    // Ajouter les autres IDs externes
    if (externalIdsResult.results) {
      for (const extRow of externalIdsResult.results as ExternalIdRow[]) {
        // Vérifier que la plateforme est valide
        if (Object.values(PlateformeReservation).includes(extRow.platform as PlateformeReservation)) {
          ids[extRow.platform as PlateformeReservation] = extRow.external_id;
        }
      }
    }

    accommodations.push({
      id: row.id,
      nom: row.nom,
      ids
    });
  }

  return accommodations;
}

/**
 * Définit l'ID externe pour une plateforme
 */
export async function setAccommodationExternalId(
  idHebergement: string,
  platform: string,
  externalId: string,
  env: Env
): Promise<void> {
  const now = new Date().toISOString();

  // Vérifier si l'ID existe déjà
  const existing = await env.DB.prepare(`
    SELECT id FROM accommodation_external_ids
    WHERE id_hebergement = ? AND platform = ?
  `).bind(idHebergement, platform).first();

  if (existing) {
    // Mettre à jour
    await env.DB.prepare(`
      UPDATE accommodation_external_ids
      SET external_id = ?, date_modification = ?
      WHERE id_hebergement = ? AND platform = ?
    `).bind(externalId, now, idHebergement, platform).run();
  } else {
    // Créer
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO accommodation_external_ids (id, id_hebergement, platform, external_id, date_creation, date_modification)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, idHebergement, platform, externalId, now, now).run();
  }
}

/**
 * Récupère l'ID externe pour une plateforme
 */
export async function getAccommodationExternalId(
  idHebergement: string,
  platform: string,
  env: Env
): Promise<string | null> {
  const row = await env.DB.prepare(`
    SELECT external_id FROM accommodation_external_ids
    WHERE id_hebergement = ? AND platform = ?
  `).bind(idHebergement, platform).first() as { external_id: string } | null;

  return row?.external_id || null;
}

/**
 * Trouve un hébergement par son ID OpenPro
 */
export async function findAccommodationByOpenProId(
  idOpenPro: number,
  env: Env
): Promise<IAccommodation | null> {
  const row = await env.DB.prepare(`
    SELECT * FROM accommodations
    WHERE id_openpro = ?
  `).bind(idOpenPro).first() as AccommodationRow | null;

  if (!row) {
    return null;
  }

  return loadAccommodation(row.id, env);
}

/**
 * Trouve un hébergement par son ID pour une plateforme donnée
 */
export async function findAccommodationByPlatformId(
  platform: PlateformeReservation,
  platformId: string,
  env: Env
): Promise<IAccommodation | null> {
  if (platform === PlateformeReservation.OpenPro) {
    const idOpenPro = parseInt(platformId, 10);
    if (isNaN(idOpenPro)) {
      return null;
    }
    return findAccommodationByOpenProId(idOpenPro, env);
  }

  // Pour les autres plateformes, chercher dans accommodation_external_ids
  const extRow = await env.DB.prepare(`
    SELECT id_hebergement FROM accommodation_external_ids
    WHERE platform = ? AND external_id = ?
  `).bind(platform, platformId).first() as { id_hebergement: string } | null;

  if (!extRow) {
    return null;
  }

  return loadAccommodation(extRow.id_hebergement, env);
}
