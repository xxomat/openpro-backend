# Guide de Débogage - OpenPro Backend Workers

Ce guide vous aide à diagnostiquer les problèmes de communication entre le frontend admin et le backend Workers.

## 🔍 Vérifications de Base

### 1. Vérifier que le backend tourne

```bash
# Dans le terminal du backend
npm run dev
```

Vous devriez voir :
```
⬣ wrangler dev
[INFO] Ready on http://localhost:8787
```

### 2. Tester la connectivité du backend

Ouvrez votre navigateur ou utilisez curl :

```bash
# Health check
curl http://localhost:8787/health

# Endpoint de debug (affiche toutes les infos)
curl http://localhost:8787/debug
```

Vous devriez recevoir une réponse JSON avec `status: "ok"`.

### 3. Vérifier la configuration du frontend admin

Le frontend admin doit pointer vers `http://localhost:8787` (et non `http://localhost:3001`).

**Vérifiez dans `openpro-admin-react`** :

1. Fichier `.env` ou `.env.local` :
```env
PUBLIC_BACKEND_BASE_URL=http://localhost:8787
```

2. Ou vérifiez `src/services/api/backendClient.ts` :
```typescript
const BACKEND_BASE_URL = import.meta.env.PUBLIC_BACKEND_BASE_URL || 'http://localhost:3001';
```

**⚠️ Problème** : Le défaut est `http://localhost:3001` (ancien port Fastify). Changez-le en `http://localhost:8787`.

## 📊 Logs du Backend

### Logs en temps réel

Avec `wrangler dev`, tous les logs apparaissent dans la console. Vous devriez voir :

```
[UUID] GET /api/suppliers/12345/accommodations
[UUID] GET /api/suppliers/12345/accommodations 200 (42ms)
```

### Format des logs

Chaque requête génère :
- **Entrante** : `[traceId] METHOD /path?query`
- **Sortante** : `[traceId] METHOD /path STATUS (duration)`

### Si vous ne voyez AUCUN log

Cela signifie que les requêtes n'arrivent pas au backend. Causes possibles :

1. **Mauvais port dans le frontend** (voir section 3 ci-dessus)
2. **Backend non démarré**
3. **Erreur CORS** (vérifiez la console du navigateur)

## 🌐 Vérifier CORS

### Dans la console du navigateur (F12)

Ouvrez l'onglet **Network** et cherchez les requêtes vers `localhost:8787`.

**Erreurs CORS typiques** :
```
Access to fetch at 'http://localhost:8787/...' from origin 'http://localhost:4321' 
has been blocked by CORS policy
```

**Solution** : Le backend devrait déjà gérer CORS automatiquement. Vérifiez que les headers CORS sont présents dans les réponses.

### Tester CORS manuellement

```bash
curl -H "Origin: http://localhost:4321" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     http://localhost:8787/api/suppliers/12345/accommodations
```

Vous devriez recevoir une réponse `204 No Content` avec les headers CORS.

## 🐛 Outils de Débogage

### 1. Endpoint `/debug`

```bash
curl http://localhost:8787/debug
```

Affiche :
- Informations sur la requête
- Configuration de l'environnement
- État de la base de données

### 2. Endpoint `/health`

```bash
curl http://localhost:8787/health
```

Vérifie que le Worker répond.

### 3. Logs détaillés dans le code

Les logs incluent maintenant :
- Origin de la requête
- User-Agent
- Referer
- Trace ID pour suivre une requête

### 4. Console du navigateur

Ouvrez la console du navigateur (F12) et vérifiez :
- **Console** : Erreurs JavaScript
- **Network** : Requêtes HTTP et leurs réponses
- **Application** > **Storage** : Variables d'environnement

## 🔧 Problèmes Courants

### Problème 1 : Aucun log dans le backend

**Symptômes** : Le frontend charge mais aucune requête n'apparaît dans les logs du backend.

**Causes possibles** :
1. Frontend pointe vers le mauvais port (`3001` au lieu de `8787`)
2. Backend non démarré
3. Variable d'environnement `PUBLIC_BACKEND_BASE_URL` non définie

**Solution** :
```bash
# 1. Vérifier que le backend tourne
curl http://localhost:8787/health

# 2. Vérifier la config du frontend
cd ../openpro-admin-react
cat .env.local  # ou .env
# Doit contenir: PUBLIC_BACKEND_BASE_URL=http://localhost:8787

# 3. Redémarrer le frontend après modification
```

### Problème 2 : Erreur CORS

**Symptômes** : Erreur dans la console du navigateur concernant CORS.

**Solution** : Le backend gère CORS automatiquement. Vérifiez que :
- Le backend tourne bien
- Les headers CORS sont présents (voir section CORS ci-dessus)

### Problème 3 : 404 Not Found

**Symptômes** : Les requêtes arrivent au backend mais retournent 404.

**Vérifications** :
1. Vérifiez l'URL exacte dans les logs : `GET /api/suppliers/...`
2. Comparez avec les routes définies dans `src/routes/suppliers.ts`
3. Vérifiez que le router est bien enregistré dans `src/index.ts`

### Problème 4 : Erreur 500 Internal Server Error

**Symptômes** : Le backend reçoit la requête mais échoue.

**Vérifications** :
1. Regardez les logs du backend pour l'erreur complète
2. Vérifiez que les variables d'environnement sont définies (`.dev.vars`)
3. Vérifiez que la base D1 est initialisée

## 📝 Checklist de Débogage

- [ ] Backend démarré (`npm run dev` dans `openpro-backend`)
- [ ] Backend répond à `http://localhost:8787/health`
- [ ] Frontend configuré avec `PUBLIC_BACKEND_BASE_URL=http://localhost:8787`
- [ ] Frontend redémarré après modification de la config
- [ ] Console du navigateur ouverte (F12)
- [ ] Onglet Network ouvert pour voir les requêtes
- [ ] Logs du backend visibles dans le terminal

## 🎯 Test Rapide

Exécutez cette séquence pour vérifier que tout fonctionne :

```bash
# Terminal 1 : Backend
cd openpro-backend
npm run dev

# Terminal 2 : Test
curl http://localhost:8787/health
curl http://localhost:8787/debug
curl http://localhost:8787/api/suppliers/12345/accommodations
```

Si les deux premières commandes fonctionnent mais pas la troisième, c'est normal (il faut un vrai ID fournisseur). L'important est que le backend réponde.

## 💡 Astuces

1. **Utilisez l'endpoint `/debug`** pour voir exactement ce que le backend reçoit
2. **Vérifiez les logs avec traceId** : chaque requête a un UUID unique pour le suivi
3. **Testez d'abord avec curl** avant de tester depuis le frontend
4. **Vérifiez la console du navigateur** : elle montre souvent les erreurs avant qu'elles n'arrivent au backend

## 🆘 Si Rien Ne Fonctionne

1. Vérifiez que les deux projets sont à jour :
   ```bash
   cd openpro-backend && git status
   cd ../openpro-admin-react && git status
   ```

2. Vérifiez les versions de Node.js :
   ```bash
   node --version  # Devrait être >= 18
   ```

3. Réinstallez les dépendances :
   ```bash
   cd openpro-backend && npm install
   cd ../openpro-admin-react && npm install
   ```

4. Vérifiez les ports :
   ```bash
   # Windows
   netstat -ano | findstr :8787
   netstat -ano | findstr :4321
   ```

