# Rapport - Problème d'accès Internet

**Date**: 29 novembre 2025  
**Version**: 0.2.20  
**Plateforme**: macOS (arm64)

---

## 🔍 Résumé Exécutif

L'application **ne détecte pas l'accès Internet** malgré une configuration réseau apparemment correcte. Le problème semble lié à l'**absence de détection explicite de la connectivité** et à une **possible demande de permission réseau non gérée**.

---

## 📋 Configuration Actuelle

### 1. Configuration macOS (Info.plist)

**✅ Configuré correctement :**
```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
    <key>NSAllowsArbitraryLoadsInWebContent</key>
    <true/>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
<key>NSLocalNetworkUsageDescription</key>
<string>L'application doit accepter des connexions réseau locales...</string>
```

**✅ Entitlements (entitlements.plist) :**
```xml
<key>com.apple.security.network.server</key>
<true/>
<key>com.apple.security.network.client</key>
<true/>
```

**Statut** : ✅ Configuration réseau macOS **correcte**

### 2. Configuration Tauri (tauri.conf.json)

**✅ Configuré :**
- CSP: `null` (pas de restriction)
- Updater plugin configuré avec HTTPS vers GitHub
- Pas de scope réseau explicite (normal pour Tauri v2)

**Statut** : ✅ Configuration Tauri **correcte**

### 3. Détection de Connectivité dans le Code

**❌ PROBLÈME IDENTIFIÉ :**

L'application **ne vérifie PAS explicitement** l'accès Internet :
- ❌ Pas d'utilisation de `navigator.onLine`
- ❌ Pas d'écoute d'événements `online`/`offline`
- ❌ Pas de test de connectivité avant les requêtes réseau
- ❌ Détection d'erreur réseau uniquement **après** échec de requête

**Code actuel** :
- `useUpdater.js` : Fait des requêtes et détecte les erreurs réseau **après coup**
- `UpdateView.jsx` : Affiche des erreurs réseau mais ne vérifie pas la connectivité **avant**
- Aucun mécanisme de détection proactive

---

## 🐛 Problèmes Identifiés

### Problème #1 : Absence de Détection Proactive

**Symptôme** : L'application ne sait pas si Internet est disponible avant de faire des requêtes.

**Impact** :
- Les requêtes échouent silencieusement
- L'utilisateur ne comprend pas pourquoi
- Pas de message clair "Pas d'accès Internet"

**Solution nécessaire** :
```javascript
// Ajouter une détection de connectivité
const [isOnline, setIsOnline] = useState(navigator.onLine);

useEffect(() => {
  const handleOnline = () => setIsOnline(true);
  const handleOffline = () => setIsOnline(false);
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}, []);
```

### Problème #2 : Permission Réseau macOS Non Demandée

**Symptôme** : macOS peut demander une permission réseau que l'utilisateur doit accorder.

**Contexte** :
- `NSLocalNetworkUsageDescription` est présent mais peut ne pas suffire
- macOS peut bloquer les connexions sortantes jusqu'à autorisation
- Aucun mécanisme pour détecter si la permission a été refusée

**Solution nécessaire** :
- Vérifier si la permission réseau est accordée
- Afficher un message clair si la permission est refusée
- Guider l'utilisateur vers les paramètres système

### Problème #3 : Erreurs Réseau Mal Gérées

**Symptôme** : Les erreurs réseau sont détectées mais pas clairement communiquées.

**Code actuel** :
```javascript
// useUpdater.js détecte les erreurs réseau mais...
catch (err) {
  // Détecte "network", "connection", "timeout"
  // Mais ne vérifie pas navigator.onLine AVANT
}
```

**Solution nécessaire** :
- Vérifier `navigator.onLine` avant chaque requête
- Afficher un message clair si offline
- Distinguer "pas d'Internet" vs "serveur inaccessible"

---

## 🔧 Solutions Recommandées

### Solution 1 : Ajouter une Détection de Connectivité

**Fichier** : `src/hooks/system/useNetworkStatus.js` (à créer)

```javascript
import { useState, useEffect } from 'react';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(() => {
    // Vérifier l'état initial
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine;
    }
    return true; // Assume online par défaut
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
}
```

### Solution 2 : Vérifier la Connectivité Avant les Requêtes

**Modifier** : `src/hooks/system/useUpdater.js`

```javascript
import { useNetworkStatus } from './useNetworkStatus';

export const useUpdater = ({ ... }) => {
  const { isOnline } = useNetworkStatus();
  
  const checkForUpdates = useCallback(async (retryCount = 0) => {
    // Vérifier la connectivité AVANT
    if (!isOnline) {
      setError('No internet connection. Please check your network settings.');
      setIsChecking(false);
      return null;
    }
    
    // Continuer avec la requête...
  }, [isOnline, ...]);
};
```

### Solution 3 : Améliorer les Messages d'Erreur

**Modifier** : `src/views/update/UpdateView.jsx`

```javascript
// Afficher un message clair si pas d'Internet
{!isOnline && (
  <Typography sx={{ color: '#ef4444' }}>
    No internet connection detected. Please check your network settings.
  </Typography>
)}
```

### Solution 4 : Test de Connectivité Réel

**Ajouter** : Test de connectivité avec un endpoint fiable

```javascript
const testConnectivity = async () => {
  try {
    const response = await fetch('https://www.google.com/favicon.ico', {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-cache'
    });
    return true;
  } catch {
    return false;
  }
};
```

---

## 🧪 Tests à Effectuer

### Test 1 : Détection Offline
- [ ] Désactiver le WiFi
- [ ] Vérifier que l'app détecte l'état offline
- [ ] Vérifier que le message d'erreur est clair

### Test 2 : Permission Réseau macOS
- [ ] Installer l'app sur un Mac propre
- [ ] Vérifier si macOS demande une permission réseau
- [ ] Tester avec permission accordée/refusée

### Test 3 : Requêtes Réseau
- [ ] Vérifier que les requêtes vers GitHub fonctionnent
- [ ] Vérifier que les erreurs réseau sont bien capturées
- [ ] Vérifier que les messages d'erreur sont clairs

### Test 4 : Transition Online/Offline
- [ ] Démarrer l'app offline
- [ ] Activer le WiFi
- [ ] Vérifier que l'app détecte le changement
- [ ] Vérifier que les requêtes reprennent automatiquement

---

## 📊 État Actuel vs État Souhaité

### État Actuel ❌
- ❌ Pas de détection proactive de connectivité
- ❌ Erreurs réseau détectées après échec uniquement
- ❌ Messages d'erreur peu clairs
- ❌ Pas de distinction "pas d'Internet" vs "serveur inaccessible"

### État Souhaité ✅
- ✅ Détection proactive avec `navigator.onLine`
- ✅ Vérification de connectivité avant chaque requête
- ✅ Messages d'erreur clairs et actionnables
- ✅ Distinction claire entre différents types d'erreurs réseau
- ✅ Gestion de la transition online/offline

---

## 🎯 Priorités

### Priorité 1 (Critique)
1. **Ajouter `useNetworkStatus` hook** - Détection proactive
2. **Vérifier `navigator.onLine` avant requêtes** - Éviter les requêtes inutiles
3. **Améliorer les messages d'erreur** - UX claire

### Priorité 2 (Important)
4. **Test de connectivité réel** - Vérifier avec un endpoint
5. **Gestion permission macOS** - Détecter si refusée
6. **Retry automatique** - Quand Internet revient

### Priorité 3 (Amélioration)
7. **Indicateur visuel de connectivité** - Badge online/offline
8. **Logs détaillés** - Pour debugging
9. **Métriques réseau** - Statistiques de connectivité

---

## 📝 Conclusion

**Problème principal** : L'application **ne détecte pas proactivement** l'accès Internet. Elle découvre l'absence de connectivité uniquement **après** l'échec d'une requête réseau.

**Solution immédiate** : Ajouter un hook `useNetworkStatus` qui utilise `navigator.onLine` et les événements `online`/`offline` pour détecter la connectivité **avant** de faire des requêtes.

**Configuration** : La configuration réseau macOS et Tauri est **correcte**. Le problème est dans la **détection et gestion** de la connectivité dans le code frontend.

---

**Rapport généré** : 29 novembre 2025  
**Version analysée** : 0.2.20  
**Statut** : ⚠️ Action requise - Ajout de détection de connectivité

