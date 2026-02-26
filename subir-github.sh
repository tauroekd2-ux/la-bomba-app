#!/bin/bash
# Ejecuta en Git Bash desde la carpeta la-bomba-app.
# 1. Crea un repo nuevo en https://github.com/new (nombre ej: la-bomba-app), vacío, sin README.
# 2. Sustituye abajo TU_USUARIO y TU_REPO por tu usuario y nombre del repo.
# 3. Ejecuta: bash subir-github.sh

REPO_URL="https://github.com/TU_USUARIO/TU_REPO.git"
# Si usas SSH: REPO_URL="git@github.com:TU_USUARIO/TU_REPO.git"

cd "$(dirname "$0")"
if [ -n "$(git remote)" ]; then
  echo "Ya hay un remote. Para cambiar: git remote set-url origin $REPO_URL"
else
  git remote add origin "$REPO_URL"
fi
git branch -M main
git push -u origin main
echo "Listo. Conecta este repo en Render (New → Blueprint) con la URL del repo."
