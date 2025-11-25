# Rapport des Fichiers Inutilisés

## 📋 Résumé

Ce rapport identifie les fichiers qui ne sont pas utilisés dans le projet Tauri Reachy Mini Control.

---

## 🗑️ Fichiers Source Inutilisés

### 1. `src/main.js`
- **Statut** : ❌ Inutilisé
- **Raison** : Ancien fichier remplacé par `src/main.jsx`
- **Action recommandée** : Supprimer
- **Note** : Le fichier contient du code vanilla JS pour une ancienne version de l'app

### 2. `src/index.html`
- **Statut** : ❌ Inutilisé
- **Raison** : Ancien fichier remplacé par `index.html` à la racine
- **Action recommandée** : Supprimer
- **Note** : Référence `main.js` qui n'est plus utilisé

### 3. `src/hooks/useRobotStateFull.js`
- **Statut** : ❌ Inutilisé
- **Raison** : Hook créé mais jamais importé ou utilisé dans le code
- **Action recommandée** : Supprimer ou intégrer si prévu pour usage futur
- **Note** : Le hook semble être une version améliorée de `useRobotState.js` mais n'est pas utilisée

### 4. `src/views/UpdateLogger.jsx`
- **Statut** : ❌ Inutilisé
- **Raison** : Composant créé mais jamais importé ou utilisé
- **Action recommandée** : Supprimer ou intégrer si prévu pour usage futur
- **Note** : Le composant semble être une alternative à la gestion des mises à jour dans `ReadyToStartView`

### 5. `src/styles.css`
- **Statut** : ⚠️ Partiellement utilisé
- **Raison** : Seulement référencé dans `src/index.html` (qui est lui-même inutilisé)
- **Action recommandée** : Supprimer si `src/index.html` est supprimé
- **Note** : Les styles sont maintenant gérés via Material-UI et les composants React

---

## 💾 Fichiers de Sauvegarde

### 1. `src/assets/robot-3d/reachy-mini.urdf.bak`
- **Statut** : ❌ Fichier de sauvegarde
- **Raison** : Fichier `.bak` (backup) non utilisé par l'application
- **Action recommandée** : Supprimer (garder uniquement si nécessaire pour référence)

---

## 🖼️ Assets Redondants (PNG vs SVG)

Les fichiers suivants sont des versions PNG alors que les versions SVG sont utilisées dans le code :

### 1. `src/assets/application-box.png`
- **Statut** : ❌ Inutilisé
- **Raison** : Seule la version SVG (`application-box.svg`) est utilisée
- **Action recommandée** : Supprimer si le PNG n'est pas nécessaire

### 2. `src/assets/reachy-buste.png`
- **Statut** : ❌ Inutilisé
- **Raison** : Seule la version SVG (`reachy-buste.svg`) est utilisée dans `ReadyToStartView.jsx`
- **Action recommandée** : Supprimer si le PNG n'est pas nécessaire

### 3. `src/assets/reachy-head.png`
- **Statut** : ❌ Inutilisé
- **Raison** : Seule la version SVG (`reachy-head.svg`) existe et n'est pas référencée
- **Action recommandée** : Supprimer (ni PNG ni SVG ne sont utilisés)

### 4. `src/assets/reachy-icon.png`
- **Statut** : ❌ Inutilisé
- **Raison** : Seule la version SVG (`reachy-icon.svg`) existe et n'est pas référencée
- **Action recommandée** : Supprimer (ni PNG ni SVG ne sont utilisés)

### 5. `src/assets/reachy-update-box.png`
- **Statut** : ❌ Inutilisé
- **Raison** : Seule la version SVG (`reachy-update-box.svg`) est utilisée dans `ApplicationStore.jsx` et `UpdateLogger.jsx`
- **Action recommandée** : Supprimer si le PNG n'est pas nécessaire

### 6. `src/assets/unplugged-cable.png`
- **Statut** : ❌ Inutilisé
- **Raison** : Seule la version SVG (`unplugged-cable.svg`) est utilisée dans `RobotNotDetectedView.jsx`
- **Action recommandée** : Supprimer si le PNG n'est pas nécessaire

### 7. `src/assets/reachies.png`
- **Statut** : ❌ Inutilisé
- **Raison** : Seule la version SVG (`reachies.svg`) est utilisée dans `DiscoverModal.jsx`
- **Action recommandée** : Supprimer si le PNG n'est pas nécessaire

---

## 📁 Dossiers d'Assets Non Utilisés

### 1. `src/assets/reachies/original/`
- **Statut** : ❌ Dossier complet non utilisé
- **Raison** : Seul le dossier `small-top-sided/` est utilisé dans `ReachiesCarousel.jsx`
- **Contenu** : 25 fichiers PNG
- **Action recommandée** : Supprimer le dossier entier si les images originales ne sont pas nécessaires

### 2. `src/assets/reachies/small/`
- **Statut** : ❌ Dossier complet non utilisé
- **Raison** : Seul le dossier `small-top-sided/` est utilisé dans `ReachiesCarousel.jsx`
- **Contenu** : 25 fichiers PNG
- **Action recommandée** : Supprimer le dossier entier si les images small ne sont pas nécessaires

---

## ✅ Fichiers Utilisés (pour référence)

Les fichiers suivants sont **utilisés** et ne doivent **pas** être supprimés :

- ✅ `src/main.jsx` - Point d'entrée principal
- ✅ `index.html` (racine) - HTML principal
- ✅ `src/hooks/useRobotState.js` - Hook utilisé dans `ActiveRobotView.jsx`
- ✅ `src/views/HardwareScanView.jsx` - Utilisé dans `StartingView.jsx`
- ✅ Tous les fichiers STL dans `src/assets/robot-3d/meshes/` - Chargés dynamiquement via URDF
- ✅ `src/assets/robot-3d/reachy-mini.urdf` - Fichier URDF principal
- ✅ `src/assets/reachies/small-top-sided/*.png` - Utilisés dans `ReachiesCarousel.jsx`
- ✅ Tous les fichiers SVG référencés dans le code

---

## 📊 Statistiques

- **Fichiers source inutilisés** : 5
- **Fichiers de sauvegarde** : 1
- **Assets PNG redondants** : 7
- **Dossiers d'assets non utilisés** : 2 (50 fichiers PNG)
- **Total fichiers à supprimer** : ~63 fichiers

---

## 🎯 Actions Recommandées

1. **Supprimer les fichiers source inutilisés** :
   ```bash
   rm src/main.js
   rm src/index.html
   rm src/hooks/useRobotStateFull.js
   rm src/views/UpdateLogger.jsx
   rm src/styles.css  # Si src/index.html est supprimé
   ```

2. **Supprimer le fichier de sauvegarde** :
   ```bash
   rm src/assets/robot-3d/reachy-mini.urdf.bak
   ```

3. **Supprimer les assets PNG redondants** (si les versions SVG suffisent) :
   ```bash
   rm src/assets/application-box.png
   rm src/assets/reachy-buste.png
   rm src/assets/reachy-head.png
   rm src/assets/reachy-icon.png
   rm src/assets/reachy-update-box.png
   rm src/assets/unplugged-cable.png
   rm src/assets/reachies.png
   ```

4. **Supprimer les dossiers d'assets non utilisés** (si les images ne sont pas nécessaires) :
   ```bash
   rm -rf src/assets/reachies/original/
   rm -rf src/assets/reachies/small/
   ```

---

## ⚠️ Notes Importantes

- **Vérifier avant suppression** : Certains fichiers peuvent être utilisés dans des builds futurs ou des fonctionnalités en développement
- **Assets PNG** : Garder les PNG si vous prévoyez de les utiliser pour des cas spécifiques (ex: favicons, images haute résolution)
- **Dossiers reachies** : Les dossiers `original/` et `small/` peuvent être utiles pour générer de nouvelles variantes à l'avenir
- **Backup** : Faire une sauvegarde avant de supprimer des fichiers

---

## 🔍 Méthodologie

L'analyse a été effectuée en :
1. Recherchant tous les imports et références dans le code source
2. Vérifiant les références aux assets (SVG, PNG, STL)
3. Comparant les fichiers présents avec ceux réellement utilisés
4. Identifiant les fichiers de sauvegarde et les doublons

---

*Rapport généré le : $(date)*

