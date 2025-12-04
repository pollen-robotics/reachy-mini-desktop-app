# 🔑 Guide : Régénérer les clés de signature Tauri

## 📍 Emplacement actuel des clés

**Clé privée** : `~/.tauri/reachy-mini.key`
**Clé publique** : `~/.tauri/reachy-mini.key.pub`

## 🔄 Comment ça fonctionne

Le workflow GitHub Actions :
1. Lit la clé privée depuis `TAURI_SIGNING_KEY` (secret GitHub)
2. **Extrait automatiquement** la clé publique depuis `tauri.conf.json` (qui est en base64)
3. Décode la clé publique base64 pour obtenir le format brut attendu par minisign
4. Vérifie que la paire de clés correspond en testant une signature

## 🔄 Étapes pour régénérer un nouveau jeu de clés

### 1. Sauvegarder les anciennes clés (optionnel mais recommandé)

```bash
# Créer un backup
mkdir -p ~/.tauri/backup-$(date +%Y%m%d)
cp ~/.tauri/reachy-mini.key ~/.tauri/backup-$(date +%Y%m%d)/
cp ~/.tauri/reachy-mini.key.pub ~/.tauri/backup-$(date +%Y%m%d)/
```

### 2. Générer une nouvelle paire de clés

```bash
# Générer sans mot de passe (pour CI/CD)
yarn tauri signer generate -w ~/.tauri/reachy-mini.key --ci

# OU avec mot de passe (pour sécurité locale)
# yarn tauri signer generate -w ~/.tauri/reachy-mini.key
```

Cela crée :
- `~/.tauri/reachy-mini.key` (clé privée)
- `~/.tauri/reachy-mini.key.pub` (clé publique)

### 3. Encoder la clé publique en base64 pour tauri.conf.json

```bash
# Encoder la clé publique en base64
# ⚠️ IMPORTANT: La clé publique dans tauri.conf.json doit être en base64
cat ~/.tauri/reachy-mini.key.pub | base64
```

**Note** : Le workflow GitHub Actions décode automatiquement cette clé base64 pour obtenir le format brut attendu par minisign.

### 4. Mettre à jour tauri.conf.json

Remplacer la valeur de `pubkey` dans `src-tauri/tauri.conf.json` :

```json
"pubkey": "VOTRE_CLÉ_PUBLIQUE_BASE64_ICI"
```

### 5. Mettre à jour les secrets GitHub

Aller sur : `https://github.com/pollen-robotics/reachy-mini-desktop-app/settings/secrets/actions`

**Mettre à jour :**
- `TAURI_SIGNING_KEY` : Contenu complet de `~/.tauri/reachy-mini.key` (clé privée)

**Note** : Le workflow extrait automatiquement la clé publique depuis `tauri.conf.json` (qui est en base64) et la décode. Vous n'avez **pas besoin** de `TAURI_PUBLIC_KEY` dans les secrets GitHub.

### 6. Vérifier la correspondance

```bash
# Vérifier que la clé publique correspond
cat ~/.tauri/reachy-mini.key.pub | base64
# Comparer avec celle dans tauri.conf.json
```

## ⚠️ Important

- **Ne jamais commit la clé privée** dans le repo
- **La clé privée doit rester secrète**
- **La clé publique peut être dans le code** (c'est normal)
- **Après régénération**, les anciennes signatures ne fonctionneront plus
- **Toutes les nouvelles releases** devront être signées avec la nouvelle clé

## 🔍 Vérification

```bash
# Tester la signature
echo "test" > /tmp/test.txt
yarn tauri signer sign -f ~/.tauri/reachy-mini.key -p "" /tmp/test.txt

# Vérifier que la signature est créée
ls -la /tmp/test.txt.sig
```

