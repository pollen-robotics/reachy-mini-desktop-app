# 🎨 Guide pour créer l'image de fond du DMG

## Dimensions de l'image

**⚠️ IMPORTANT : Pour éviter le décalage, utilisez une image légèrement plus grande que la fenêtre !**

- **Fenêtre** : 800×600 points (taille logique standard)
- **Image recommandée** : **864×664 pixels** (800+64 × 600+64)
  - Les +64 pixels compensent les marges internes du Finder
  - C'est la méthode standard recommandée par la communauté
- **Format** : PNG (avec transparence possible)
- **Résolution** : 72 DPI

**Note** : Le Finder a des marges internes qui causent un décalage si l'image fait exactement 800×600. En utilisant 864×664 px, l'image remplit correctement la fenêtre sans décalage.

## Système de coordonnées

**Important** : macOS utilise un système de coordonnées depuis le **bas gauche** de la fenêtre.

### Conversion pour ton image

Quand tu crées ton image dans un éditeur (Photoshop, Figma, etc.), tu penses depuis le **haut gauche** (0,0 en haut).

**Pour convertir les coordonnées macOS vers ton image :**

- **macOS** : (0,0) = bas gauche
- **Ton image** : (0,0) = haut gauche

**Formule de conversion :**
```
Image Y = Hauteur de l'image - macOS Y
```

### Positions standard pour les icônes

**Pour une image 864×664 px (recommandée, compense les marges du Finder)** :
- **Icône de l'app** :
  - Position dans ton image (haut gauche) : **x=200, y=236**
  - Coordonnées macOS (bas gauche) : x=200, y=236
  - L'icône est centrée verticalement (128px de haut)

- **Lien Applications** :
  - Position dans ton image (haut gauche) : **x=550, y=236**
  - Coordonnées macOS (bas gauche) : x=550, y=236
  - L'icône est centrée verticalement (128px de haut)

**Pour une image 1600×1200 px (Retina 2x, meilleure qualité)** :
- **Icône de l'app** :
  - Position dans ton image (haut gauche) : **x=400, y=472**
  - Le script utilisera une fenêtre de 800×600 points, icônes à x=200, y=236

- **Lien Applications** :
  - Position dans ton image (haut gauche) : **x=1100, y=472**
  - Le script utilisera une fenêtre de 800×600 points, icônes à x=550, y=236

**Pour une image 2400×1800 px (Retina 3x, qualité maximale)** :
- **Icône de l'app** :
  - Position dans ton image (haut gauche) : **x=600, y=708**
  - Le script utilisera une fenêtre de 800×600 points, icônes à x=200, y=236

- **Lien Applications** :
  - Position dans ton image (haut gauche) : **x=1650, y=708**
  - Le script utilisera une fenêtre de 800×600 points, icônes à x=550, y=236

## Guide visuel pour créer l'image (864×664 px recommandé)

```
┌─────────────────────────────────────────────────────────┐
│                    (0,0) - Haut gauche                 │
│                                                          │
│                                                          │
│  [App]                    [Applications]                │
│  x=200                    x=550                         │
│  y=236                    y=236                         │
│  (depuis haut)            (depuis haut)                  │
│  (icône 128×128)          (icône 128×128)                │
│                                                          │
│                                                          │
│                                                          │
│                    (800,600) - Bas droite               │
└─────────────────────────────────────────────────────────┘
```

## Tailles des icônes

- **Taille d'affichage** : 128×128 px (points)
- **Espacement recommandé** : ~20–30 px entre les icônes
- **Marge depuis les bords** : ~50 px

## Conseils pour créer l'image

1. **Crée une image** dans ton éditeur :
   - **864×664 px** (recommandé, compense les marges du Finder)
   - Ou **800×600 px** si tu acceptes les petites marges
2. **Place des guides visuels** aux positions standard :
   - **App** : x=200, y=236 (depuis le haut gauche) pour 800×600
   - **Applications** : x=550, y=236 (depuis le haut gauche) pour 800×600
   - Pour 1600×1200 : multiplie par 2 (x=400, y=472)
3. **Ajoute une flèche ou instructions** entre les deux (optionnel)
4. **Laisse de la marge** sur les bords (50 px minimum)
5. **Exporte en PNG** : `background.png`
6. **Le script détecte automatiquement** la taille et ajuste tout !

## Test

Une fois l'image créée, teste avec :
```bash
./scripts/build/customize-dmg.sh \
  "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Reachy Mini Control.app" \
  "test-dmg.dmg" \
  "src-tauri/dmg-assets/background.png"
```

Si les positions ne sont pas parfaites, ajuste les valeurs `x` et `y` dans `scripts/build/customize-dmg.sh`.

