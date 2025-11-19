# 📋 Rapport Complet : Création d'Applications Reachy Mini

## 🎯 Résumé Exécutif

Ce rapport analyse en profondeur le processus de création d'applications pour Reachy Mini, en se basant sur l'analyse du code source, de la documentation existante, et des meilleures pratiques identifiées. Le tutoriel actuel dans `CreateAppTutorialModal.jsx` nécessite une refonte complète pour être plus complet, précis et guidé.

---

## 📚 1. Analyse du Code Existant

### 1.1 Tutoriel Actuel (`CreateAppTutorialModal.jsx`)

**Structure actuelle :**
- 4 étapes simplifiées
- Informations basiques et incomplètes
- Manque de détails techniques importants
- Pas d'exemples de code complets
- Pas de référence aux outils disponibles

**Problèmes identifiés :**
1. ❌ L'étape 1 mentionne `reachy-mini` dans requirements.txt mais devrait être `reachy-mini` (correct) ou préciser la version
2. ❌ L'étape 2 montre un code trop simpliste qui n'utilise pas `ReachyMiniApp`
3. ❌ L'étape 3 ne précise pas où ajouter le tag `reachy_mini` (dans les tags du Space)
4. ❌ L'étape 4 ne mentionne pas la nécessité d'un `app.py` ou de la structure de package
5. ❌ Pas de mention de l'outil `reachy-mini-make-app`
6. ❌ Pas d'explication sur les entry points dans `pyproject.toml`
7. ❌ Pas de référence au template Hugging Face Spaces

### 1.2 Code Source Analysé

**Fichiers clés identifiés :**
- `reachy_mini/src/reachy_mini/apps/app.py` : Classe de base `ReachyMiniApp`
- `reachy_mini/src/reachy_mini/apps/templates/` : Templates pour générer des apps
- `reachy_mini/src/reachy_mini/apps/sources/hf_space.py` : Logique de découverte des apps HF Spaces
- `reachy_mini/docs/python-sdk.md` : Documentation Python SDK (lignes 380-438)
- `reachy_mini/tests/ok_app/` : Exemple d'app fonctionnelle

---

## 🔍 2. Structure d'une Application Reachy Mini

### 2.1 Structure de Fichiers Requise

D'après l'analyse du code, une app Reachy Mini doit avoir cette structure :

```
mon_app/
├── pyproject.toml          # Configuration du package Python
├── README.md               # Documentation de l'app
└── mon_app/                # Module Python (nom en snake_case)
    ├── __init__.py         # Fichier vide
    └── main.py             # Code principal avec la classe ReachyMiniApp
```

### 2.2 Fichier `pyproject.toml`

**Structure requise :**
```toml
[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"

[project]
name = "mon_app"
version = "0.1.0"
description = "Description de votre app"
readme = "README.md"
requires-python = ">=3.10"
dependencies = [
    "reachy-mini"  # ⚠️ Important : utiliser "reachy-mini" (avec tiret)
]
keywords = ["reachy-mini-app"]

[project.entry-points."reachy_mini_apps"]
mon_app = "mon_app.main:MonApp"  # Format: nom_app = "module.main:ClasseApp"
```

**Points critiques :**
- ✅ Le nom du package dans dependencies doit être `reachy-mini` (avec tiret)
- ✅ Les entry points sont dans `[project.entry-points."reachy_mini_apps"]`
- ✅ Le format de l'entry point est : `nom_app = "module.main:ClasseApp`
- ✅ Python >= 3.10 requis

### 2.3 Fichier `main.py`

**Structure de base :**
```python
import threading
import time

from reachy_mini import ReachyMini, ReachyMiniApp
from reachy_mini.utils import create_head_pose


class MonApp(ReachyMiniApp):
    def run(self, reachy_mini: ReachyMini, stop_event: threading.Event):
        """
        Méthode principale de l'app.
        
        Args:
            reachy_mini: Instance ReachyMini déjà initialisée et connectée
            stop_event: Event threading pour arrêter l'app proprement
        """
        # Votre code ici
        # ReachyMini est déjà initialisé et connecté au daemon
        # Vérifiez stop_event.is_set() pour arrêter proprement
        
        while not stop_event.is_set():
            # Exemple : faire bouger la tête
            pose = create_head_pose(yaw=30, degrees=True)
            reachy_mini.goto_target(head=pose, duration=1.0)
            
            time.sleep(0.1)  # Ne pas bloquer trop longtemps


if __name__ == "__main__":
    # Pour tester l'app localement
    with ReachyMini() as mini:
        app = MonApp()
        stop = threading.Event()
        
        try:
            print("Démarrage de l'app...")
            app.run(mini, stop)
        except KeyboardInterrupt:
            print("Arrêt de l'app...")
            stop.set()
```

**Points importants :**
- ✅ La classe doit hériter de `ReachyMiniApp`
- ✅ La méthode `run()` reçoit `reachy_mini` déjà initialisé (pas besoin de `with ReachyMini()`)
- ✅ Toujours vérifier `stop_event.is_set()` dans les boucles
- ✅ Le `stop_event` permet d'arrêter l'app proprement

---

## 🚀 3. Processus de Création d'une App

### 3.1 Méthode 1 : Utiliser le Générateur de Template (RECOMMANDÉ)

**Commande :**
```bash
reachy-mini-make-app mon_app
```

**Ce que ça fait :**
- ✅ Crée la structure de fichiers complète
- ✅ Génère `pyproject.toml` avec les bons entry points
- ✅ Crée le template `main.py` avec des exemples commentés
- ✅ Génère un `README.md` de base

**Avantages :**
- Structure garantie correcte
- Entry points configurés automatiquement
- Exemples de code inclus

### 3.2 Méthode 2 : Créer Manuellement

Suivre la structure décrite dans la section 2.

### 3.3 Méthode 3 : Utiliser le Template Hugging Face Spaces

**Référence :**
- Template officiel : https://huggingface.co/spaces/pollen-robotics/reachy_mini_app_example
- Contient tous les fichiers nécessaires pour un Space HF

---

## 🌐 4. Déploiement sur Hugging Face Spaces

### 4.1 Création du Space

1. **Aller sur** : https://huggingface.co/new-space
2. **Remplir les informations :**
   - Owner : votre username ou organisation
   - Space name : nom de votre app (sera l'ID de l'app)
   - SDK : **Sélectionner "SDK"** (pas Gradio, Streamlit, etc.)
   - Hardware : **Sélectionner le hardware approprié** (si disponible)

### 4.2 Fichiers Requis dans le Space

**Structure minimale :**
```
votre-space/
├── app.py                  # Point d'entrée principal (peut être différent de main.py)
├── requirements.txt        # Dépendances Python
├── README.md              # Documentation
└── votre_app/             # Module Python (si structure package)
    ├── __init__.py
    └── main.py
```

**Fichier `requirements.txt` :**
```
reachy-mini
# Autres dépendances si nécessaire
```

**Points importants :**
- ✅ `requirements.txt` doit contenir `reachy-mini` (avec tiret)
- ✅ Le fichier `app.py` est le point d'entrée du Space
- ✅ Si vous utilisez une structure package, `app.py` doit importer et exécuter votre app

### 4.3 Configuration du Space

**Dans les paramètres du Space :**

1. **Tags :**
   - Ajouter le tag `reachy_mini` (avec underscore) pour que l'app apparaisse dans le store
   - Ajouter d'autres tags pertinents (ex: `robotics`, `ai`, etc.)

2. **Hardware (si disponible) :**
   - Sélectionner le hardware approprié si le Space SDK le supporte

3. **README.md :**
   - Ajouter une description claire
   - Inclure des screenshots/GIFs
   - Expliquer comment utiliser l'app

### 4.4 Fichier `app.py` pour Hugging Face Spaces

Si votre app utilise une structure package, créer un `app.py` à la racine :

```python
"""
Point d'entrée pour Hugging Face Spaces.
Ce fichier est exécuté par le Space SDK.
"""

from votre_app.main import VotreApp
from reachy_mini import ReachyMini
import threading

# Créer et démarrer l'app
def main():
    with ReachyMini() as reachy:
        app = VotreApp()
        stop_event = threading.Event()
        
        try:
            app.run(reachy, stop_event)
        except KeyboardInterrupt:
            stop_event.set()

if __name__ == "__main__":
    main()
```

---

## 📝 5. Bonnes Pratiques et Recommandations

### 5.1 Code de l'App

**✅ À FAIRE :**
- Vérifier régulièrement `stop_event.is_set()` dans les boucles
- Utiliser `time.sleep()` avec des valeurs raisonnables (pas de blocage long)
- Gérer les exceptions proprement
- Documenter le code avec des docstrings
- Utiliser les méthodes du SDK (`goto_target`, `set_target`, etc.)

**❌ À ÉVITER :**
- Ne pas créer une nouvelle instance `ReachyMini()` dans `run()` (déjà fournie)
- Ne pas bloquer indéfiniment sans vérifier `stop_event`
- Ne pas ignorer les exceptions
- Ne pas utiliser de boucles infinies sans condition d'arrêt

### 5.2 Structure et Organisation

**✅ Recommandations :**
- Organiser le code en fonctions/méthodes logiques
- Séparer la logique métier de la logique robotique
- Utiliser des constantes pour les valeurs configurables
- Ajouter des commentaires pour expliquer les mouvements complexes

### 5.3 Documentation

**✅ README.md devrait contenir :**
- Description claire de ce que fait l'app
- Prérequis (version Python, dépendances)
- Instructions d'installation locale
- Exemples d'utilisation
- Screenshots/GIFs démontrant l'app
- Crédits et références

### 5.4 Tests Locaux

**Avant de publier :**
1. ✅ Tester l'app localement avec le daemon
2. ✅ Vérifier que l'app s'arrête proprement (Ctrl+C)
3. ✅ Tester avec différentes configurations
4. ✅ Vérifier les entry points avec `pip install -e .`

---

## 🔧 6. Découverte et Installation des Apps

### 6.1 Comment les Apps Sont Découvertes

D'après `hf_space.py`, le système utilise deux méthodes :

1. **Liste officielle** (`AUTHORIZED_APP_LIST_URL`) :
   - Liste des apps approuvées dans le dataset `pollen-robotics/reachy-mini-official-app-store`
   - Seules ces apps apparaissent dans le store officiel

2. **Recherche par tag** (`HF_SPACES_FILTER_URL`) :
   - Recherche tous les Spaces avec le tag `reachy_mini`
   - Utilisé pour la découverte générale

### 6.2 Pour Apparaître dans le Store

**Option 1 : Liste Officielle (Recommandé)**
- Contacter l'équipe Pollen Robotics / Hugging Face
- Ajouter votre Space ID à la liste officielle
- Garantit la visibilité dans le store

**Option 2 : Tag `reachy_mini`**
- Ajouter le tag `reachy_mini` à votre Space
- Apparaîtra dans les recherches générales
- Peut ne pas apparaître dans le store officiel

---

## 📊 7. Exemples d'Apps Existantes

### 7.1 App de Test (`tests/ok_app`)

**Structure :**
```
ok_app/
├── pyproject.toml
├── README.md
└── ok_app/
    ├── __init__.py
    └── main.py
```

**Code minimal :**
```python
import threading
import time
from reachy_mini import ReachyMini, ReachyMiniApp

class OkApp(ReachyMiniApp):
    def run(self, reachy_mini: ReachyMini, stop_event: threading.Event):
        while not stop_event.is_set():
            time.sleep(0.5)
```

### 7.2 Template avec Exemples (`main.py.j2`)

Le template généré contient des exemples commentés pour :
- Bouger la tête avec `create_head_pose()`
- Utiliser `goto_target()` et `set_target()`
- Gérer le `stop_event`
- Créer des animations avec des boucles

---

## 🎓 8. Tutoriel Proposé - Structure Améliorée

### 8.1 Nouvelle Structure en 6 Étapes

**Étape 1 : Préparer l'Environnement**
- Installer Python >= 3.10
- Installer `reachy-mini` : `pip install reachy-mini`
- S'assurer que le daemon fonctionne

**Étape 2 : Créer la Structure de l'App**
- Utiliser `reachy-mini-make-app mon_app` (recommandé)
- OU créer manuellement la structure
- Expliquer chaque fichier généré

**Étape 3 : Développer l'App**
- Hériter de `ReachyMiniApp`
- Implémenter `run(reachy_mini, stop_event)`
- Utiliser le SDK pour contrôler le robot
- Gérer proprement l'arrêt avec `stop_event`

**Étape 4 : Tester Localement**
- Installer l'app : `pip install -e mon_app/`
- Tester avec le daemon local
- Vérifier l'arrêt propre

**Étape 5 : Créer le Space Hugging Face**
- Aller sur https://huggingface.co/new-space
- Choisir SDK comme framework
- Uploader les fichiers (app.py, requirements.txt, README.md)
- Ajouter le tag `reachy_mini`

**Étape 6 : Publier et Partager**
- Commit et push vers le Space
- Vérifier que l'app apparaît dans les recherches
- Partager avec la communauté

### 8.2 Exemples de Code Complets

**Exemple 1 : App Simple - Mouvement de Tête**
```python
import threading
import time
import numpy as np
from reachy_mini import ReachyMini, ReachyMiniApp
from reachy_mini.utils import create_head_pose

class HeadDanceApp(ReachyMiniApp):
    def run(self, reachy_mini: ReachyMini, stop_event: threading.Event):
        t0 = time.time()
        
        while not stop_event.is_set():
            t = time.time() - t0
            
            # Mouvement sinusoïdal de la tête
            yaw = 30 * np.sin(2 * np.pi * 0.5 * t)
            pitch = 10 * np.sin(2 * np.pi * 0.3 * t)
            
            pose = create_head_pose(yaw=yaw, pitch=pitch, degrees=True)
            reachy_mini.set_target(head=pose)
            
            time.sleep(0.01)  # 100 Hz
```

**Exemple 2 : App avec Antennes**
```python
import threading
import time
import numpy as np
from reachy_mini import ReachyMini, ReachyMiniApp

class AntennaWaveApp(ReachyMiniApp):
    def run(self, reachy_mini: ReachyMini, stop_event: threading.Event):
        t0 = time.time()
        
        while not stop_event.is_set():
            t = time.time() - t0
            
            # Mouvement des antennes en vague
            angle = 45 * np.sin(2 * np.pi * 0.2 * t)
            antennas = np.deg2rad([angle, -angle])
            
            reachy_mini.goto_target(antennas=antennas, duration=0.1)
            time.sleep(0.05)
```

---

## 🔗 9. Ressources et Liens Utiles

### 9.1 Documentation Officielle
- **Python SDK** : `reachy_mini/docs/python-sdk.md`
- **REST API** : `reachy_mini/docs/rest-api.md`
- **README Principal** : `reachy_mini/README.md`

### 9.2 Templates et Exemples
- **Template HF Spaces** : https://huggingface.co/spaces/pollen-robotics/reachy_mini_app_example
- **Apps Communautaires** : https://huggingface.co/spaces?q=reachy_mini
- **Store Officiel** : https://huggingface.co/spaces/pollen-robotics/Reachy_Mini_Apps

### 9.3 Outils
- **Générateur d'app** : `reachy-mini-make-app`
- **Daemon** : `reachy-mini-daemon`
- **Dashboard** : http://localhost:8000 (quand le daemon tourne)
- **API Docs** : http://localhost:8000/docs (quand le daemon tourne)

### 9.4 Communauté
- **GitHub** : https://github.com/pollen-robotics/reachy_mini
- **Site Web** : https://www.pollen-robotics.com/reachy-mini/

---

## ✅ 10. Checklist de Création d'App

### Avant de Commencer
- [ ] Python >= 3.10 installé
- [ ] `reachy-mini` installé et daemon fonctionnel
- [ ] Compte Hugging Face créé

### Développement
- [ ] Structure de fichiers créée (via `reachy-mini-make-app` ou manuellement)
- [ ] `pyproject.toml` configuré avec les bons entry points
- [ ] Classe héritant de `ReachyMiniApp` implémentée
- [ ] Méthode `run()` implémentée avec gestion de `stop_event`
- [ ] Code testé localement
- [ ] README.md complet avec documentation

### Déploiement
- [ ] Space Hugging Face créé avec SDK
- [ ] Fichiers uploadés (app.py, requirements.txt, README.md)
- [ ] Tag `reachy_mini` ajouté au Space
- [ ] App testée sur le Space
- [ ] App apparaît dans les recherches

### Partage
- [ ] Description claire dans le README
- [ ] Screenshots/GIFs ajoutés
- [ ] Instructions d'utilisation complètes
- [ ] App partagée avec la communauté

---

## 🎯 11. Recommandations pour le Nouveau Tutoriel

### 11.1 Structure Proposée

**6 étapes détaillées au lieu de 4 simplifiées :**

1. **Préparer** : Environnement et outils
2. **Créer** : Structure de l'app (avec `reachy-mini-make-app`)
3. **Développer** : Code de l'app avec exemples complets
4. **Tester** : Test local avant déploiement
5. **Déployer** : Création et configuration du Space HF
6. **Publier** : Tags, documentation, partage

### 11.2 Améliorations Clés

1. **Exemples de code complets** au lieu de snippets simplistes
2. **Référence à `reachy-mini-make-app`** comme méthode recommandée
3. **Explication des entry points** dans `pyproject.toml`
4. **Détails sur la structure Hugging Face Spaces** (app.py, requirements.txt)
5. **Explication du tag `reachy_mini`** et où l'ajouter
6. **Section sur les tests locaux** avant déploiement
7. **Liens vers les ressources** (templates, exemples, docs)

### 11.3 Format Visuel

- **Cards avec numéros** (comme actuellement)
- **Code blocks** avec syntax highlighting
- **Boutons d'action** pour ouvrir les liens (Create Space, Template, etc.)
- **Exemples visuels** (screenshots de structure de fichiers)
- **Tips et warnings** pour les points importants

---

## 📌 12. Conclusion

Le tutoriel actuel est **trop simplifié** et manque de détails techniques cruciaux. Une refonte complète est nécessaire pour :

1. ✅ Guider les développeurs étape par étape
2. ✅ Fournir des exemples de code complets et fonctionnels
3. ✅ Expliquer la structure Hugging Face Spaces
4. ✅ Référencer les outils disponibles (`reachy-mini-make-app`)
5. ✅ Clarifier les entry points et la configuration
6. ✅ Ajouter des bonnes pratiques et des warnings

Le nouveau tutoriel devrait être **complet, précis et actionnable**, permettant à n'importe qui de créer et déployer une app Reachy Mini avec succès.

---

---

## 📖 13. Documentation Complète Reachy Mini

### 13.1 Documentation Officielle Disponible

**Fichiers de documentation dans le repo :**
- `docs/python-sdk.md` : Documentation complète de l'API Python (438 lignes)
- `docs/rest-api.md` : Documentation de l'API REST HTTP
- `docs/troubleshooting.md` : Guide de dépannage
- `docs/wireless-version.md` : Configuration de la version wireless
- `docs/RPI.md` : Installation sur Raspberry Pi
- `docs/awesome-apps.md` : Liste d'applications communautaires
- `README.md` : Documentation principale du projet

### 13.2 API Python SDK - Fonctionnalités Principales

**Classe `ReachyMini` :**
- Connexion automatique au daemon
- Gestion du contexte avec `with` statement
- Contrôle des mouvements (head, antennas, body)
- Accès aux capteurs (camera, microphone, speaker)
- Enregistrement et lecture de mouvements

**Méthodes de mouvement :**
- `goto_target()` : Mouvement interpolé vers une position
- `set_target()` : Positionnement immédiat (haute fréquence)
- `look_at_image()` : Regarder un point dans l'image
- `look_at_world()` : Regarder un point 3D dans le monde
- `play_move()` : Jouer un mouvement enregistré

**Méthodes de contrôle moteurs :**
- `enable_motors()` : Activer les moteurs
- `disable_motors()` : Désactiver les moteurs
- `make_motors_compliant()` : Mode compliant (compensation gravité)

**Méthodes de capteurs :**
- `media.get_frame()` : Obtenir une frame de la caméra
- `media.get_audio_sample()` : Obtenir un échantillon audio
- `media.push_audio_sample()` : Envoyer audio au haut-parleur

**Méthodes d'enregistrement :**
- `start_recording()` : Démarrer l'enregistrement
- `stop_recording()` : Arrêter et récupérer les données

### 13.3 Limitations et Contraintes de Sécurité

**Limitations physiques :**
1. Les moteurs ont une plage de mouvement limitée
2. La tête peut entrer en collision avec le corps
3. Rotation du corps limitée à [-180, 180] degrés

**Limitations logicielles (sécurité) :**
1. Pitch et roll de la tête : [-40, 40] degrés
2. Yaw de la tête : [-180, 180] degrés
3. Différence body yaw - head yaw : [-65, 65] degrés

**Comportement :**
- Si les limites sont dépassées, le robot se déplace vers la position valide la plus proche
- Aucune erreur n'est levée, mais la position peut différer de la cible

### 13.4 Méthodes d'Interpolation

**Types disponibles :**
- `"minjerk"` (défaut) : Minimum jerk, mouvement naturel
- `"linear"` : Interpolation linéaire
- `"cartoon"` : Style cartoon, mouvement exagéré
- `"ease"` : Ease in/out

**Exemple :**
```python
reachy.goto_target(
    head=create_head_pose(y=10, mm=True),
    antennas=np.deg2rad([-45, -45]),
    duration=2.0,
    method="cartoon",  # Choisir la méthode
)
```

### 13.5 Utilisation de la Caméra

**Backends disponibles :**
- `"default"` : OpenCV (défaut)
- `"gstreamer"` : GStreamer (avancé, meilleure latence)
- `"no_media"` : Pas de média (pour tests sans caméra)

**Exemple basique :**
```python
with ReachyMini() as reachy:
    while True:
        frame = reachy.media.get_frame()
        if frame is not None:
            # Traiter la frame (numpy array OpenCV)
            cv2.imshow("Camera", frame)
```

**Exemple look_at_image :**
```python
# Faire regarder le robot un point dans l'image
reachy.look_at_image(x=320, y=240, duration=0.3)
```

### 13.6 Utilisation de l'Audio

**Microphone :**
```python
with ReachyMini() as mini:
    while True:
        sample = mini.media.get_audio_sample()
        # sample est un numpy array (sounddevice)
```

**Haut-parleur :**
```python
with ReachyMini() as mini:
    # chunk est un numpy array audio
    mini.media.push_audio_sample(chunk)
```

**Direction of Arrival (DOA) :**
- Nécessite firmware 2.1.0 ou supérieur
- Disponible uniquement sur version wireless avec 4 microphones

### 13.7 Mouvements Enregistrés (Recorded Moves)

**Datasets disponibles :**
- `pollen-robotics/reachy-mini-dances-library` : Bibliothèque de danses
- `pollen-robotics/reachy-mini-emotions-library` : Bibliothèque d'émotions

**Utilisation :**
```python
from reachy_mini.motion.recorded_move import RecordedMoves

recorded_moves = RecordedMoves("pollen-robotics/reachy-mini-dances-library")
print(recorded_moves.list_moves())

for move_name in recorded_moves.list_moves():
    move = recorded_moves.get(move_name)
    reachy.play_move(move, initial_goto_duration=1.0)
```

**Enregistrer ses propres mouvements :**
- Utiliser `start_recording()` et `stop_recording()`
- Outils disponibles : https://github.com/pollen-robotics/reachy_mini_toolbox/tree/main/tools/moves

---

## 🔧 14. API REST HTTP

### 14.1 Accès à l'API

**Endpoints principaux :**
- Documentation interactive : `http://localhost:8000/docs`
- Schema OpenAPI : `http://localhost:8000/openapi.json`
- Dashboard : `http://localhost:8000/`

**Base URL :** `http://localhost:8000/api`

### 14.2 Endpoints Disponibles

**État du robot :**
- `GET /api/state/full` : État complet du robot
- `GET /api/state/joints` : Positions des joints
- `GET /api/state/motors` : État des moteurs

**Contrôle :**
- `POST /api/motors/enable` : Activer les moteurs
- `POST /api/motors/disable` : Désactiver les moteurs
- `POST /api/motors/compliant` : Mode compliant

**Mouvement :**
- `POST /api/goto` : Mouvement interpolé
- `POST /api/set_target` : Positionnement immédiat

**Apps :**
- `GET /api/apps/list` : Lister les apps disponibles
- `POST /api/apps/install` : Installer une app
- `POST /api/apps/start` : Démarrer une app
- `POST /api/apps/stop` : Arrêter une app

### 14.3 WebSocket Support

**Connexion WebSocket :**
```javascript
let ws = new WebSocket(`ws://127.0.0.1:8000/api/state/ws/full`);

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log(data);
};
```

**Utilisation :**
- Mises à jour en temps réel de l'état du robot
- Idéal pour les interfaces web
- Faible latence

---

## 🎮 15. Exemples de Code Complets

### 15.1 Exemple Minimal (minimal_demo.py)

```python
"""Minimal demo for Reachy Mini."""

import time
import numpy as np
from reachy_mini import ReachyMini
from reachy_mini.utils import create_head_pose

with ReachyMini(media_backend="no_media") as mini:
    mini.goto_target(create_head_pose(), antennas=[0.0, 0.0], duration=1.0)
    try:
        while True:
            t = time.time()
            
            antennas_offset = np.deg2rad(20 * np.sin(2 * np.pi * 0.5 * t))
            pitch = np.deg2rad(10 * np.sin(2 * np.pi * 0.5 * t))
            
            head_pose = create_head_pose(
                roll=0.0,
                pitch=pitch,
                yaw=0.0,
                degrees=False,
                mm=False,
            )
            mini.set_target(head=head_pose, antennas=(antennas_offset, antennas_offset))
    except KeyboardInterrupt:
        pass
```

### 15.2 Exemple Look at Image (look_at_image.py)

```python
"""Make Reachy Mini look at clicked points in camera feed."""

import cv2
from reachy_mini import ReachyMini

def click(event, x, y, flags, param):
    if event == cv2.EVENT_LBUTTONDOWN:
        param["just_clicked"] = True
        param["x"] = x
        param["y"] = y

state = {"x": 0, "y": 0, "just_clicked": False}

cv2.namedWindow("Reachy Mini Camera")
cv2.setMouseCallback("Reachy Mini Camera", click, param=state)

with ReachyMini() as reachy_mini:
    while True:
        frame = reachy_mini.media.get_frame()
        if frame is None:
            continue
        
        cv2.imshow("Reachy Mini Camera", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
        
        if state["just_clicked"]:
            reachy_mini.look_at_image(state["x"], state["y"], duration=0.3)
            state["just_clicked"] = False
```

### 15.3 Exemple Recorded Moves (recorded_moves_example.py)

```python
"""Play recorded moves from Hugging Face datasets."""

from reachy_mini import ReachyMini
from reachy_mini.motion.recorded_move import RecordedMoves

recorded_moves = RecordedMoves("pollen-robotics/reachy-mini-dances-library")

with ReachyMini(use_sim=False, media_backend="no_media") as reachy:
    try:
        while True:
            for move_name in recorded_moves.list_moves():
                move = recorded_moves.get(move_name)
                print(f"Playing move: {move_name}: {move.description}")
                reachy.play_move(move, initial_goto_duration=1.0)
    except KeyboardInterrupt:
        print("\nSequence interrupted by user.")
```

### 15.4 Exemple App Complète avec Vision

```python
"""App complète avec vision par ordinateur."""

import threading
import time
import cv2
import numpy as np
from reachy_mini import ReachyMini, ReachyMiniApp
from reachy_mini.utils import create_head_pose

class VisionTrackingApp(ReachyMiniApp):
    def run(self, reachy_mini: ReachyMini, stop_event: threading.Event):
        """Track faces and make robot look at them."""
        while not stop_event.is_set():
            frame = reachy_mini.media.get_frame()
            if frame is None:
                time.sleep(0.1)
                continue
            
            # Détection de visage (exemple simplifié)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            # ... logique de détection ...
            
            # Si visage détecté, regarder vers le centre
            if face_detected:
                h, w = frame.shape[:2]
                center_x, center_y = w // 2, h // 2
                reachy_mini.look_at_image(center_x, center_y, duration=0.2)
            
            time.sleep(0.05)  # 20 Hz
```

---

## 🐛 16. Troubleshooting et Problèmes Courants

### 16.1 Problèmes de Microphone

**Symptôme :** Pas d'entrée microphone

**Solution :**
```bash
# Rebooter le microphone array
xvf_host(.exe) REBOOT 1

# Tester avec l'exemple
python examples/debug/sound_record.py
```

**Si problème persiste :**
- Vérifier les flex cables (slides 45-47 du guide d'assemblage)
- Vérifier la connexion USB

### 16.2 Sound Direction of Arrival (DOA)

**Symptôme :** DOA ne fonctionne pas

**Solution :**
- Nécessite firmware 2.1.0 ou supérieur
- Firmware dans `src/reachy_mini/assets/firmware/*.bin`
- Documentation Seeed : https://wiki.seeedstudio.com/respeaker_xvf3800_introduction/#update-firmware

### 16.3 Volume Trop Faible (Linux)

**Solution :**
```bash
# Vérifier avec alsamixer que PCM1 est à 100%
alsamixer

# Ajuster avec PCM,0
# Pour rendre permanent :
CARD=$(aplay -l | grep -i "reSpeaker XVF3800 4-Mic Array" | head -n1 | sed -n 's/^card \([0-9]*\):.*/\1/p')
amixer -c "$CARD" set PCM,1 100%
sudo alsactl store "$CARD"
```

### 16.4 Circular Buffer Overrun Warning (MuJoCo)

**Symptôme :** Warning dans la console en mode simulation

**Solution :**
```python
# Utiliser un backend sans vidéo
ReachyMini(media_backend="no_media")
# ou
ReachyMini(media_backend="default_no_video")
```

### 16.5 Détection du Port Série

**Symptôme :** Le daemon ne détecte pas le robot

**Solution :**
```bash
# Spécifier manuellement le port
reachy-mini-daemon -p /dev/ttyUSB0  # Linux
reachy-mini-daemon -p /dev/tty.usbserial-*  # macOS
```

---

## 📱 17. Versions et Configurations

### 17.1 Reachy Mini Lite

**Caractéristiques :**
- Prix : 299$
- Connexion : USB-C vers ordinateur
- Alimentation : Filaire
- Microphones : 2
- Haut-parleur : 5W
- Caméra : Grand-angle
- Mouvement : Tête 6 DOF
- Daemon : Sur l'ordinateur

**Configuration :**
- Compatible Mac/Linux
- Détection automatique du port série
- Pas de configuration réseau nécessaire

### 17.2 Reachy Mini Wireless

**Caractéristiques :**
- Prix : 449$
- Connexion : Wi-Fi / Bluetooth
- Alimentation : Batterie rechargeable
- Microphones : 4
- Haut-parleur : 5W
- Caméra : Grand-angle
- Accéléromètre : Oui
- Mouvement : Tête 6 DOF + rotation corps 360°
- Daemon : Sur Raspberry Pi 5 intégré

**Configuration Wi-Fi :**
1. Allumer le robot
2. Se connecter au réseau `reachy-mini-ap` (password: `reachy-mini`)
3. Ouvrir http://reachy-mini.local:8000/settings
4. Entrer les credentials Wi-Fi
5. Attendre la connexion

**Documentation complète :** `docs/wireless-version.md`

### 17.3 Version Simulation (MuJoCo)

**Installation :**
```bash
pip install reachy-mini[mujoco]
```

**Utilisation :**
```bash
reachy-mini-daemon --sim
```

**Scènes disponibles :**
- `empty` (défaut) : Scène vide
- `minimal` : Scène avec table et objets

**Note macOS :**
```bash
mjpython -m reachy_mini.daemon.app.main --sim
```

---

## 🎨 18. Applications Communautaires et Exemples

### 18.1 Applications Officielles

**Conversational Demo :**
- Repository : https://github.com/pollen-robotics/reachy_mini_conversation_demo
- Description : Combine LLM realtime APIs, vision pipelines, et choreographed motion
- Technologies : LLM, vision par ordinateur, bibliothèques de mouvement

**Reachy Mini Dancer :**
- Repository : https://github.com/LAURA-agent/reachy_mini_dancer
- Auteur : @Townie
- Description : Desktop viewer avec daemon UI et système de chorégraphie

### 18.2 Bibliothèques de Mouvements

**Datasets Hugging Face :**
- `pollen-robotics/reachy-mini-dances-library` : Danses
- `pollen-robotics/reachy-mini-emotions-library` : Émotions
- `pollen-robotics/reachy-mini-emotions-library` : Autres émotions

**Outils d'enregistrement :**
- Repository : https://github.com/pollen-robotics/reachy_mini_toolbox/tree/main/tools/moves
- Permet d'enregistrer et uploader des datasets

### 18.3 Espaces Hugging Face

**Recherche d'apps :**
- URL : https://huggingface.co/spaces?q=reachy_mini
- Filtre par tag `reachy_mini`
- Tri par likes, date, etc.

**Store Officiel :**
- URL : https://huggingface.co/spaces/pollen-robotics/Reachy_Mini_Apps
- Liste des apps approuvées

**Template d'App :**
- URL : https://huggingface.co/spaces/pollen-robotics/reachy_mini_app_example
- Template complet pour créer un Space

---

## 🌐 19. Hugging Face Spaces SDK - Détails Techniques

### 19.1 Structure d'un Space SDK

**Fichiers requis :**
```
votre-space/
├── app.py                  # Point d'entrée (obligatoire)
├── requirements.txt        # Dépendances Python
├── README.md              # Documentation
└── [votre_module/]        # Code de l'app (optionnel)
```

### 19.2 Fichier app.py pour Spaces

**Structure minimale :**
```python
"""
Point d'entrée pour Hugging Face Spaces SDK.
Ce fichier est exécuté par le Space SDK.
"""

import time
from reachy_mini import ReachyMini, ReachyMiniApp
import threading

class MonApp(ReachyMiniApp):
    def run(self, reachy_mini: ReachyMini, stop_event: threading.Event):
        # Votre code ici
        while not stop_event.is_set():
            # Logique de l'app
            time.sleep(0.1)

# Point d'entrée pour le Space SDK
if __name__ == "__main__":
    with ReachyMini() as reachy:
        app = MonApp()
        stop = threading.Event()
        try:
            app.run(reachy, stop)
        except KeyboardInterrupt:
            stop.set()
```

### 19.3 Requirements.txt

**Contenu minimal :**
```
reachy-mini
```

**Avec dépendances additionnelles :**
```
reachy-mini
opencv-python
numpy
```

**Note importante :**
- Utiliser `reachy-mini` (avec tiret) et non `reachy_mini`
- Spécifier les versions si nécessaire : `reachy-mini>=1.1.0`

### 19.4 Configuration du Space

**Tags requis :**
- `reachy_mini` (avec underscore) : Pour apparaître dans les recherches
- Tags additionnels recommandés : `robotics`, `ai`, `python`, `hardware`

**SDK Type :**
- Sélectionner "SDK" (pas Gradio, Streamlit, etc.)

**Hardware (si disponible) :**
- Sélectionner le hardware approprié si le Space SDK le supporte

**README.md :**
- Description claire de l'app
- Instructions d'installation
- Exemples d'utilisation
- Screenshots/GIFs
- Crédits

### 19.5 Découverte des Apps

**Méthode 1 : Liste Officielle**
- Dataset : `pollen-robotics/reachy-mini-official-app-store`
- Fichier : `app-list.json`
- Seules les apps dans cette liste apparaissent dans le store officiel
- Contacter l'équipe pour ajouter votre app

**Méthode 2 : Tag `reachy_mini`**
- Ajouter le tag à votre Space
- Apparaîtra dans les recherches générales
- Peut ne pas apparaître dans le store officiel

**API de recherche :**
- URL : `https://huggingface.co/api/spaces?filter=reachy_mini&sort=likes&direction=-1&limit=50&full=true`
- Utilisée par le système de découverte

---

## 📚 20. Ressources Complémentaires Exhaustives

### 20.1 Documentation Officielle

**Sites Web :**
- **Site Principal** : https://www.reachy-mini.org/
- **Spécifications** : https://www.reachy-mini.org/specifications.html
- **Achat** : https://www.reachy-mini.org/buy.html
- **À Propos** : https://www.reachy-mini.org/about.html
- **Vue d'Ensemble** : https://www.reachy-mini.org/overview.html

**Documentation Technique :**
- **GitHub Repository** : https://github.com/pollen-robotics/reachy_mini
- **Python SDK Docs** : `docs/python-sdk.md` (438 lignes)
- **REST API Docs** : `docs/rest-api.md`
- **Troubleshooting** : `docs/troubleshooting.md`
- **Wireless Setup** : `docs/wireless-version.md`
- **Raspberry Pi** : `docs/RPI.md`

### 20.2 Guides et Tutoriels

**Assemblage :**
- **Guide d'Assemblage** : https://huggingface.co/spaces/pollen-robotics/Reachy_Mini_Assembly_Guide
- Temps moyen : 3 heures
- Record : 43 minutes

**Développement :**
- **Awesome Apps** : `docs/awesome-apps.md`
- **Exemples de Code** : `examples/` directory
- **Conversational Demo** : https://github.com/pollen-robotics/reachy_mini_conversation_demo

### 20.3 Communautés et Support

**GitHub :**
- Repository Principal : https://github.com/pollen-robotics/reachy_mini
- Issues : Pour rapporter des bugs
- Pull Requests : Pour contribuer

**Hugging Face :**
- Spaces : https://huggingface.co/spaces?q=reachy_mini
- Datasets : https://huggingface.co/datasets?search=reachy-mini
- Hub : https://huggingface.co/pollen-robotics

**Communauté :**
- Discord : (à vérifier)
- Forums : (à vérifier)

### 20.4 Outils et Bibliothèques

**Outils Officiels :**
- `reachy-mini-make-app` : Générateur de template d'app
- `reachy-mini-daemon` : Daemon de contrôle
- Toolbox : https://github.com/pollen-robotics/reachy_mini_toolbox

**Bibliothèques Externes :**
- MuJoCo : Simulation physique
- OpenCV : Vision par ordinateur
- SoundDevice : Audio
- GStreamer : Pipeline média avancé

### 20.5 Exemples de Code Disponibles

**Dans le repository :**
- `examples/minimal_demo.py` : Démo minimale
- `examples/look_at_image.py` : Regarder un point dans l'image
- `examples/recorded_moves_example.py` : Jouer des mouvements
- `examples/goto_interpolation_playground.py` : Tester les interpolations
- `examples/reachy_compliant_demo.py` : Mode compliant
- `examples/rerun_viewer.py` : Visualisation avec Rerun
- `examples/sequence.py` : Séquences de mouvements
- `examples/mini_head_position_gui.py` : GUI pour position de tête

**Dans examples/debug/ :**
- `sound_record.py` : Enregistrer audio
- `sound_play.py` : Jouer audio
- `sound_doa.py` : Direction of Arrival
- `gstreamer_client.py` : Client GStreamer
- `joy_controller.py` : Contrôleur joystick
- Et plus...

### 20.6 Ressources d'Apprentissage

**Concepts Clés :**
- Robotique : Mouvements, cinématique, contrôle
- Vision par ordinateur : Détection, tracking
- Audio : Traitement du signal, DOA
- IA : Intégration avec modèles Hugging Face
- Python : Programmation asynchrone, threading

**Tutoriels Recommandés :**
- Python SDK : `docs/python-sdk.md`
- REST API : `docs/rest-api.md`
- Exemples : `examples/` directory
- Code communautaire : Hugging Face Spaces

---

## 🎓 21. Bonnes Pratiques Avancées

### 21.1 Gestion des Erreurs

**Pattern recommandé :**
```python
class MonApp(ReachyMiniApp):
    def run(self, reachy_mini: ReachyMini, stop_event: threading.Event):
        try:
            while not stop_event.is_set():
                # Code principal
                pass
        except Exception as e:
            print(f"Erreur dans l'app: {e}")
            # Nettoyage si nécessaire
        finally:
            # Nettoyage final
            pass
```

### 21.2 Performance et Optimisation

**Fréquences recommandées :**
- Mouvement haute fréquence : 50-100 Hz (`set_target`)
- Mouvement interpolé : 1-10 Hz (`goto_target`)
- Vision : 15-30 FPS
- Audio : Selon les besoins

**Optimisations :**
- Utiliser `media_backend="no_media"` si pas besoin de média
- Éviter les boucles bloquantes
- Vérifier `stop_event` régulièrement
- Utiliser `set_target` pour contrôle haute fréquence

### 21.3 Architecture d'App

**Structure recommandée :**
```python
class MonApp(ReachyMiniApp):
    def __init__(self):
        super().__init__()
        self.config = self.load_config()
        self.state = {}
    
    def load_config(self):
        """Charger la configuration."""
        return {}
    
    def initialize(self, reachy_mini):
        """Initialisation avant le run."""
        pass
    
    def run(self, reachy_mini: ReachyMini, stop_event: threading.Event):
        """Méthode principale."""
        self.initialize(reachy_mini)
        
        while not stop_event.is_set():
            self.update(reachy_mini, stop_event)
            time.sleep(0.01)
    
    def update(self, reachy_mini, stop_event):
        """Mise à jour de la boucle principale."""
        pass
    
    def cleanup(self):
        """Nettoyage à l'arrêt."""
        pass
```

### 21.4 Tests et Développement

**Tests locaux :**
```bash
# Installer l'app en mode développement
pip install -e mon_app/

# Tester avec le daemon local
reachy-mini-daemon
python mon_app/main.py

# Tester en simulation
reachy-mini-daemon --sim
python mon_app/main.py
```

**Tests sur Space :**
- Utiliser le mode "SDK" pour tester
- Vérifier les logs dans l'interface HF
- Tester avec différents hardware si disponible

---

## 📊 22. Statistiques et Informations Techniques

### 22.1 Spécifications Techniques Complètes

**Reachy Mini Lite :**
- Dimensions : 28 cm de hauteur
- Poids : 1.5 kg
- Alimentation : USB-C filaire
- Microphones : 2
- Haut-parleur : 5W
- Caméra : Grand-angle RGB
- Mouvement tête : 6 degrés de liberté
- Rotation corps : Limitée
- Prix : 299$

**Reachy Mini Wireless :**
- Dimensions : 28 cm de hauteur
- Poids : 1.5 kg
- Alimentation : Batterie rechargeable
- Microphones : 4
- Haut-parleur : 5W
- Caméra : Grand-angle RGB
- Accéléromètre : Oui
- Mouvement tête : 6 degrés de liberté
- Rotation corps : 360° complète
- Raspberry Pi : Pi 5 intégré
- Connectivité : Wi-Fi, Bluetooth
- Prix : 449$

### 22.2 Versions et Compatibilité

**Python :**
- Versions supportées : 3.10 à 3.13
- Recommandé : 3.10 ou 3.11

**Systèmes d'exploitation :**
- Linux : Testé et supporté
- macOS : Testé et supporté
- Windows : Fonctionne mais moins testé

**Dépendances principales :**
- numpy >= 2.2.5
- scipy >= 1.15.3, < 2.0.0
- reachy_mini_motor_controller >= 1.3.0
- eclipse-zenoh >= 1.4.0
- opencv-python <= 5.0
- fastapi
- uvicorn
- Et plus...

### 22.3 Version Actuelle

**Version du package :**
- Version actuelle : 1.1.0rc4 (release candidate)
- Statut : Beta
- Licence : Apache 2.0

---

## 🔗 23. Liens et Références Complets

### 23.1 Sites Officiels

- **Site Principal** : https://www.reachy-mini.org/
- **Pollen Robotics** : https://www.pollen-robotics.com/
- **Hugging Face** : https://huggingface.co/
- **Reachy Mini Dev** : https://www.reachymini.dev/

### 23.2 GitHub

- **Repository Principal** : https://github.com/pollen-robotics/reachy_mini
- **Conversational Demo** : https://github.com/pollen-robotics/reachy_mini_conversation_demo
- **Reachy Mini Dancer** : https://github.com/LAURA-agent/reachy_mini_dancer
- **Toolbox** : https://github.com/pollen-robotics/reachy_mini_toolbox

### 23.3 Hugging Face

- **Spaces** : https://huggingface.co/spaces?q=reachy_mini
- **Store Officiel** : https://huggingface.co/spaces/pollen-robotics/Reachy_Mini_Apps
- **Template App** : https://huggingface.co/spaces/pollen-robotics/reachy_mini_app_example
- **Assembly Guide** : https://huggingface.co/spaces/pollen-robotics/Reachy_Mini_Assembly_Guide
- **Datasets** :
  - https://huggingface.co/datasets/pollen-robotics/reachy-mini-dances-library
  - https://huggingface.co/datasets/pollen-robotics/reachy-mini-emotions-library
  - https://huggingface.co/datasets/pollen-robotics/reachy-mini-official-app-store

### 23.4 Documentation Externe

- **MuJoCo** : https://mujoco.org
- **OpenCV** : https://opencv.org
- **FastAPI** : https://fastapi.tiangolo.com
- **GStreamer** : https://gstreamer.freedesktop.org
- **Seeed ReSpeaker** : https://wiki.seeedstudio.com/respeaker_xvf3800_introduction

---

## 📝 24. Checklist Complète de Création d'App

### Phase 1 : Préparation
- [ ] Python >= 3.10 installé
- [ ] `reachy-mini` installé (`pip install reachy-mini`)
- [ ] Daemon testé et fonctionnel (`reachy-mini-daemon`)
- [ ] Compte Hugging Face créé
- [ ] Environnement de développement configuré

### Phase 2 : Développement Local
- [ ] Structure créée (`reachy-mini-make-app` ou manuel)
- [ ] `pyproject.toml` configuré avec entry points
- [ ] Classe `ReachyMiniApp` implémentée
- [ ] Méthode `run()` implémentée
- [ ] Gestion de `stop_event` correcte
- [ ] Code testé localement avec daemon
- [ ] Code testé en simulation (`--sim`)
- [ ] Gestion d'erreurs implémentée
- [ ] README.md écrit

### Phase 3 : Déploiement HF Spaces
- [ ] Space créé sur Hugging Face
- [ ] SDK sélectionné (pas Gradio/Streamlit)
- [ ] Fichiers uploadés (app.py, requirements.txt, README.md)
- [ ] `requirements.txt` contient `reachy-mini`
- [ ] Tag `reachy_mini` ajouté
- [ ] Tags additionnels ajoutés
- [ ] README.md complet avec description
- [ ] Screenshots/GIFs ajoutés
- [ ] App testée sur le Space

### Phase 4 : Partage et Amélioration
- [ ] App fonctionne correctement
- [ ] Documentation complète
- [ ] Exemples d'utilisation fournis
- [ ] App partagée avec la communauté
- [ ] Feedback collecté
- [ ] Améliorations apportées

---

## 🎯 25. Conclusion et Recommandations Finales

### 25.1 Résumé des Points Clés

**Pour créer une app Reachy Mini réussie :**

1. ✅ **Utiliser les outils officiels** : `reachy-mini-make-app` pour la structure
2. ✅ **Comprendre la structure** : `pyproject.toml` avec entry points corrects
3. ✅ **Respecter le pattern** : Hériter de `ReachyMiniApp`, implémenter `run()`
4. ✅ **Gérer proprement** : Vérifier `stop_event`, gérer les erreurs
5. ✅ **Tester localement** : Avant de déployer sur HF Spaces
6. ✅ **Documenter** : README complet avec exemples
7. ✅ **Taguer correctement** : `reachy_mini` pour la découverte

### 25.2 Améliorations Nécessaires au Tutoriel

**Le tutoriel actuel doit être refondu pour inclure :**

1. **6 étapes détaillées** au lieu de 4 simplifiées
2. **Exemples de code complets** et fonctionnels
3. **Référence à `reachy-mini-make-app`** comme méthode recommandée
4. **Explication des entry points** dans `pyproject.toml`
5. **Détails sur HF Spaces SDK** (app.py, requirements.txt)
6. **Section troubleshooting** avec problèmes courants
7. **Liens vers toutes les ressources** (docs, exemples, templates)
8. **Bonnes pratiques** et patterns recommandés
9. **Exemples visuels** (screenshots, structure de fichiers)
10. **Checklist complète** pour validation

### 25.3 Ressources à Intégrer

**Dans le nouveau tutoriel :**
- Lien vers template HF Spaces
- Lien vers `reachy-mini-make-app`
- Lien vers documentation Python SDK
- Lien vers exemples de code
- Lien vers troubleshooting
- Lien vers awesome apps
- Lien vers datasets de mouvements

### 25.4 Format Proposé

**Structure visuelle :**
- Cards numérotées (comme actuellement)
- Code blocks avec syntax highlighting
- Boutons d'action pour liens externes
- Screenshots de structure de fichiers
- Tips et warnings visuels
- Exemples interactifs

---

**Date du rapport** : 2025-01-27  
**Auteur** : Analyse exhaustive du codebase et documentation  
**Version** : 2.0 (Exhaustive)  
**Nombre de sections** : 25  
**Nombre de lignes** : ~1500+

