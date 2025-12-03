# 🔄 Propositions de Réorganisation

## ✅ Actions Recommandées

### 1. **Supprimer le code mort confirmé**

#### `src/components/wheel/Counter/` ❌
**Raison**: Composant jamais utilisé, seulement mentionné dans un commentaire du store
**Action**: Supprimer le dossier complet (Counter.jsx + Counter.css)

#### `src/utils/componentNames.js` ❌
**Raison**: Aucun import trouvé, fonctions jamais appelées
**Action**: Supprimer le fichier (ou garder si prévu pour usage futur - à confirmer)

---

### 2. **Réorganiser `quick-actions` pour plus de clarté**

**Situation actuelle** (confuse):
```
application-store/quick-actions/  # Composants UI (Donut, Pad, HandwrittenArrows)
right-panel/quick-actions/        # Wrapper Section (QuickActionsSection)
```

**Problème**: Deux dossiers avec le même nom, relation non évidente

**Options**:

#### Option A: Consolider dans `components/` (Recommandé)
```
components/quick-actions/        # Composants réutilisables
  ├── Donut.jsx
  ├── Pad.jsx
  ├── HandwrittenArrows.jsx
  └── index.js

right-panel/quick-actions/        # Wrapper spécifique à la vue
  └── QuickActionsSection.jsx
```

**Avantage**: Les composants UI deviennent réutilisables, clairement séparés du wrapper

#### Option B: Tout dans `right-panel/quick-actions/`
```
right-panel/quick-actions/
  ├── components/                 # Composants UI
  │   ├── Donut.jsx
  │   ├── Pad.jsx
  │   └── HandwrittenArrows.jsx
  └── QuickActionsSection.jsx    # Wrapper
```

**Avantage**: Tout regroupé au même endroit

**Recommandation**: **Option A** - Les composants UI sont réutilisables et devraient être dans `components/`

---

### 3. **Standardiser les noms de dossiers**

**Inconsistances actuelles**:
- `viewer3d` (pas de séparateur)
- `wheel` (tout minuscule)
- `active-robot` (kebab-case) ✅
- `application-store` (kebab-case) ✅

**Recommandation**: Garder tel quel
- Les dossiers courts (`wheel`, `viewer3d`) sont acceptables pour des modules bien identifiés
- Le kebab-case est utilisé pour les noms composés (`active-robot`, `application-store`)
- **Pas de changement nécessaire** - la cohérence est suffisante

---

### 4. **Réorganiser `views/active-robot/` (Optionnel - Impact élevé)**

**Situation**: 40+ fichiers dans un seul dossier avec sous-dossiers profonds

**Structure actuelle**:
```
active-robot/
  ├── application-store/    # 40 fichiers
  ├── audio/              # 4 fichiers
  ├── camera/             # 3 fichiers
  ├── controller/         # 16 fichiers
  ├── controls/           # 2 fichiers
  ├── hooks/             # 3 fichiers
  ├── layout/            # 2 fichiers
  └── right-panel/       # 11 fichiers
```

**Option A: Extraire les modules indépendants**
```
components/
  ├── quick-actions/      # Déplacé depuis application-store
  └── ...

views/active-robot/
  ├── application-store/ # Réduit à ~35 fichiers
  ├── audio/
  ├── camera/
  ├── controller/
  ├── controls/
  ├── hooks/
  ├── layout/
  └── right-panel/
```

**Option B: Créer des modules de niveau supérieur**
```
modules/
  ├── application-store/  # Module complet
  ├── controller/         # Module contrôleur
  └── expressions/       # Module expressions (déplacé depuis right-panel)

views/active-robot/
  ├── ActiveRobotView.jsx # Orchestrateur
  ├── audio/
  ├── camera/
  └── ...
```

**Recommandation**: **Ne pas toucher** pour l'instant
- La structure fonctionne bien
- Les sous-dossiers sont logiques
- Le risque de casser des imports est élevé
- **Réserver pour un refactoring majeur si nécessaire**

---

### 5. **Nettoyer les barrel exports redondants**

**Situation**: Beaucoup de `index.js` qui exportent un seul fichier

**Exemples**:
- `views/ready-to-start/index.js` → exporte juste `ReadyToStartView.jsx`
- `views/closing/index.js` → exporte juste `ClosingView.jsx`

**Recommandation**: **Garder tel quel**
- Les barrel exports facilitent les imports
- Permettent de changer l'implémentation sans casser les imports
- Pattern standard en React
- **Pas de changement nécessaire**

---

## 🎯 Plan d'Action Recommandé

### Priorité 1: Nettoyage (Sans risque)
1. ✅ Supprimer `src/components/wheel/Counter/` (code mort confirmé)
2. ⚠️ Vérifier `src/utils/componentNames.js` (garder si prévu pour usage futur)

### Priorité 2: Réorganisation (Impact modéré)
3. 🔄 Déplacer `application-store/quick-actions/` → `components/quick-actions/`
   - Mettre à jour les imports dans `QuickActionsSection.jsx`
   - Mettre à jour les imports dans `ApplicationStore.jsx`

### Priorité 3: Améliorations (Impact élevé - À éviter pour l'instant)
4. ❌ Ne pas réorganiser `views/active-robot/` (trop risqué, peu de gain)
5. ❌ Ne pas standardiser tous les noms de dossiers (cohérence suffisante)

---

## 📋 Checklist de Réorganisation

### Nettoyage
- [ ] Supprimer `src/components/wheel/Counter/`
- [ ] Vérifier `src/utils/componentNames.js` (garder ou supprimer)

### Réorganisation
- [ ] Créer `src/components/quick-actions/`
- [ ] Déplacer `Donut.jsx`, `Pad.jsx`, `HandwrittenArrows.jsx`
- [ ] Mettre à jour `src/components/quick-actions/index.js`
- [ ] Mettre à jour import dans `QuickActionsSection.jsx`
- [ ] Mettre à jour import dans `ApplicationStore.jsx`
- [ ] Supprimer `src/views/active-robot/application-store/quick-actions/`

---

## ⚠️ Fichiers à NE PAS TOUCHER

- `src/utils/windowManager.js` - Gestion des fenêtres
- `src/utils/windowUtils.js` - Utilitaires fenêtres
- `src/views/windows/` - Synchronisation fenêtres
- `src/store/useAppStore.js` - Middleware windowSync (synchronisation)

---

## 💡 Justification des Recommandations

### Pourquoi déplacer `quick-actions` vers `components/` ?
- Les composants `Donut`, `Pad`, `HandwrittenArrows` sont des composants UI réutilisables
- Ils ne sont pas spécifiques à `application-store`
- Les mettre dans `components/` les rend disponibles pour toute l'app
- Séparation claire : composants UI vs wrapper de vue

### Pourquoi ne pas réorganiser `views/active-robot/` ?
- Structure fonctionnelle et logique
- Risque élevé de casser des imports
- Gain limité pour l'effort
- Mieux vaut documenter la structure actuelle

### Pourquoi garder les barrel exports ?
- Pattern standard et recommandé en React
- Facilite les imports (`from './views'` au lieu de `from './views/ActiveRobotView'`)
- Permet de changer l'implémentation sans casser les imports
- Peu de coût, beaucoup de bénéfices

---

*Propositions basées sur l'analyse de ~150 fichiers*

