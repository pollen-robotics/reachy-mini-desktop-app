# Analyse Détaillée : Tauri Signe-t-il Tous Nos Binaires ?

## Constat Critique

**On a 445+ binaires à signer dans `.venv` seul !**

```bash
$ find src-tauri/binaries/.venv -type f \( -name "*.dylib" -o -name "*.so" -o -perm +111 \) | wc -l
445
```

**Plus les binaires dans :**
- `cpython-3.12.12-macos-aarch64-none/` (distribution Python complète)
- `uv`, `uvx` (binaires explicites)
- `uv-trampoline` (sidecar dans `externalBin`)

**Total estimé : 500-1000+ binaires Mach-O à signer**

---

## Ce Que Tauri Signe Automatiquement

### 1. Sidecars (`externalBin`)

**Configuration actuelle :**
```json
{
  "bundle": {
    "externalBin": [
      "binaries/uv-trampoline"
    ]
  }
}
```

**Tauri signe automatiquement :**
- ✅ `uv-trampoline` (sidecar explicite)
- ✅ Tous les sidecars listés dans `externalBin`

**Source :** Documentation Tauri confirme que les sidecars sont signés automatiquement depuis v1.5.0

### 2. Resources (`.venv`, `cpython-*`, `uv`, `uvx`)

**Configuration actuelle :**
```json
{
  "bundle": {
    "resources": {
      "binaries/uv": "uv",
      "binaries/uvx": "uvx",
      "binaries/.venv": ".venv",
      "binaries/cpython-3.12.12-macos-aarch64-none": "cpython-3.12.12-macos-aarch64-none"
    }
  }
}
```

**Question critique : Tauri signe-t-il automatiquement :**
- ❓ Tous les `.dylib` dans `.venv` ? (probablement des centaines)
- ❓ Tous les `.so` dans `.venv` ? (extensions Python natives)
- ❓ Tous les binaires exécutables dans `.venv/bin` ?
- ❓ Tous les binaires dans `cpython-*` ?
- ❓ `uv` et `uvx` explicitement listés ?

**Réponse probable : NON, pas récursivement**

---

## Preuves et Indices

### 1. Issue GitHub #11992

**Mention trouvée :** "des problèmes ont été signalés concernant la signature et la notarisation lors de l'utilisation de `ExternalBin`"

**Implication :** Même les sidecars (`externalBin`) peuvent avoir des problèmes de signature automatique.

### 2. Documentation Tauri

**Ce qui est documenté :**
- ✅ Signature de l'application principale
- ✅ Signature des sidecars (`externalBin`)
- ✅ Signature des frameworks macOS
- ✅ Signature récursive des **frameworks** (pas des Resources)

**Ce qui n'est PAS documenté :**
- ❌ Signature récursive des Resources
- ❌ Signature automatique des `.dylib` dans Resources
- ❌ Signature automatique des `.so` dans Resources
- ❌ Signature automatique des binaires dans `.venv`

### 3. Notre Script Actuel

**Notre script `sign-all-binaries.sh` signe explicitement :**
1. `uv`, `uvx` (Resources explicites)
2. Tous les `.dylib` dans `.venv` (récursif)
3. Tous les `.so` dans `.venv` (récursif)
4. Tous les binaires exécutables dans `.venv/bin`
5. Tous les binaires dans `cpython-*` (récursif)
6. Bundle principal avec `--deep`

**Si Tauri le faisait automatiquement, on n'aurait pas besoin de ce script !**

---

## Analyse : Que Signe Tauri Exactement ?

### Hypothèse 1 : Tauri Signe Seulement les Fichiers Explicites

**Ce qui serait signé :**
- ✅ Application principale
- ✅ Sidecars (`externalBin`)
- ✅ Frameworks macOS
- ❌ **PAS** les binaires dans `.venv` (c'est une ressource, pas un framework)
- ❌ **PAS** les binaires dans `cpython-*` (c'est une ressource)
- ❓ `uv` et `uvx` ? (peut-être, car listés explicitement)

**Résultat :** **INSUFFISANT** pour notre cas d'usage

### Hypothèse 2 : Tauri Signe avec `--deep`

**Ce qui serait signé :**
- ✅ Application principale avec `--deep`
- ✅ Tous les binaires Mach-O dans le bundle (récursif)

**Résultat :** **SUFFISANT** si `--deep` fonctionne bien

**⚠️ Problème :** Apple recommande de signer individuellement AVANT d'utiliser `--deep`

### Hypothèse 3 : Tauri Signe Récursivement Mais Pas Tout

**Ce qui serait signé :**
- ✅ Application principale
- ✅ Sidecars
- ✅ Frameworks
- ✅ Binaires dans `Resources/` de premier niveau (`uv`, `uvx`)
- ❌ **PAS** les binaires dans sous-dossiers (`/.venv/`, `/cpython-*/`)

**Résultat :** **INSUFFISANT** pour notre cas d'usage

---

## Test Pour Vérifier

### Test 1 : Build avec Tauri Automatique

**Étapes :**
1. Changer `signingIdentity: "-"` → `signingIdentity: "$APPLE_SIGNING_IDENTITY"`
2. Configurer les variables d'environnement
3. Build avec `tauri build`
4. Vérifier quels binaires sont signés :

```bash
# Vérifier tous les binaires non signés
find "Reachy Mini Control.app" -type f -exec sh -c '
  file "$1" | grep -q "Mach-O" && {
    codesign -dv "$1" 2>&1 | grep -q "code object is not signed" && echo "$1"
  }
' _ {} \;
```

**Si on trouve des binaires non signés → Tauri ne les signe pas automatiquement**

### Test 2 : Comparer avec Notre Script

**Étapes :**
1. Build avec signature automatique Tauri
2. Compter les binaires signés
3. Build avec notre script manuel
4. Compter les binaires signés
5. Comparer

**Si les nombres diffèrent → Notre script est nécessaire**

---

## Conclusion

### Réponse à la Question : "Tauri gère-t-il bien la signature au niveau de détail nécessaire ?"

**Réponse : PROBABLEMENT NON**

**Raisons :**
1. ❌ On a **445+ binaires** dans `.venv` seul
2. ❌ Tauri ne documente PAS la signature récursive des Resources
3. ❌ Il y a des issues GitHub concernant `ExternalBin` et la signature
4. ✅ Notre script manuel signe explicitement TOUS les binaires
5. ✅ Notre approche fonctionne et passe la notarisation

### Recommandation Finale

**GARDER NOTRE APPROCHE MANUELLE**

**Pourquoi :**
- ✅ On sait exactement ce qui est signé
- ✅ On signe TOUS les binaires (445+ dans `.venv` + cpython-*)
- ✅ Ça fonctionne et passe la notarisation
- ✅ On a un contrôle total
- ⚠️ Tauri pourrait ne pas signer récursivement les Resources

**Améliorations à apporter :**
- ✅ Documenter pourquoi on fait ça manuellement
- ✅ Ajouter des vérifications exhaustives
- ✅ Tester périodiquement si Tauri améliore sa gestion

### Si On Veut Tester Tauri Automatique

**Approche prudente :**
1. Tester sur une branche séparée
2. Vérifier exhaustivement tous les binaires signés
3. Tester la notarisation
4. Comparer avec notre approche actuelle
5. Si ça fonctionne → migrer progressivement

**Risque :** Si Tauri ne signe pas tous nos binaires Python, la notarisation échouera silencieusement ou avec des erreurs difficiles à diagnostiquer.

---

## Références

- [Tauri Documentation - macOS Code Signing](https://tauri.app/distribute/sign/macos/)
- [GitHub Issue #11992 - ExternalBin signing issues](https://github.com/tauri-apps/tauri/issues/11992)
- [Apple Developer - Code Signing Guide](https://developer.apple.com/documentation/security/code_signing_services)

