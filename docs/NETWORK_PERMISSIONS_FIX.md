# Correction des Permissions Réseau

## Problème

La popup de permission réseau apparaît **trop tôt** (avant d'avoir besoin d'internet) et bloque l'accès réseau de l'app.

## Cause

macOS demande des permissions réseau pour **deux processus séparés** :

1. **L'app principale** (`Reachy Mini Control.app`)
2. **Le processus Python** (sidecar qui écoute sur le port 8000)

Le processus Python déclenche une popup car il écoute sur un port réseau (8000) pour le daemon.

## Solution

### Option 1 : Autoriser manuellement (Recommandé)

```bash
# Exécuter le script de correction
yarn scripts/fix-network-permissions.sh

# Ou manuellement :
# 1. Ouvrir Réglages Système > Réseau > Pare-feu
# 2. Cliquer sur "Options"
# 3. Trouver "Reachy Mini Control" et "python3"
# 4. Autoriser les deux
```

### Option 2 : Accepter la popup quand elle apparaît

Quand la popup apparaît :
- ✅ **ACCEPTER** la permission pour Python
- La popup ne réapparaîtra plus après acceptation

### Option 3 : Désactiver temporairement le Firewall (Développement)

```bash
# Désactiver le Firewall (non recommandé pour production)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off
```

## Vérification

Pour vérifier que les permissions sont correctes :

```bash
# Vérifier l'app principale
/usr/libexec/ApplicationFirewall/socketfilterfw --listapps | grep "Reachy Mini Control"

# Vérifier Python
/usr/libexec/ApplicationFirewall/socketfilterfw --listapps | grep "python3"
```

## Comportement Attendu

### Scénario Normal

1. L'app démarre
2. Le daemon Python démarre et écoute sur le port 8000
3. **Si première fois** : Popup macOS pour Python → **ACCEPTER**
4. L'app peut maintenant communiquer avec le daemon
5. Les popups ne réapparaissent plus

### Si la Popup Apparaît Trop Tôt

C'est normal ! La popup apparaît dès que Python essaie d'écouter sur le port 8000, même si l'app n'a pas encore besoin d'internet externe.

**Solution** : Accepter la popup. Elle ne réapparaîtra plus.

## Notes Techniques

- `NSLocalNetworkUsageDescription` dans `Info.plist` explique pourquoi l'app a besoin du réseau local
- `com.apple.security.network.server` dans `entitlements.plist` autorise les connexions entrantes
- Le processus Python hérite des permissions de l'app principale, mais macOS peut quand même demander confirmation

## Script Automatique

Un script `scripts/fix-network-permissions.sh` a été créé pour automatiser la configuration :

```bash
yarn scripts/fix-network-permissions.sh
```

Ce script :
- Ajoute l'app au Firewall
- Autorise l'app dans le Firewall
- Affiche le statut actuel

