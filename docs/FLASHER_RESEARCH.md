# Recherche : Reflash OS du Reachy Mini via l'App Desktop

> **Date** : 29 Janvier 2026  
> **Objectif** : Étudier la faisabilité d'intégrer une fonctionnalité de reflash de l'OS du Raspberry Pi CM4 interne au Reachy Mini, directement depuis l'application Tauri.

---

## Table des matières

1. [Contexte Technique](#1-contexte-technique)
2. [Recherche des Solutions Existantes](#2-recherche-des-solutions-existantes)
3. [Analyse Comparative](#3-analyse-comparative)
4. [Implémentation Réalisée](#4-implémentation-réalisée)
5. [Recommandations Finales](#5-recommandations-finales)
6. [Prochaines Étapes](#6-prochaines-étapes)

---

## 1. Contexte Technique

### 1.1 Hardware du Reachy Mini

Le Reachy Mini utilise un **Raspberry Pi Compute Module 4 (CM4)** avec :
- **16 GB de stockage eMMC** intégré (pas de carte SD amovible)
- Un **switch "Download/Normal"** pour basculer en mode USB boot
- Un port **USB** pour la connexion au PC hôte

### 1.2 Spécificité du CM4 eMMC

Contrairement aux Raspberry Pi classiques avec carte SD :
- L'eMMC n'est **pas amovible**
- Il faut utiliser **`rpiboot`** pour mettre le CM4 en mode "mass storage"
- Une fois en mode mass storage, l'eMMC apparaît comme un disque USB classique

### 1.3 Workflow de Flash CM4

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Éteindre le Reachy Mini                                     │
│  2. Mettre le switch sur "DOWNLOAD"                             │
│  3. Brancher le câble USB vers le PC                            │
│  4. Exécuter rpiboot → CM4 passe en mode mass storage           │
│  5. Flasher l'image .img sur le "disque" détecté                │
│  6. Éjecter, remettre switch sur "NORMAL", redémarrer           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Recherche des Solutions Existantes

### 2.1 Outils Officiels

| Outil | Description | Intègre rpiboot ? |
|-------|-------------|-------------------|
| **rpiboot** (CLI) | Outil officiel Raspberry Pi pour USB boot | N/A (c'est lui) |
| **usbbootgui** | GUI officiel Qt (Linux only principalement) | Oui |
| **Raspberry Pi Imager** | GUI officiel pour flasher | ❌ Non, besoin de rpiboot externe |

### 2.2 Outils Tiers

| Outil | Stack | CM4 intégré ? | Maturité |
|-------|-------|---------------|----------|
| **Balena Etcher** | Electron/TypeScript | ✅ **OUI** (depuis 2018) | ⭐⭐⭐⭐⭐ Production |
| **Armbian Imager** | Tauri/Rust | ❌ Non | ⭐⭐⭐⭐ |
| **rustpiboot** | Rust | ⚠️ Théorique | ⭐ Immature |

### 2.3 Découverte Majeure : Balena Etcher

Etcher (v1.4.3+, avril 2018) a **intégré nativement** le support des Compute Modules :

> *"Etcher now packs a small Linux kernel that is passed to the Compute Module. That kernel boots the device up and exposes it as a USB mass storage device."*

Ils ont créé **`node-raspberrypi-usbboot`** :
- Module Node.js qui réimplémente `rpiboot`
- Embarque un kernel Linux minimaliste
- Atteint **20 MB/s** (plus rapide que rpiboot officiel)
- **Cross-platform** (avec limitations macOS/Windows)
- Utilisé en **production depuis 6+ ans**
- Open source : https://github.com/balena-io-modules/node-raspberrypi-usbboot

---

## 3. Analyse Comparative

### 3.1 Problèmes Cross-Platform de rpiboot

Des problèmes significatifs existent sur macOS et Windows :

**macOS** :
- CM4 ne s'affiche parfois pas dans l'arbre USB
- Problèmes reportés sur Apple Silicon ET Intel
- Hub USB souvent incompatible → connexion directe obligatoire

**Windows 11** :
- Échecs de montage eMMC répétés
- Erreurs "USB device malfunction"
- Problèmes de drivers récurrents

**Linux** : ✅ Fonctionne généralement bien

### 3.2 Options d'Implémentation

| Option | Effort | Fiabilité | UX |
|--------|--------|-----------|-----|
| **A. Ouvrir Etcher** | 🟢 Faible | ⭐⭐⭐⭐⭐ | Externe mais fiable |
| **B. Porter node-raspberrypi-usbboot en Rust** | 🔴 12-18 jours | ⭐⭐⭐ | Intégré |
| **C. Utiliser rustpiboot** | 🟡 Moyen | ⭐⭐ | Intégré mais risqué |
| **D. Guide + Raspberry Pi Imager** | 🟢 Faible | ⭐⭐⭐⭐ | Semi-externe |

### 3.3 Évaluation de rustpiboot

| Critère | Valeur | Verdict |
|---------|--------|---------|
| Stars GitHub | **2** ⭐ | Très faible adoption |
| Dernière version | **v0.3.0** (~2 ans) | Pas de maintenance récente |
| Commits | **13 total** | Projet minimal |
| Documentation | **6%** | Quasi inexistante |
| Status | "Work in progress" | Pas production-ready |

---

## 4. Implémentation Réalisée

### 4.1 Module Flasher (Code Actuel)

Un module Rust cross-platform a été créé pour le flash de disques :

```
src-tauri/src/flasher/
├── mod.rs              # Commandes Tauri exposées
├── types.rs            # Types partagés (BlockDevice, FlashProgress, etc.)
├── devices/
│   ├── mod.rs          # Orchestration détection
│   ├── linux.rs        # lsblk JSON
│   ├── macos.rs        # diskutil
│   └── windows.rs      # WMI/PowerShell
└── writer/
    ├── mod.rs          # Logique de flash commune
    ├── linux.rs        # Write direct + sync
    ├── macos.rs        # diskutil unmount + dd via osascript
    └── windows.rs      # CreateFileW + WriteFile Win32
```

### 4.2 Fonctionnalités Implémentées

- ✅ Détection cross-platform des périphériques bloc
- ✅ Filtrage des disques "sûrs" (non-système, amovibles)
- ✅ Progress reporting via channels async
- ✅ Vérification post-écriture
- ✅ Gestion des permissions (elevation)

### 4.3 Ce qui Manque (pour CM4)

- ❌ Intégration rpiboot/usbboot
- ❌ Détection du CM4 en mode boot USB
- ❌ Téléchargement automatique des images depuis GitHub
- ❌ UI frontend (wizard)

---

## 5. Recommandations Finales

### 5.1 Court Terme (v1) : Option Hybride

**Approche recommandée** : Intégrer un bouton "Reflash OS" qui :

1. **Affiche un wizard** avec instructions visuelles :
   - Retirer la face avant
   - Mettre le switch sur "DOWNLOAD"
   - Brancher le câble USB
   
2. **Télécharge l'image** depuis GitHub Releases automatiquement
   - URL : https://github.com/pollen-robotics/reachy-mini-os/releases
   - Format : `.img` (potentiellement compressé)

3. **Ouvre Balena Etcher** avec l'image pré-sélectionnée
   - Etcher gère **tout** : rpiboot, flash, vérification
   - Propose d'installer Etcher si absent

**Avantages** :
- Fiabilité maximale (Etcher testé sur millions de machines)
- Zéro maintenance côté rpiboot
- UX guidée dans notre app

### 5.2 Long Terme : Portage Rust Complet

Si une intégration totale est souhaitée :

1. **Fork et améliorer `rustpiboot`** (base existante)
2. **Ajouter** : events, progress, détection mass storage, hotplug
3. **Tester** exhaustivement sur les 3 OS

**Estimation** : 12-18 jours de développement

### 5.3 Risques à Considérer

| Risque | Probabilité | Impact |
|--------|-------------|--------|
| Hotplug USB ne marche pas sur Windows | 🟡 Moyenne | 🟡 |
| Problèmes USB sur macOS (hérités du protocole) | 🔴 Haute | 🔴 |
| Permissions USB sur Linux sans root | 🟡 Moyenne | 🟡 |

---

## 6. Prochaines Étapes

### Si on choisit l'Option A (Etcher)

- [ ] Créer le composant UI wizard dans React
- [ ] Implémenter le téléchargement d'image depuis GitHub API
- [ ] Détecter si Etcher est installé (par OS)
- [ ] Ouvrir Etcher avec l'image via deep link ou CLI
- [ ] Documenter le process pour les utilisateurs

### Si on choisit l'Option B (Portage Rust)

- [ ] Phase 1 : Fork rustpiboot, ajouter events + progress
- [ ] Phase 2 : Détection mass storage + hotplug basique  
- [ ] Phase 3 : Intégration Tauri + tests cross-platform
- [ ] Phase 4 : UI frontend

---

## Ressources

### Liens Utiles

- **Reachy Mini OS Releases** : https://github.com/pollen-robotics/reachy-mini-os/releases
- **rpiboot officiel** : https://github.com/raspberrypi/usbboot
- **node-raspberrypi-usbboot** : https://github.com/balena-io-modules/node-raspberrypi-usbboot
- **rustpiboot** : https://github.com/MathiasKoch/rustpiboot
- **Balena Etcher** : https://github.com/balena-io/etcher
- **Raspberry Pi Imager** : https://github.com/raspberrypi/rpi-imager

### Documentation Technique

- [Blog Balena : Compute Module Support](https://blog.balena.io/etcher-now-with-multi-write-and-compute-module-support/)
- [Jeff Geerling : Flash CM4 eMMC](https://www.jeffgeerling.com/blog/2020/how-flash-raspberry-pi-os-compute-module-4-emmc-usbboot)
- [Raspberry Pi : USB Boot Mode](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#usb-device-boot-mode)
