# macOS Code Signing & Notarization Analysis

## Current Implementation Review

### 1. Signature Récursive (`sign-all-binaries.sh`)

#### Processus Actuel

**Ordre de signature :**
1. **Binaires dans Resources** :
   - `uv`, `uvx` (explicitement listés)
   - Binaires dans `MacOS/` (uv-trampoline)

2. **Environnement Python (.venv)** :
   - Tous les `.dylib` (bibliothèques dynamiques)
   - Tous les `.so` (extensions Python natives)
   - Tous les binaires exécutables dans `.venv/bin`

3. **Distribution Python (cpython-*)** :
   - Tous les `.dylib`, `.so`, et binaires exécutables

4. **Bundle principal** (en dernier) :
   - Signature avec `--deep` pour inclure tous les binaires signés

#### Commande de Signature

```bash
codesign --force --verify --verbose --sign "$SIGNING_IDENTITY" \
    --options runtime \
    --timestamp \
    "$binary"
```

**Options utilisées :**
- `--force` : Force la signature même si déjà signé
- `--verify` : Vérifie après signature
- `--verbose` : Mode verbeux
- `--options runtime` : Active Hardened Runtime (requis pour notarisation)
- `--timestamp` : Ajoute un timestamp (requis pour notarisation)

#### ⚠️ Points d'Attention

1. **Entitlements manquants** :
   - Les binaires individuels ne sont PAS signés avec `--entitlements`
   - Seul le bundle principal devrait avoir les entitlements (via Tauri)
   - ✅ **OK** : Les entitlements sont appliqués au bundle principal par Tauri

2. **Vérification incomplète** :
   - Le script compte les erreurs mais ne s'arrête pas si certains binaires échouent
   - ⚠️ **Risque** : Des binaires non signés peuvent passer inaperçus

3. **Signature avec --deep** :
   - `--deep` est utilisé sur le bundle principal
   - ⚠️ **Note** : Apple recommande de signer individuellement AVANT d'utiliser `--deep`
   - ✅ **OK** : C'est ce qui est fait ici

---

### 2. Notarisation

#### Processus Actuel

**Étape 1 : Création du ZIP**
```bash
ditto -c -k --keepParent "$APP_BUNDLE" "$ZIP_PATH"
```

**Étape 2 : Soumission à Apple**
```bash
xcrun notarytool submit "$ZIP_PATH" \
    --key "$APPLE_API_KEY_PATH" \
    --key-id "$APPLE_API_KEY" \
    --issuer "$APPLE_API_ISSUER" \
    --wait \
    --timeout 30m
```

**Étape 3 : Agrafage du ticket**
```bash
xcrun stapler staple "$APP_BUNDLE"
xcrun stapler validate "$APP_BUNDLE"
```

#### ✅ Points Positifs

- Utilise `notarytool` (moderne, recommandé par Apple)
- `--wait` : Attend la validation automatiquement
- `--timeout 30m` : Timeout approprié (notarisation peut prendre 5-30 min)
- Agrafage du ticket : Nécessaire pour distribution hors App Store

#### ⚠️ Points d'Attention

1. **Pas de vérification pré-notarisation** :
   - Aucune vérification que tous les binaires sont signés AVANT notarisation
   - ⚠️ **Risque** : Si un binaire n'est pas signé, la notarisation échouera

2. **Pas de log détaillé** :
   - Pas de récupération du log de notarisation en cas d'échec
   - ⚠️ **Amélioration possible** : Ajouter `--log-path` pour debug

---

### 3. Configuration Tauri

#### `tauri.macos.conf.json`

```json
{
  "bundle": {
    "signingIdentity": "-"
  }
}
```

**Note** : `signingIdentity: "-"` signifie que Tauri ne signe PAS automatiquement.
- ✅ **OK** : On signe manuellement avec le script, ce qui donne plus de contrôle

#### Entitlements (`entitlements.plist`)

**Entitlements configurés :**
- `com.apple.security.network.server` : Connexions réseau entrantes
- `com.apple.security.network.client` : Connexions réseau sortantes
- `com.apple.security.files.user-selected.read-write` : Accès fichiers
- `com.apple.security.files.downloads.read-write` : Accès téléchargements
- `com.apple.security.cs.allow-unsigned-executable-memory` : Exécution mémoire non signée
- `com.apple.security.cs.allow-jit` : JIT (pour Python)
- `com.apple.security.cs.disable-library-validation` : Désactive validation bibliothèques
- `com.apple.security.device.serial` : Accès ports série
- `com.apple.security.device.usb` : Accès USB

**⚠️ Entitlements sensibles :**
- `com.apple.security.cs.disable-library-validation` : Désactive la validation des bibliothèques
  - ⚠️ **Risque** : Peut causer des problèmes de notarisation
  - ✅ **Nécessaire** : Pour le sidecar Python avec bibliothèques natives

---

### 4. Workflow GitHub Actions

#### Ordre des Étapes

1. **Setup Apple Code Signing** :
   - Import du certificat `.p12` dans keychain temporaire
   - Configuration de la keychain pour codesign

2. **Build Tauri** :
   - Build SANS signature automatique
   - Bundle créé mais non signé

3. **Sign all binaries** :
   - Exécute `sign-all-binaries.sh`
   - Signe tous les binaires récursivement
   - Vérifie avec `codesign --verify --deep --strict`

4. **Notarize app** :
   - Crée ZIP
   - Soumet à Apple
   - Agrafe le ticket

#### ✅ Points Positifs

- Séparation claire des étapes
- Vérification après signature
- Notarisation manuelle (plus de contrôle)

#### ⚠️ Points d'Attention

1. **Pas de vérification des entitlements** :
   - Aucune vérification que les entitlements sont bien appliqués
   - ⚠️ **Amélioration** : Ajouter `codesign -d --entitlements - "$APP_BUNDLE"`

2. **Pas de gestion d'erreur détaillée** :
   - Si la notarisation échoue, pas de log détaillé
   - ⚠️ **Amélioration** : Ajouter récupération des logs Apple

---

## Recommandations d'Amélioration

### 1. Améliorer le Script de Signature

**Ajouter vérification des entitlements :**
```bash
# Après signature du bundle principal
echo "🔍 Verifying entitlements..."
codesign -d --entitlements - "$APP_BUNDLE" > /tmp/entitlements.plist
if ! diff -q /tmp/entitlements.plist src-tauri/entitlements.plist; then
    echo "⚠️  Entitlements mismatch!"
fi
```

**Ajouter vérification exhaustive :**
```bash
# Vérifier que TOUS les binaires sont signés
echo "🔍 Verifying all binaries are signed..."
UNSIGNED=$(find "$APP_BUNDLE" -type f -exec sh -c 'file "$1" | grep -q "Mach-O"' _ {} \; -print | while read f; do
    codesign -dv "$f" 2>&1 | grep -q "code object is not signed" && echo "$f"
done)

if [ -n "$UNSIGNED" ]; then
    echo "❌ Unsigned binaries found:"
    echo "$UNSIGNED"
    exit 1
fi
```

### 2. Améliorer la Notarisation

**Ajouter récupération des logs :**
```bash
# Après soumission
NOTARIZATION_ID=$(xcrun notarytool submit ... --output-format json | jq -r '.id')
xcrun notarytool log "$NOTARIZATION_ID" \
    --key "$APPLE_API_KEY_PATH" \
    --key-id "$APPLE_API_KEY" \
    --issuer "$APPLE_API_ISSUER" \
    > notarization.log || true
```

**Ajouter vérification pré-notarisation :**
```bash
# Avant notarisation, vérifier que le bundle est prêt
echo "🔍 Pre-notarization checks..."

# Vérifier signature
codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE" || {
    echo "❌ Bundle not properly signed"
    exit 1
}

# Vérifier Hardened Runtime
codesign -d --entitlements - "$APP_BUNDLE" | grep -q "com.apple.security.cs.runtime" || {
    echo "⚠️  Hardened Runtime not enabled"
}

# Vérifier timestamp
codesign -d -vv "$APP_BUNDLE" 2>&1 | grep -q "Timestamp=" || {
    echo "⚠️  No timestamp found"
}
```

### 3. Améliorer la Gestion d'Erreurs

**Ajouter try-catch pour notarisation :**
```bash
if ! xcrun notarytool submit ...; then
    echo "❌ Notarization failed"
    
    # Récupérer les logs
    xcrun notarytool log "$NOTARIZATION_ID" ... > notarization-error.log
    
    # Afficher les erreurs communes
    if grep -q "invalid signature" notarization-error.log; then
        echo "💡 Tip: Check that all binaries are signed with --options runtime"
    fi
    
    exit 1
fi
```

---

## Checklist de Vérification

### Avant Notarisation

- [ ] Tous les binaires Mach-O sont signés individuellement
- [ ] Le bundle principal est signé avec `--deep`
- [ ] Les entitlements sont appliqués au bundle principal
- [ ] Hardened Runtime est activé (`--options runtime`)
- [ ] Timestamp est présent (`--timestamp`)
- [ ] Vérification `codesign --verify --deep --strict` passe

### Après Notarisation

- [ ] Notarisation réussie (status: "Accepted")
- [ ] Ticket agrafé (`stapler validate` passe)
- [ ] Bundle peut être distribué sans avertissement Gatekeeper

---

## Problèmes Potentiels Identifiés

### 1. Entitlements Sensibles

**Problème** : `com.apple.security.cs.disable-library-validation` peut causer des problèmes

**Solution** : 
- Vérifier que c'est vraiment nécessaire
- Documenter pourquoi c'est requis (sidecar Python)
- Tester la notarisation avec/sans cet entitlement

### 2. Binaires Non Signés

**Problème** : Le script ne s'arrête pas si certains binaires échouent

**Solution** :
- Ajouter vérification exhaustive avant signature finale
- Faire échouer le build si binaires non signés

### 3. Logs de Notarisation

**Problème** : Pas de récupération des logs en cas d'échec

**Solution** :
- Ajouter récupération automatique des logs
- Afficher erreurs communes avec solutions

---

## Conclusion

**État actuel** : ✅ **Fonctionnel mais perfectible**

**Points forts** :
- Signature récursive bien implémentée
- Ordre correct (binaires individuels → bundle avec --deep)
- Notarisation avec notarytool (moderne)

**Points à améliorer** :
- Vérification exhaustive des binaires signés
- Récupération des logs de notarisation
- Vérification des entitlements
- Gestion d'erreur plus robuste

**Priorité** : Moyenne (le système fonctionne, mais pourrait être plus robuste)

