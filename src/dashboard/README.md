# Traffic Monitor Dashboard

Interface de monitoring en temps réel du trafic HTTP du backend OpenPro.

## Fonctionnalités

- 📊 **Statistiques en temps réel** : total de requêtes, par type, erreurs, durée moyenne
- 🔍 **Filtres** : par type d'événement (incoming, OpenPro, AI) et par erreurs
- 📋 **Liste des événements** : détails expandables avec métadonnées complètes
- 🔗 **Corrélation des traces** : visualisation des cascades de requêtes avec traceId
- 🔄 **Auto-refresh** : mise à jour automatique toutes les 2 secondes
- 🎨 **Color coding** : vert (succès), rouge (erreurs), orange (slow >1s)

## Utilisation

### Développement

1. Démarrer le backend :
```bash
npm run dev
```

2. (Optionnel) Développer le dashboard avec hot reload :
```bash
npm run dev:dashboard
```
Le dashboard sera accessible sur http://localhost:5174 avec proxy vers le backend.

3. Accéder au dashboard via le backend :
http://localhost:3001/

### Production

1. Builder le projet complet (backend + dashboard) :
```bash
npm run build
```

2. Démarrer le serveur :
```bash
npm start
```

3. Accéder au dashboard :
http://localhost:3001/

## Architecture

### Types d'événements

- **incoming** : Requêtes HTTP entrantes vers le backend
- **outgoing-openpro** : Appels vers l'API OpenPro
- **outgoing-ai** : Appels vers les API IA (OpenAI/Anthropic)

### Corrélation

Chaque requête entrante génère un `traceId` unique qui est propagé à tous les appels enfants. Cliquez sur un événement et ensuite sur son traceId pour voir toute la cascade.

### Composants

- `App.tsx` : Composant principal avec gestion d'état
- `StatsBar.tsx` : Barre de statistiques
- `FilterBar.tsx` : Filtres de recherche
- `EventList.tsx` : Liste des événements
- `EventCard.tsx` : Carte d'événement individuel
- `TraceView.tsx` : Modal de visualisation de trace
- `api.ts` : Client API pour fetcher les données
- `types.ts` : Types TypeScript

## API Backend

Le dashboard consomme les endpoints suivants :

- `GET /api/traffic/events?limit=100&type=incoming` : Liste des événements
- `GET /api/traffic/stats` : Statistiques agrégées
- `GET /api/traffic/trace/:traceId` : Événements d'une trace

## Limitations

- Stockage en mémoire (max 1000 événements)
- Pas de persistance entre redémarrages
- Polling (pas de WebSocket en temps réel)
- Pas d'export des logs

