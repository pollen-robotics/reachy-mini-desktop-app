#!/bin/bash
# Script pour afficher la clé privée à copier dans GitHub Secrets
# À exécuter manuellement par l'utilisateur

echo "🔑 Clé privée à copier dans GitHub Secret 'TAURI_SIGNING_KEY':"
echo ""
cat ~/.tauri/reachy-mini.key | base64 -d
echo ""
echo ""
echo "⚠️  Ne partagez JAMAIS cette clé privée publiquement !"

