# Notarisation macOS

## Créer une clé API App Store Connect

1. Aller sur https://appstoreconnect.apple.com
2. **Users and Access** → **Keys** → **+**
3. Nommer la clé (ex: "GitHub Actions")
4. Sélectionner **Developer**
5. Noter :
   - **Issuer ID** (en haut de la page)
   - **Key ID** (de la clé créée)
6. **Télécharger le fichier `.p8`** (une seule fois possible)

## Configurer les secrets GitHub

GitHub → Settings → Secrets and variables → Actions → New repository secret

Ajouter 3 secrets :

- `APPLE_API_ISSUER` : Issuer ID
- `APPLE_API_KEY` : Key ID
- `APPLE_API_KEY_CONTENT` : Contenu complet du fichier `.p8` (copier-coller)

## Résultat

Le workflow notarise automatiquement l'application. Les utilisateurs n'auront plus l'alerte Gatekeeper.

