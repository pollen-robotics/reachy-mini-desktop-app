# Fix Avast Antivirus SSL Permission Error

## Problème

Sur Windows avec **Avast Antivirus**, l'application peut crasher au démarrage avec l'erreur suivante :

```
PermissionError: [Errno 13] Permission denied: '\\\\.\\aswMonFltProxy\\FFFFCC0C6BFDC8A0'
```

Cette erreur se produit dans la stack trace suivante :

```python
File "...\ssl.py", line 717, in create_default_context
    context.keylog_filename = keylogfile
PermissionError: [Errno 13] Permission denied: '\\\\.\\aswMonFltProxy\\FFFFCC0C6BFDC8A0'
```

## Cause racine

1. **Avast injecte** la variable d'environnement `SSLKEYLOGFILE` dans les processus (Chrome, Firefox, Python, etc.)
2. Cette variable pointe vers le proxy de filtrage d'Avast : `\\.\\aswMonFltProxy\...`
3. Quand Python crée un contexte SSL avec `ssl.create_default_context()`, il essaie d'écrire dans ce fichier
4. Le processus Python n'a **pas les permissions** d'accès au proxy Avast → **PermissionError**

## Solution implémentée

Nous avons créé un **wrapper Python** (`scripts/avast_ssl_fix.py`) qui :

1. ✅ Détecte si `SSLKEYLOGFILE` pointe vers `aswMonFltProxy` (Avast)
2. ✅ Détecte si `SSLKEYLOGFILE` pointe vers un chemin invalide/inaccessible
3. ✅ **Retire complètement** la variable avant d'importer `aiohttp` ou d'autres modules SSL
4. ✅ Lance ensuite le daemon normalement

Le wrapper est **automatiquement utilisé** sur toutes les plateformes (Windows, macOS, Linux), mais ne fait quelque chose que si nécessaire.

### Fichiers modifiés

1. **`scripts/avast_ssl_fix.py`** (nouveau) : Wrapper Python qui fixe le problème
2. **`src-tauri/src/python/mod.rs`** : Utilise le wrapper au lieu de lancer directement le daemon
3. **`src-tauri/tauri.*.conf.json`** : Inclut le script dans les ressources du bundle

### Code simplifié

```python
# scripts/avast_ssl_fix.py
if "SSLKEYLOGFILE" in os.environ:
    if "aswMonFltProxy" in os.environ["SSLKEYLOGFILE"]:
        del os.environ["SSLKEYLOGFILE"]  # ✅ Retire la variable

# Puis lance le daemon normalement
runpy.run_module("reachy_mini.daemon.app.main", run_name="__main__")
```

```rust
// src-tauri/src/python/mod.rs
let args = vec![
    python_cmd,
    "scripts/avast_ssl_fix.py",  // ✅ Utilise le wrapper
    "--desktop-app-daemon",
    "--no-wake-up-on-start",
    "--preload-datasets",
];
```

## Solutions alternatives (pour l'utilisateur)

Si l'utilisateur ne peut pas attendre la prochaine release :

### Option 1 : Désactiver Web Shield temporairement
1. Ouvrir Avast
2. Menu > Paramètres > Protection > Agents principaux
3. Désactiver temporairement "Agent Web"
4. Lancer l'application

### Option 2 : Ajouter une exception dans Avast
1. Ouvrir Avast
2. Menu > Paramètres > Général > Exceptions
3. Ajouter le dossier :
   ```
   C:\Users\<username>\AppData\Local\Reachy Mini Control\.venv\Scripts\
   ```

### Option 3 : Variable d'environnement manuelle
Avant de lancer l'app :
```cmd
set SSLKEYLOGFILE=
```

## Références

- [Stack Overflow: Permission denied ssl.log in Python](https://stackoverflow.com/questions/70288084/permission-denied-ssl-log-in-python)
- [urllib3 Issue #2015: FileNotFoundError with empty SSLKEYLOGFILE](https://github.com/urllib3/urllib3/issues/2015)
- [Chrome/Firefox not dumping to SSLKEYLOGFILE](https://stackoverflow.com/questions/42332792/chrome-not-firefox-are-not-dumping-to-sslkeylogfile-variable)

## Testing

Pour tester que le fix fonctionne :

1. Simuler l'injection Avast :
   ```cmd
   set SSLKEYLOGFILE=\\.\aswMonFltProxy\TEST123
   python scripts/avast_ssl_fix.py --help
   ```

2. Vérifier que le daemon démarre sans erreur

## Implémentation

- ✅ Wrapper Python créé avec gestion d'erreurs robuste
- ✅ Code Rust modifié pour utiliser le wrapper
- ✅ Configurations Tauri mises à jour (Windows, macOS, Linux)
- ✅ Documentation créée
- ⏳ À tester : Build complet et test sur Windows avec Avast

## Notes de développement

- Le wrapper est utilisé sur **toutes les plateformes** pour simplifier le code
- Sur macOS/Linux, il ne fait rien (Avast n'injecte pas SSLKEYLOGFILE)
- La gestion d'erreurs est robuste : si le wrapper échoue, il affiche l'erreur et quitte proprement
- Le script est **exécuté avant** tout import de modules SSL (aiohttp, requests, etc.)
