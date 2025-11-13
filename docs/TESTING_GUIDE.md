# Guide de Test Professionnel

Ce guide décrit comment tester progressivement les nouvelles fonctionnalités (daemon embarqué + système de mise à jour).

## 🎯 Stratégie de Test

### Principe : Tester isolément puis intégrer

1. **Phase 1** : Tester le bundling du sidecar (sans l'app complète)
2. **Phase 2** : Tester l'app avec le daemon embarqué (sans mise à jour)
3. **Phase 3** : Tester le système de mise à jour (sans daemon)
4. **Phase 4** : Test d'intégration complet

---

## Phase 1 : Test du Sidecar (Daemon Embarqué)

### 1.1 Build du Sidecar

```bash
cd tauri-app

# Build du sidecar pour macOS
yarn build:sidecar-macos

# Vérifier que les fichiers sont créés
ls -la src-tauri/binaries/
# Devrait contenir :
# - uv
# - uv-trampoline-*
# - cpython-3.12.12-*
# - .venv/
```

### 1.2 Test Manuel du Sidecar

```bash
cd src-tauri/binaries

# Tester que uv fonctionne
./uv --version

# Tester que Python est installé
./uv python list

# Tester que le venv existe
ls -la .venv/

# Tester que reachy-mini-daemon est installé
./uv pip list | grep reachy-mini-daemon

# Tester le trampoline manuellement
./uv-trampoline-* run python -m reachy_mini.daemon.app.main --help
```

### 1.3 Vérifier la Structure du Bundle

```bash
# Après un build Tauri, vérifier que les ressources sont incluses
cd src-tauri/target/release/bundle/

# macOS
cd macos/Reachy\ Mini\ Control.app/Contents/Resources/
ls -la
# Devrait contenir : uv, uv-trampoline, cpython-*, .venv
```

---

## Phase 2 : Test de l'App avec Daemon Embarqué

### 2.1 Build en Mode Debug (plus rapide)

```bash
cd tauri-app

# Build du sidecar d'abord
yarn build:sidecar-macos

# Build de l'app en mode debug
yarn tauri build --debug

# L'app sera dans : src-tauri/target/debug/bundle/
```

### 2.2 Test de Démarrage

1. **Lancer l'app** :
   ```bash
   # macOS
   open src-tauri/target/debug/bundle/macos/Reachy\ Mini\ Control.app
   ```

2. **Vérifier les logs** :
   - Ouvrir la console système (Console.app sur macOS)
   - Filtrer par "reachy-mini-control"
   - Vérifier que le sidecar démarre correctement

3. **Vérifier que le daemon répond** :
   ```bash
   # Dans un autre terminal
   curl http://localhost:8000/api/daemon/status
   ```

### 2.3 Test de Fonctionnalité Complète

- [ ] L'app démarre sans erreur
- [ ] Le daemon démarre automatiquement
- [ ] La connexion USB est détectée
- [ ] Le scan 3D fonctionne
- [ ] Les commandes robot fonctionnent
- [ ] L'arrêt du daemon fonctionne

### 2.4 Test en Mode Production

```bash
# Build production complet
yarn tauri:build

# Tester l'app bundle
open src-tauri/target/release/bundle/macos/Reachy\ Mini\ Control.app
```

---

## Phase 3 : Test du Système de Mise à Jour

### 3.1 Configuration de Test Local

Pour tester sans serveur réel, on peut utiliser un mock local :

1. **Désactiver temporairement le système** :
   ```json
   // Dans tauri.conf.json
   {
     "plugins": {
       "updater": {
         "active": false  // Désactiver pour tester d'abord sans
       }
     }
   }
   ```

2. **Ou créer un serveur mock local** :
   ```bash
   # Créer un serveur HTTP simple
   python3 -m http.server 8080 --directory ./test-updates/
   ```

### 3.2 Test avec Serveur Mock

1. **Créer un fichier de test** :
   ```bash
   mkdir -p test-updates/darwin-aarch64/0.1.0
   ```

2. **Créer un JSON de test** :
   ```json
   // test-updates/darwin-aarch64/0.1.0/update.json
   {
     "version": "0.2.0",
     "notes": "Version de test",
     "pub_date": "2024-01-15T10:00:00Z",
     "platforms": {
       "darwin-aarch64": {
         "signature": "test-signature",
         "url": "http://localhost:8080/test-update.tar.gz"
       }
     }
   }
   ```

3. **Configurer l'endpoint** :
   ```json
   {
     "plugins": {
       "updater": {
         "endpoints": [
           "http://localhost:8080/{{target}}/{{current_version}}/update.json"
         ]
       }
     }
   }
   ```

### 3.3 Test de Vérification

```bash
# Lancer l'app
yarn tauri:dev

# Dans la console du navigateur, vérifier :
# - Les logs de vérification de mise à jour
# - Que le hook useUpdater fonctionne
```

### 3.4 Test d'Installation (Simulation)

Pour tester sans vraiment installer :

1. Modifier temporairement `useUpdater.js` pour simuler :
   ```javascript
   // Dans useUpdater.js, pour test uniquement
   const mockUpdate = {
     version: "0.2.0",
     date: new Date().toISOString(),
     body: "Version de test",
   };
   ```

---

## Phase 4 : Test d'Intégration Complet

### 4.1 Checklist Complète

- [ ] **Build du sidecar** : `yarn build:sidecar-macos` réussit
- [ ] **Build de l'app** : `yarn tauri:build` réussit
- [ ] **App démarre** : Pas d'erreur au lancement
- [ ] **Daemon embarqué** : Le sidecar lance le daemon Python
- [ ] **Connexion USB** : Détection du robot fonctionne
- [ ] **Scan 3D** : Le scan démarre et se termine
- [ ] **Commandes** : Les commandes robot fonctionnent
- [ ] **Mise à jour** : Le système vérifie les mises à jour (même si aucune disponible)
- [ ] **Logs** : Les logs sont corrects
- [ ] **Arrêt propre** : L'app se ferme correctement

### 4.2 Test sur Machine Propre

Pour tester comme un utilisateur final :

```bash
# Sur une machine sans Python installé
# 1. Copier le bundle complet
# 2. Lancer l'app
# 3. Vérifier que tout fonctionne sans dépendances externes
```

---

## 🐛 Debugging

### Logs à Vérifier

1. **Logs Rust (Backend)** :
   ```bash
   # macOS
   log stream --predicate 'process == "reachy-mini-control"' --level debug
   ```

2. **Logs Frontend** :
   - Ouvrir les DevTools dans l'app (si disponible)
   - Ou utiliser `console.log` dans le code

3. **Logs Sidecar** :
   - Les logs du sidecar sont émis via les événements Tauri
   - Vérifier dans la console système

### Problèmes Courants

#### Le sidecar ne démarre pas

```bash
# Vérifier les permissions
chmod +x src-tauri/binaries/uv-trampoline-*

# Vérifier que les chemins sont corrects
ls -la src-tauri/binaries/
```

#### Le daemon ne répond pas

```bash
# Vérifier que le port 8000 est libre
lsof -i :8000

# Tester manuellement
cd src-tauri/binaries
./uv-trampoline-* run python -m reachy_mini.daemon.app.main
```

#### Les mises à jour ne se détectent pas

1. Vérifier que l'endpoint est accessible
2. Vérifier le format JSON retourné
3. Vérifier que la version dans le JSON est supérieure
4. Vérifier les logs dans la console

---

## 📊 Scripts de Test Automatisés

Créer des scripts pour automatiser les tests :

```bash
# test-sidecar.sh
#!/bin/bash
set -e
echo "🧪 Test du sidecar..."
yarn build:sidecar-macos
echo "✅ Sidecar build réussi"
```

---

## ✅ Validation Finale

Avant de considérer que tout fonctionne :

1. **Build complet en production** : `yarn tauri:build`
2. **Test sur machine propre** : Sans Python installé
3. **Test de toutes les fonctionnalités** : Checklist complète
4. **Test de performance** : Vérifier que le bundle n'est pas trop lourd
5. **Test de sécurité** : Vérifier les signatures des mises à jour

---

## 🚀 Workflow Recommandé

1. **Développement** : `yarn tauri:dev` (avec sidecar pré-build)
2. **Test local** : Build debug + test manuel
3. **Test production** : Build release + test sur machine propre
4. **Déploiement** : Upload sur serveur de mises à jour

