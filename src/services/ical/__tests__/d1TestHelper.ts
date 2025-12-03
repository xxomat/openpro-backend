/**
 * Helper pour accéder à la base D1 locale dans les tests
 * 
 * Utilise better-sqlite3 pour accéder directement au fichier SQLite
 * de la base D1 locale créée par wrangler.
 */

import Database from 'better-sqlite3';
import { existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { D1Database } from '@cloudflare/workers-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../../../../');

/**
 * Trouve le chemin du fichier SQLite de la base D1 locale
 */
function findD1DatabasePath(): string | null {
  const d1Dir = join(rootDir, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  
  if (!existsSync(d1Dir)) {
    return null;
  }

  // Chercher le fichier .sqlite dans le répertoire
  const files = readdirSync(d1Dir);
  const sqliteFile = files.find(f => f.endsWith('.sqlite'));
  
  if (!sqliteFile) {
    return null;
  }

  return join(d1Dir, sqliteFile);
}

/**
 * Crée un wrapper D1Database qui utilise better-sqlite3
 * pour accéder directement au fichier SQLite
 */
export function createD1TestDatabase(): D1Database {
  const dbPath = findD1DatabasePath();
  
  if (!dbPath) {
    throw new Error(
      'D1 database file not found. Make sure to run "npm run d1:migrate:local" first, ' +
      'or start wrangler dev at least once to create the local database.'
    );
  }

  if (!existsSync(dbPath)) {
    throw new Error(`D1 database file not found at: ${dbPath}`);
  }

  // Créer une connexion SQLite
  const db = new Database(dbPath, { readonly: false });

  // Créer un wrapper qui implémente l'interface D1Database
  return {
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      
      // Créer les méthodes qui peuvent être appelées avec ou sans bind
      const createMethods = (args: any[] = []) => ({
        run: async () => {
          try {
            const result = stmt.run(...args);
            return {
              success: true,
              meta: {
                changes: result.changes,
                last_row_id: Number(result.lastInsertRowid),
                duration: 0
              }
            };
          } catch (error: any) {
            return {
              success: false,
              error: error.message,
              meta: {
                changes: 0,
                last_row_id: 0,
                duration: 0
              }
            };
          }
        },
        first: async <T = any>() => {
          try {
            return stmt.get(...args) as T | null;
          } catch (error: any) {
            console.error('D1 first() error:', error);
            return null;
          }
        },
        all: async <T = any>() => {
          try {
            const results = stmt.all(...args) as T[];
            return { results };
          } catch (error: any) {
            console.error('D1 all() error:', error);
            return { results: [] };
          }
        },
        raw: async () => {
          try {
            const results = stmt.raw().all(...args);
            return results as any[][];
          } catch (error: any) {
            console.error('D1 raw() error:', error);
            return [];
          }
        }
      });

      // Retourner un objet qui peut être utilisé avec ou sans bind
      const methods = createMethods();
      
      return {
        ...methods,
        bind: (...args: any[]) => createMethods(args)
      };
    },
    batch: async (statements: any[]) => {
      const results = [];
      for (const stmt of statements) {
        try {
          const result = await stmt.run();
          results.push(result);
        } catch (error: any) {
          results.push({
            success: false,
            error: error.message,
            meta: { changes: 0, last_row_id: 0, duration: 0 }
          });
        }
      }
      return results;
    },
    exec: async (sql: string) => {
      try {
        db.exec(sql);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  } as D1Database;
}

/**
 * Ferme la connexion à la base de données
 * Note: better-sqlite3 gère automatiquement la fermeture, mais on peut
 * l'appeler explicitement si nécessaire
 */
export function closeD1TestDatabase(db: D1Database): void {
  // better-sqlite3 ferme automatiquement à la fin du processus
  // On pourrait implémenter une fermeture explicite si nécessaire
}

