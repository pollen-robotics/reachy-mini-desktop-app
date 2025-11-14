# Exporter un certificat .p12 depuis macOS

## ⚠️ Important

Un `.p12` contient **le certificat ET la clé privée** (nécessaire pour signer). Un `.cer` seul ne suffit pas.

## Comment obtenir le .p12

**Sur le Mac où la clé privée est installée** (celui qui a créé/installé le certificat) :

1. Ouvrir **Keychain Access** (Applications → Utilitaires)
2. Sélectionner **"login"** dans la liste de gauche
3. Chercher : `Developer ID Application: Pollen Robotics` (ou Team ID `4KLHP7L6KP`)
4. Clic droit → **Exporter** → Format **`.p12`**
5. Définir un mot de passe (ou laisser vide) → **Important** : noter le mot de passe si défini
6. Envoyer le fichier `.p12` + le mot de passe (si défini)

## Utiliser le .p12

**Convertir en base64 pour GitHub Secrets** :
```bash
base64 -i developerID_application.p12 | pbcopy
```

**Secrets GitHub à configurer** :
- `APPLE_CERTIFICATE` : Le base64 du `.p12`
- `APPLE_CERTIFICATE_PASSWORD` : Le mot de passe défini lors de l'export (ou **un espace** ` ` si aucun mot de passe)
- `APPLE_SIGNING_IDENTITY` : `Developer ID Application: Pollen Robotics (4KLHP7L6KP)`

**Important** : Créez **toujours** le secret `APPLE_CERTIFICATE_PASSWORD`, même si aucun mot de passe n'a été défini. Dans ce cas, mettez simplement un espace ` ` comme valeur (GitHub ne permet pas les secrets complètement vides).

