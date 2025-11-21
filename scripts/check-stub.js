/**
 * Script de vérification du serveur stub
 * Compatible Windows/Linux/Mac
 */

const url = 'http://localhost:3000/health';

try {
  const response = await fetch(url);
  if (response.ok) {
    console.log('✅ Stub server is running');
    process.exit(0);
  } else {
    console.error('⚠️  Stub server responded with status:', response.status);
    console.error('⚠️  Stub server not running! Start it with: cd ../openpro-api-react && npm run stub');
    process.exit(1);
  }
} catch (error) {
  console.error('⚠️  Stub server not running! Start it with: cd ../openpro-api-react && npm run stub');
  process.exit(1);
}

