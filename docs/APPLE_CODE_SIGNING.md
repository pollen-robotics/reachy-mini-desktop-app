# Apple Code Signing Configuration

Pour signer les packages macOS avec Apple, vous avez besoin de **4 variables d'environnement** :

## Variables requises

### 1. `APPLE_CERTIFICATE`
Le certificat de développeur Apple encodé en **base64**.

**Deux options possibles :**

#### Option A : Format `.p12` (recommandé pour CI/CD)
Le fichier `.p12` contient à la fois le certificat ET la clé privée.

**Comment obtenir :**
1. Téléchargez votre certificat `.cer` depuis [Apple Developer Portal](https://developer.apple.com/account/resources/certificates/list)
2. Double-cliquez sur le `.cer` pour l'ajouter à Keychain Access
3. **Important** : Vérifiez que la clé privée est présente :
   - Dans Keychain Access, allez dans "Mes certificats"
   - Cherchez votre certificat (ex: "Developer ID Application")
   - Si vous voyez une flèche à côté, cliquez dessus pour voir la clé privée associée
   - Si la clé privée n'apparaît pas, vous devez créer une nouvelle demande de certificat (CSR) depuis la machine où vous avez la clé privée
4. Exportez en `.p12` depuis Keychain Access :
   - **Sélectionnez le certificat ET sa clé privée** (les deux ensemble)
   - Clic droit → "Exporter..."
   - Format : "Échange d'informations personnelles (.p12)" (devrait être disponible)
   - Définissez un mot de passe
5. Encodez-le en base64 : `base64 -i certificate.p12 | pbcopy`

**⚠️ Si `.p12` est grisé :**
- La clé privée n'est pas dans Keychain Access sur cette machine
- Solution : Utilisez le format `.cer` (Option B) ou créez une nouvelle CSR depuis cette machine

#### Option B : Format `.cer` + clé privée séparée
Si vous avez déjà un `.cer` et une clé privée séparée, vous pouvez les combiner.

**Comment obtenir :**
1. Téléchargez votre certificat `.cer` depuis [Apple Developer Portal](https://developer.apple.com/account/resources/certificates/list)
2. Encodez-le en base64 : `base64 -i certificate.cer | pbcopy`
3. Note : Vous aurez aussi besoin de la clé privée correspondante

### 2. `APPLE_CERTIFICATE_PASSWORD`
- **Si `.p12`** : Le mot de passe que vous avez défini lors de l'export `.p12`
- **Si `.cer`** : Peut être vide ou le mot de passe de la clé privée (selon votre configuration)

### 3. `APPLE_SIGNING_IDENTITY`
L'identité de signature complète, qui **contient déjà le Team ID** entre parenthèses, par exemple :
- `"Developer ID Application: Pollen Robotics (4KLHP7L6KP)"`
- `"Apple Development: your@email.com (TEAM_ID)"`

**Note** : Le Team ID est inclus dans l'identité entre parenthèses `(TEAM_ID)`.

**Comment trouver :**
```bash
security find-identity -v -p codesigning
```

### 4. `APPLE_TEAM_ID` (optionnel mais recommandé)
L'ID de votre équipe Apple Developer (10 caractères). 

**Note** : Bien que le Team ID soit déjà dans `APPLE_SIGNING_IDENTITY`, certaines opérations (comme la notarisation) peuvent nécessiter cette variable séparément.

**Comment trouver :**
- Extraire depuis l'identité : `echo "Developer ID Application: Name (TEAM_ID)" | sed 's/.*(\(.*\))/\1/'`
- Sur [Apple Developer Portal](https://developer.apple.com/account) → Membership
- Ou dans votre certificat : `security find-certificate -c "Developer ID Application" -p | openssl x509 -text | grep "Subject:"`

## Configuration dans Tauri

Ces variables sont automatiquement utilisées par Tauri lors du build si elles sont définies dans l'environnement.

### Script automatique (recommandé)

Un script est disponible pour configurer automatiquement les variables depuis le fichier `developerID_application.cer` :

```bash
# Depuis le dossier tauri-app
source scripts/setup-apple-signing.sh
```

Le script va :
1. Encoder automatiquement le fichier `.cer` en base64
2. Vous demander les autres informations (Team ID, Signing Identity)
3. Exporter les variables d'environnement pour la session courante

Ensuite, vous pouvez simplement faire :
```bash
yarn tauri build
```

### Exemple d'utilisation

```bash
# Option A : Avec fichier .p12 (recommandé)
export APPLE_CERTIFICATE="$(cat certificate.p12 | base64)"
export APPLE_CERTIFICATE_PASSWORD="your-p12-password"
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
export APPLE_TEAM_ID="ABCD123456"

# Option B : Avec fichier .cer
export APPLE_CERTIFICATE="$(cat certificate.cer | base64)"
export APPLE_CERTIFICATE_PASSWORD=""  # Peut être vide selon votre config
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
export APPLE_TEAM_ID="ABCD123456"

# Build avec signature
yarn tauri build
```

### Pour GitHub Actions / CI

Un workflow GitHub Actions est disponible dans `.github/workflows/build.yml` qui signe automatiquement.

**Configuration des secrets :**

1. Allez dans votre repository GitHub → **Settings** → **Secrets and variables** → **Actions**
2. Cliquez sur **New repository secret**
3. Ajoutez les 4 secrets suivants :

   #### `APPLE_CERTIFICATE`
   - Encoder votre fichier `.cer` en base64 :
     ```bash
     base64 -i developerID_application.cer | pbcopy
     ```
   - Collez le résultat complet dans le secret GitHub

   #### `APPLE_CERTIFICATE_PASSWORD`
   - Le mot de passe du certificat (peut être vide pour `.cer`)
   - Si vide, créez quand même le secret avec une valeur vide

   #### `APPLE_SIGNING_IDENTITY`
   - Valeur : `Developer ID Application: Pollen Robotics (4KLHP7L6KP)`
   - Ou trouvez-la avec : `security find-identity -v -p codesigning`

   #### `APPLE_TEAM_ID`
   - Valeur : `4KLHP7L6KP`
   - Trouvez-le sur [Apple Developer Portal](https://developer.apple.com/account) → Membership

**Le workflow signera automatiquement lors du build !**

Le workflow se déclenche :
- Sur les tags `v*` (ex: `v1.0.0`)
- Manuellement via **Actions** → **Build and Sign** → **Run workflow**

**Pour obtenir rapidement les valeurs des secrets :**
```bash
cd tauri-app
bash scripts/prepare-github-secrets.sh
```

Ce script affichera toutes les valeurs à copier-coller dans GitHub Secrets.

### Configuration dans `tauri.macos.conf.json`

Le fichier `src-tauri/tauri.macos.conf.json` contient :
```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "-",  // Utilise les variables d'environnement si "-"
      "entitlements": "entitlements.plist"
    }
  }
}
```

Si `signingIdentity` est `"-"`, Tauri utilisera automatiquement les variables d'environnement.

## Notarisation (optionnel)

Pour notariser votre app (requis pour distribution hors App Store), vous aurez aussi besoin de :

- `APPLE_ID` : Votre email Apple Developer
- `APPLE_APP_SPECIFIC_PASSWORD` : Un mot de passe spécifique à l'app généré sur [appleid.apple.com](https://appleid.apple.com)

## Vérification

Après le build, vérifiez la signature :
```bash
codesign -dv --verbose=4 "Reachy Mini Control.app"
spctl --assess --verbose "Reachy Mini Control.app"
```

## Ressources

- [Tauri Code Signing Docs](https://v2.tauri.app/guides/distribution/code-signing/)
- [Apple Code Signing Guide](https://developer.apple.com/documentation/security/code_signing_services)

