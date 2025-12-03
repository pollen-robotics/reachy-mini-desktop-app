# 🔍 Analyse Architecture, Conventions et Code Mort

## 📊 Structure des Dossiers

### Organisation Actuelle

```
src/
├── assets/              # 100+ fichiers (images, SVG, modèles 3D)
├── components/          # 8 composants + 2 sous-dossiers
│   ├── viewer3d/       # 11 fichiers (3D viewer)
│   └── wheel/          # 7 fichiers (roue d'expressions)
├── config/              # 1 fichier (daemon.js)
├── constants/          # 1 fichier (choreographies.js)
├── hooks/              # 3 sous-dossiers + 1 fichier
│   ├── daemon/         # 3 fichiers
│   ├── robot/          # 3 fichiers
│   └── system/         # 6 fichiers
├── store/              # 1 fichier (useAppStore.js)
├── utils/              # 18 fichiers + 2 sous-dossiers
│   ├── viewer3d/       # 2 fichiers
│   └── wheel/          # 4 fichiers
└── views/              # 8 dossiers de vues
    └── active-robot/   # Structure complexe (40+ fichiers)
```

### Problèmes d'Organisation Identifiés

1. **Dossier `views/expressions/` vide** ❌
   - Dossier créé mais jamais utilisé
   - Les expressions sont dans `views/active-robot/right-panel/expressions/`

2. **Dossier `quick-actions/Donut/` vide** ❌
   - Contient un sous-dossier vide alors que `Donut.jsx` est au même niveau

3. **Inconsistance dans la structure `quick-actions`**
   - `Donut.jsx` et `Donut/` coexistent (confusion)

## 🗑️ CODE MORT IDENTIFIÉ

### 1. **`src/utils/storeSync.js`** ❌ COMPLÈTEMENT INUTILISÉ
**Statut**: Jamais importé nulle part
**Raison**: La synchronisation est maintenant gérée directement dans `useAppStore.js` via `windowSyncMiddleware`
**Action**: ✅ **SUPPRIMER** (mais vérifier qu'il n'y a pas de référence cachée)

### 2. **`src/utils/componentNames.js`** ❌ NON UTILISÉ
**Statut**: Aucun import trouvé
**Fonctions**:
- `getComponentName()` - jamais appelée
- `getShortComponentName()` - jamais appelée
**Action**: ⚠️ **VÉRIFIER** si c'est pour usage futur ou vraiment mort

### 3. **`src/components/wheel/Counter/Counter.jsx`** ❌ NON UTILISÉ
**Statut**: Seulement référencé dans `useAppStore.js` mais jamais importé/utilisé
**Action**: ⚠️ **VÉRIFIER** si c'est pour usage futur (composant de compteur animé)

### 4. **`src/views/expressions/`** ❌ DOSSIER VIDE
**Statut**: Dossier créé mais jamais utilisé
**Action**: ✅ **SUPPRIMER** le dossier

### 5. **`src/components/FPSMeter.jsx`** ⚠️ UTILISATION LIMITÉE
**Statut**: Composant de debug, probablement seulement en dev
**Action**: Vérifier si utilisé uniquement en mode dev

### 6. **`src/components/ClickSpark.jsx`** ⚠️ À VÉRIFIER
**Statut**: Composant d'effet visuel
**Action**: Vérifier l'utilisation réelle

### 7. **`src/components/FullscreenOverlay.jsx`** ⚠️ À VÉRIFIER
**Statut**: Overlay plein écran
**Action**: Vérifier l'utilisation réelle

### 8. **`src/components/ReachiesCarousel.jsx`** ⚠️ À VÉRIFIER
**Statut**: Carousel d'images
**Action**: Vérifier l'utilisation réelle

## 📝 CONVENTIONS DE NOMMAGE

### ✅ Bonnes Conventions

1. **Hooks**: Préfixe `use` (ex: `useRobotState`, `useAppStore`)
2. **Composants**: PascalCase (ex: `SpinningWheel`, `WheelIndicator`)
3. **Utils**: camelCase (ex: `inputMappings`, `robotModelCache`)
4. **Constantes**: UPPER_SNAKE_CASE dans les fichiers de constants
5. **Dossiers**: kebab-case pour les vues (ex: `active-robot`, `ready-to-start`)

### ⚠️ Inconsistances

1. **Mélange camelCase et kebab-case dans les dossiers**
   - `active-robot` (kebab-case) ✅
   - `application-store` (kebab-case) ✅
   - `quick-actions` (kebab-case) ✅
   - Mais `viewer3d` (pas de séparateur) ⚠️
   - Et `wheel` (tout minuscule) ⚠️

2. **Fichiers index.js partout**
   - Beaucoup de dossiers ont un `index.js` pour les exports
   - C'est bien pour les barrel exports, mais parfois redondant

3. **Nommage des hooks**
   - La plupart suivent `use[Nom]` ✅
   - Mais certains sont dans des sous-dossiers spécifiques (cohérent)

## 🏗️ ARCHITECTURE

### Points Positifs ✅

1. **Séparation claire des responsabilités**
   - `components/` : Composants réutilisables
   - `views/` : Vues de l'application
   - `hooks/` : Logique métier réutilisable
   - `utils/` : Utilitaires

2. **Hooks bien organisés**
   - Par domaine (daemon, robot, system)
   - Hooks spécifiques près de leur usage

3. **Store centralisé**
   - Un seul store Zustand (`useAppStore`)
   - Middleware pour la synchronisation entre fenêtres

### Points d'Amélioration ⚠️

1. **Dossier `views/active-robot/` très volumineux**
   - 40+ fichiers dans un seul dossier
   - Sous-dossiers bien organisés mais structure profonde

2. **Duplication potentielle**
   - `quick-actions` dans `application-store/` et `right-panel/`
   - Vérifier si c'est la même chose ou deux choses différentes

3. **Utils dispersés**
   - Certains utils sont dans `utils/`
   - D'autres dans `utils/viewer3d/` ou `utils/wheel/`
   - Cohérent mais peut être confus

## 📦 FICHIERS PAR DOSSIER

### Composants Principaux
- `components/` : 8 fichiers + 2 sous-dossiers
- `components/viewer3d/` : 11 fichiers
- `components/wheel/` : 7 fichiers

### Vues
- `views/active-robot/` : 40+ fichiers (le plus gros)
- `views/starting/` : 3 fichiers
- `views/ready-to-start/` : 2 fichiers
- `views/robot-not-detected/` : 2 fichiers
- `views/closing/` : 2 fichiers
- `views/transition/` : 2 fichiers
- `views/update/` : 4 fichiers
- `views/expressions/` : **0 fichiers** ❌

### Hooks
- `hooks/daemon/` : 3 fichiers
- `hooks/robot/` : 3 fichiers
- `hooks/system/` : 6 fichiers
- Total : 12 hooks + 1 fichier racine

### Utils
- `utils/` : 18 fichiers
- `utils/viewer3d/` : 2 fichiers
- `utils/wheel/` : 4 fichiers
- Total : 24 fichiers utils

## 🎯 RECOMMANDATIONS

### Priorité 1 : Nettoyage du Code Mort

1. ✅ **Supprimer `src/utils/storeSync.js`** (jamais utilisé)
2. ✅ **Supprimer `src/views/expressions/`** (dossier vide)
3. ⚠️ **Vérifier `src/utils/componentNames.js`** (non utilisé mais peut être prévu)
4. ⚠️ **Vérifier `src/components/wheel/Counter/`** (non utilisé)

### Priorité 2 : Amélioration de l'Architecture

1. **Standardiser les noms de dossiers**
   - Choisir entre kebab-case et camelCase
   - Recommandation : kebab-case pour tous les dossiers

2. **Réorganiser `views/active-robot/`**
   - C'est le dossier le plus volumineux
   - Peut-être extraire certaines parties

3. **Documenter la structure**
   - Ajouter un README.md à la racine de `src/`
   - Expliquer l'organisation

### Priorité 3 : Optimisations

1. **Vérifier les imports inutilisés**
   - Utiliser un linter pour détecter les imports non utilisés
   - Nettoyer régulièrement

2. **Consolider les barrel exports**
   - Vérifier que tous les `index.js` sont utiles
   - Éviter les exports inutiles

## 📋 CHECKLIST DE NETTOYAGE

- [ ] Supprimer `src/utils/storeSync.js`
- [ ] Supprimer `src/views/expressions/` (dossier vide)
- [ ] Vérifier et supprimer `src/components/wheel/Counter/` si inutilisé
- [ ] Vérifier `src/utils/componentNames.js` (garder si prévu pour usage futur)
- [ ] Vérifier l'utilisation de `FPSMeter`, `ClickSpark`, `FullscreenOverlay`, `ReachiesCarousel`
- [ ] Nettoyer le dossier `quick-actions/Donut/` vide
- [ ] Standardiser les noms de dossiers (kebab-case)
- [ ] Ajouter documentation de l'architecture

---

*Analyse effectuée le : $(date)*
*Fichiers analysés : ~150 fichiers principaux*

