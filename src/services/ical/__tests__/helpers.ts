/**
 * Helpers pour les tests iCal
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { Env } from '../../../index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../../../../');

/**
 * Crée une base D1 locale de test et retourne un mock d'Env
 */
export async function createTestD1Database(): Promise<D1Database> {
  // Utiliser wrangler pour créer une base D1 locale de test
  // La base sera créée dans .wrangler/state/v3/d1/
  const dbName = 'openpro-db-test';
  
  try {
    // Vérifier si la base existe déjà
    execSync(
      `npx wrangler d1 execute ${dbName} --local --command="SELECT 1"`,
      { cwd: rootDir, stdio: 'pipe' }
    );
  } catch {
    // La base n'existe pas, on va utiliser la base par défaut
    // Wrangler créera automatiquement une base locale si elle n'existe pas
  }

  // Appliquer le schéma si nécessaire
  try {
    const schemaPath = join(rootDir, 'schema.sql');
    execSync(
      `npx wrangler d1 execute openpro-db --local --file=${schemaPath}`,
      { cwd: rootDir, stdio: 'pipe' }
    );
  } catch (error: any) {
    // Ignorer les erreurs si le schéma est déjà appliqué
    if (!error.message?.includes('already exists')) {
      console.warn('Warning: Could not apply schema:', error.message);
    }
  }

  // Retourner un mock de D1Database
  // En réalité, on devrait utiliser la vraie base D1 via wrangler
  // Pour les tests, on va utiliser une approche différente
  return {} as D1Database;
}

/**
 * Crée un environnement de test
 */
export function createTestEnv(db: D1Database): Env {
  return {
    DB: db,
    OPENPRO_API_KEY: 'test-key',
    OPENPRO_BASE_URL: 'http://localhost:3000',
    FRONTEND_URL: 'http://localhost:4321',
    AI_PROVIDER: 'openai',
  };
}

/**
 * Nettoie la base de test
 */
export async function cleanupTestDatabase(db: D1Database, supplierId: number): Promise<void> {
  // Supprimer toutes les données de test
  await db.prepare('DELETE FROM local_bookings WHERE id_fournisseur = ?').bind(supplierId).run();
  await db.prepare('DELETE FROM ical_sync_config').run();
  await db.prepare('DELETE FROM accommodation_external_ids').run();
  await db.prepare('DELETE FROM accommodations').run();
}

