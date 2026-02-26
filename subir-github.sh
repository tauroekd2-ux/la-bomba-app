#!/bin/bash
# Ejecuta en Git Bash: bash subir-github.sh "https://github.com/TU_USUARIO/TU_REPO.git"
# O crea REPO_URL.txt con esa URL y ejecuta: bash subir-github.sh

REPO_URL="${1:-}"
if [ -f "REPO_URL.txt" ]; then
  REPO_URL="$(cat REPO_URL.txt | tr -d '\r\n' | xargs)"
fi
if [ -z "$REPO_URL" ]; then
  REPO_URL="https://github.com/TU_USUARIO/TU_REPO.git"
fi

cd "$(dirname "$0")"
if [ -n "$(git remote)" ]; then
  echo "Ya hay un remote. Para cambiar: git remote set-url origin $REPO_URL"
else
  git remote add origin "$REPO_URL"
fi
git branch -M main
git push -u origin main
echo "Listo. Conecta este repo en Render (New → Blueprint) con la URL del repo."
