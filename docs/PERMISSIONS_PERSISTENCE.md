# Persistance des Permissions macOS après Rebuild

## Comment macOS identifie une application

macOS identifie les applications par plusieurs critères, par ordre de priorité :

1. **Bundle Identifier** (`com.pollen-robotics.reachy-mini`) - **PRINCIPAL**
2. **Code Signature** (hash de la signature)
3. **Chemin de l'application** (moins important)

## Votre Configuration Actuelle

```json
{
  "identifier": "com.pollen-robotics.reachy-mini",  // ✅ Reste constant
  "version": "0.1.0"  // Peut changer sans affecter les permissions
}
```

## Réponse à votre question

### ✅ **Les permissions DEVRAIENT être conservées** si :

1. **Le Bundle Identifier reste le même** (`com.pollen-robotics.reachy-mini`) ✅
2. **L'app est au même emplacement** (ou dans le même dossier)
3. **La signature ne change pas** (ou reste non-signée de la même manière)

### ⚠️ **Les permissions PEUVENT être réinitialisées** si :

1. **Le Bundle Identifier change** (ce n'est pas votre cas)
2. **L'app est déplacée** vers un autre emplacement (parfois)
3. **La signature change** (si vous signez l'app différemment)
4. **macOS considère que c'est une "nouvelle" app** (rare mais possible)

## Test Recommandé

Après le rebuild, vérifiez :

```bash
# 1. Vérifier que le Bundle Identifier est identique
plutil -p "Reachy Mini Control.app/Contents/Info.plist" | grep CFBundleIdentifier

# 2. Vérifier les permissions réseau (Firewall)
/usr/libexec/ApplicationFirewall/socketfilterfw --listapps | grep -i reachy

# 3. Vérifier les permissions TCC (si disponibles)
tccutil list | grep -i reachy
```

## Solution pour Garantir la Persistance

Pour garantir que les permissions persistent **même après rebuild** :

### Option 1 : Signer l'app (Recommandé pour production)

```bash
# Signer avec un certificat (même auto-signé)
codesign --deep --force --verify --verbose --sign "Developer ID Application: Your Name" \
  "Reachy Mini Control.app"

# Vérifier
codesign --verify --verbose "Reachy Mini Control.app"
```

### Option 2 : Utiliser le même chemin de build

Garder l'app au même emplacement :
- Debug : `src-tauri/target/debug/bundle/macos/`
- Release : `src-tauri/target/release/bundle/macos/`

### Option 3 : Script de pré-approbation

Utiliser le script `scripts/pre-approve-permissions.sh` après chaque rebuild.

## Comportement Attendu

**Scénario le plus probable** :
- ✅ Les permissions réseau seront **conservées** (car Bundle ID identique)
- ✅ Les permissions fichiers seront **conservées** (car Bundle ID identique)
- ⚠️ **MAIS** : Si macOS détecte un changement significatif (nouveau binaire, nouvelle signature), il peut redemander

**Recommandation** : 
- Testez après le rebuild
- Si les popups réapparaissent, utilisez `pre-approve-permissions.sh`
- Pour production, signez l'app avec un certificat stable

