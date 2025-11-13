# Configuration des Permissions macOS

Ce document explique comment configurer les permissions macOS pour éviter les popups de demande d'autorisation.

## Permissions Configurées

### 1. Réseau (Firewall)

**Problème** : macOS demande si `python3` peut accepter des connexions réseau entrantes.

**Solution** : 
- `Info.plist` avec `NSLocalNetworkUsageDescription` et `NSAppTransportSecurity`
- `entitlements.plist` avec `com.apple.security.network.server`

Ces configurations sont dans :
- `src-tauri/Info.plist`
- `src-tauri/entitlements.plist`
- `src-tauri/tauri.macos.conf.json`

### 2. Système de Fichiers

**Problème** : macOS demande l'accès au système de fichiers lors de l'installation d'apps.

**Solution** :
- `NSDocumentsFolderUsageDescription` et `NSDownloadsFolderUsageDescription` dans `Info.plist`
- `com.apple.security.files.user-selected.read-write` dans `entitlements.plist`

## Limitations

⚠️ **Important** : Les popups peuvent encore apparaître la première fois car :

1. **Le sidecar Python** est un processus séparé qui hérite des permissions de l'app principale, mais macOS peut quand même demander confirmation
2. **Les permissions réseau** sont demandées au runtime quand un processus écoute sur un port pour la première fois
3. **Les permissions fichiers** sont demandées au runtime lors du premier accès à certains dossiers

## Solutions Complémentaires

### Option 1 : Pré-approuver les permissions (Recommandé)

Après le premier lancement, les permissions sont sauvegardées. Pour les pré-approuver :

```bash
# Autoriser l'app dans le Firewall (après premier lancement)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /path/to/Reachy\ Mini\ Control.app
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /path/to/Reachy\ Mini\ Control.app
```

### Option 2 : Signer l'application (Production)

Pour une distribution publique, signer l'app avec un certificat Apple Developer :

```bash
# Signer l'app
codesign --deep --force --verify --verbose --sign "Developer ID Application: Your Name" "Reachy Mini Control.app"

# Vérifier la signature
codesign --verify --verbose "Reachy Mini Control.app"
```

### Option 3 : Notariser l'application (App Store / Distribution)

Pour une distribution via l'App Store ou en dehors :

```bash
# Notariser
xcrun altool --notarize-app --primary-bundle-id "com.pollen-robotics.reachy-mini" \
  --username "your@email.com" --password "@keychain:AC_PASSWORD" \
  --file "Reachy Mini Control.dmg"
```

## Vérification

Pour vérifier que les permissions sont bien configurées :

```bash
# Vérifier Info.plist
plutil -p "Reachy Mini Control.app/Contents/Info.plist" | grep -i network

# Vérifier entitlements
codesign -d --entitlements - "Reachy Mini Control.app"
```

## Notes

- Les popups peuvent apparaître **une seule fois** par utilisateur
- Après approbation, elles ne réapparaîtront plus
- Pour éviter complètement les popups, il faut signer et notariser l'app (nécessite un compte Apple Developer)

