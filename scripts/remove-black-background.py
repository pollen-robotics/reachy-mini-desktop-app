#!/usr/bin/env python3
"""
Script pour rendre transparent le fond noir autour des stickers PNG
tout en préservant les pixels noirs à l'intérieur des formes.

Utilise un algorithme de flood fill depuis les bords pour identifier
uniquement le fond noir connecté aux bords de l'image.
"""

import os
import sys
from PIL import Image
from collections import deque


def is_black(pixel, threshold=30):
    """
    Vérifie si un pixel est considéré comme noir (avec une tolérance).
    
    Args:
        pixel: Tuple (R, G, B) ou (R, G, B, A)
        threshold: Seuil de tolérance pour le noir (0-255)
    
    Returns:
        bool: True si le pixel est noir
    """
    r, g, b = pixel[0], pixel[1], pixel[2]
    return r <= threshold and g <= threshold and b <= threshold


def get_border_pixels(width, height):
    """
    Génère les coordonnées de tous les pixels sur les bords de l'image.
    
    Args:
        width: Largeur de l'image
        height: Hauteur de l'image
    
    Yields:
        Tuple (x, y) des coordonnées des pixels de bord
    """
    # Bord supérieur et inférieur
    for x in range(width):
        yield (x, 0)
        if height > 1:
            yield (x, height - 1)
    
    # Bords gauche et droit (sans les coins déjà couverts)
    for y in range(1, height - 1):
        yield (0, y)
        if width > 1:
            yield (width - 1, y)


def flood_fill_from_borders(img, black_threshold=30):
    """
    Identifie tous les pixels noirs connectés aux bords de l'image
    en utilisant un algorithme de flood fill.
    
    Args:
        img: Image PIL en mode RGBA
        black_threshold: Seuil pour considérer un pixel comme noir
    
    Returns:
        set: Ensemble des coordonnées (x, y) des pixels à rendre transparents
    """
    width, height = img.size
    pixels = img.load()
    to_remove = set()
    visited = set()
    
    # Parcourir tous les pixels de bord
    for start_x, start_y in get_border_pixels(width, height):
        if (start_x, start_y) in visited:
            continue
        
        pixel = pixels[start_x, start_y]
        
        # Si le pixel de bord est noir, démarrer un flood fill
        if is_black(pixel, black_threshold):
            queue = deque([(start_x, start_y)])
            visited.add((start_x, start_y))
            
            while queue:
                x, y = queue.popleft()
                to_remove.add((x, y))
                
                # Vérifier les 4 voisins (haut, bas, gauche, droite)
                for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nx, ny = x + dx, y + dy
                    
                    # Vérifier les limites
                    if 0 <= nx < width and 0 <= ny < height:
                        if (nx, ny) not in visited:
                            neighbor_pixel = pixels[nx, ny]
                            if is_black(neighbor_pixel, black_threshold):
                                visited.add((nx, ny))
                                queue.append((nx, ny))
    
    return to_remove


def remove_black_background(input_path, output_path=None, black_threshold=30):
    """
    Rend transparent le fond noir d'une image PNG.
    
    Args:
        input_path: Chemin vers l'image d'entrée
        output_path: Chemin vers l'image de sortie (si None, remplace l'original)
        black_threshold: Seuil pour considérer un pixel comme noir (0-255)
    """
    # Ouvrir l'image et convertir en RGBA
    img = Image.open(input_path).convert("RGBA")
    
    print(f"Traitement de: {os.path.basename(input_path)}")
    print(f"  Taille: {img.size[0]}x{img.size[1]}")
    
    # Identifier les pixels à rendre transparents
    pixels_to_remove = flood_fill_from_borders(img, black_threshold)
    print(f"  Pixels à rendre transparents: {len(pixels_to_remove)}")
    
    # Rendre transparents les pixels identifiés
    pixels = img.load()
    for x, y in pixels_to_remove:
        r, g, b, a = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)  # Alpha = 0 pour la transparence
    
    # Sauvegarder
    if output_path is None:
        output_path = input_path
    
    img.save(output_path, "PNG")
    print(f"  ✓ Sauvegardé: {output_path}\n")


def process_directory(directory_path, black_threshold=30, backup=True):
    """
    Traite tous les fichiers PNG d'un répertoire.
    
    Args:
        directory_path: Chemin vers le répertoire
        black_threshold: Seuil pour considérer un pixel comme noir
        backup: Si True, crée une sauvegarde avant modification
    """
    if not os.path.isdir(directory_path):
        print(f"Erreur: {directory_path} n'est pas un répertoire valide")
        return
    
    # Trouver tous les fichiers PNG
    png_files = [f for f in os.listdir(directory_path) 
                 if f.lower().endswith('.png')]
    
    if not png_files:
        print(f"Aucun fichier PNG trouvé dans {directory_path}")
        return
    
    print(f"Trouvé {len(png_files)} fichier(s) PNG à traiter\n")
    
    for filename in sorted(png_files):
        input_path = os.path.join(directory_path, filename)
        
        # Créer une sauvegarde si demandé
        if backup:
            backup_path = os.path.join(directory_path, f"{filename}.backup")
            if not os.path.exists(backup_path):
                img_backup = Image.open(input_path)
                img_backup.save(backup_path, "PNG")
                print(f"  Sauvegarde créée: {backup_path}")
        
        # Traiter l'image
        remove_black_background(input_path, black_threshold=black_threshold)


def main():
    """Point d'entrée principal du script."""
    if len(sys.argv) < 2:
        print("Usage:")
        print(f"  {sys.argv[0]} <chemin_image.png> [seuil]")
        print(f"  {sys.argv[0]} <chemin_repertoire> [seuil] [--no-backup]")
        print("\nExemples:")
        print(f"  {sys.argv[0]} image.png")
        print(f"  {sys.argv[0]} image.png 50")
        print(f"  {sys.argv[0]} ./src/assets/reachies")
        print(f"  {sys.argv[0]} ./src/assets/reachies 30 --no-backup")
        print("\nLe seuil (0-255) détermine ce qui est considéré comme 'noir'.")
        print("Par défaut: 30 (plus le seuil est élevé, plus de pixels seront traités)")
        sys.exit(1)
    
    path = sys.argv[1]
    black_threshold = 30
    backup = True
    
    # Parser les arguments
    for arg in sys.argv[2:]:
        if arg == "--no-backup":
            backup = False
        elif arg.isdigit():
            black_threshold = int(arg)
            if not (0 <= black_threshold <= 255):
                print(f"Erreur: Le seuil doit être entre 0 et 255")
                sys.exit(1)
    
    if os.path.isfile(path):
        # Traiter un seul fichier
        remove_black_background(path, black_threshold=black_threshold)
    elif os.path.isdir(path):
        # Traiter un répertoire
        process_directory(path, black_threshold=black_threshold, backup=backup)
    else:
        print(f"Erreur: {path} n'existe pas")
        sys.exit(1)


if __name__ == "__main__":
    main()

