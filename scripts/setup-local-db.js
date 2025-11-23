#!/usr/bin/env node
/**
 * Script d'initialisation automatique de D1 en local
 * 
 * Ce script vérifie si la base D1 locale existe et l'initialise si nécessaire.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const schemaPath = join(rootDir, 'schema.sql');
const wranglerTomlPath = join(rootDir, 'wrangler.toml');

// Database ID fixe pour le développement local
const LOCAL_DB_ID = '00000000-0000-0000-0000-000000000000';

function ensureDatabaseId() {
  // Lire wrangler.toml
  let wranglerContent = readFileSync(wranglerTomlPath, 'utf-8');
  
  // Vérifier si database_id est vide ou manquant
  const dbIdMatch = wranglerContent.match(/database_id\s*=\s*"([^"]*)"/);
  const currentDbId = dbIdMatch ? dbIdMatch[1] : '';
  
  // Si database_id est vide, utiliser le placeholder local
  if (!currentDbId || currentDbId.trim() === '') {
    console.log('🔧 Configuration du database_id pour le développement local...');
    wranglerContent = wranglerContent.replace(
      /database_id\s*=\s*"[^"]*"/,
      `database_id = "${LOCAL_DB_ID}"`
    );
    writeFileSync(wranglerTomlPath, wranglerContent, 'utf-8');
    console.log('✅ database_id configuré');
  }
}

function checkSchemaApplied() {
  try {
    // Vérifier si les tables existent déjà
    const result = execSync(
      'npx wrangler d1 execute openpro-db --local --command="SELECT name FROM sqlite_master WHERE type=\'table\' AND name IN (\'local_bookings\', \'ai_suggestions\')"',
      {
        encoding: 'utf-8',
        stdio: 'pipe',
        cwd: rootDir
      }
    );
    // Si on obtient des résultats, les tables existent
    return result.includes('local_bookings') || result.includes('ai_suggestions');
  } catch {
    // Si la commande échoue, la base n'existe probablement pas encore
    return false;
  }
}

function initializeDatabase() {
  console.log('📦 Initialisation de la base de données D1 locale...');
  
  // Vérifier si le schéma existe
  if (!existsSync(schemaPath)) {
    console.error(`❌ Fichier schema.sql introuvable: ${schemaPath}`);
    process.exit(1);
  }
  
  // Appliquer le schéma
  // Note: La base sera créée automatiquement par wrangler dev si elle n'existe pas
  try {
    console.log('📋 Application du schéma SQL...');
    execSync(`npx wrangler d1 execute openpro-db --local --file=${schemaPath}`, {
      stdio: 'inherit',
      cwd: rootDir
    });
    console.log('✅ Schéma appliqué avec succès');
  } catch (error) {
    // Si l'erreur indique que la base n'existe pas, c'est normal au premier lancement
    // Wrangler dev créera la base automatiquement, puis on pourra appliquer le schéma
    const errorMsg = error.message || String(error);
    if (errorMsg.includes('Couldn\'t find a D1 DB') || 
        errorMsg.includes('no such database') || 
        errorMsg.includes('database not found')) {
      console.log('ℹ️  La base sera créée automatiquement par wrangler dev');
      console.log('ℹ️  Le schéma sera appliqué au prochain démarrage');
      // Ne pas faire échouer le script, wrangler dev créera la base
      return;
    }
    // Pour les autres erreurs, afficher un avertissement mais ne pas bloquer
    console.warn('⚠️  Impossible d\'appliquer le schéma maintenant:', errorMsg);
    console.warn('ℹ️  Le schéma sera appliqué automatiquement au prochain démarrage');
  }
}

// S'assurer que database_id est configuré
ensureDatabaseId();

// Vérifier si le schéma est déjà appliqué
if (checkSchemaApplied()) {
  console.log('✅ Base de données D1 locale déjà initialisée');
  process.exit(0);
}

// Initialiser la base
initializeDatabase();
console.log('🎉 Base de données D1 locale prête !');

