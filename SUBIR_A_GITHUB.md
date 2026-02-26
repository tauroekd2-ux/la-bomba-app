# Subir LA BOMBA a GitHub

El proyecto en **la-bomba-app** ya tiene Git inicializado y un commit listo. Solo falta conectar tu repositorio de GitHub y hacer push.

## Pasos

### 1. Crear el repositorio en GitHub

1. Entra en [github.com/new](https://github.com/new).
2. **Repository name:** por ejemplo `la-bomba-app`.
3. Elige **Public**.
4. **No** marques "Add a README", ".gitignore" ni "license" (el repo debe empezar vacío).
5. Clic en **Create repository**.

### 2. Subir el código (Git Bash)

Abre **Git Bash**, ve a la carpeta del proyecto y ejecuta (sustituye `TU_USUARIO` y `TU_REPO` por tu usuario y nombre del repo):

```bash
cd "c:/Users/EDGAR/edgar robot/la-bomba-app"
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git branch -M main
git push -u origin main
```

Si GitHub te pide usuario y contraseña, usa tu usuario y un **Personal Access Token** (no la contraseña de la cuenta). Para crear un token: GitHub → Settings → Developer settings → Personal access tokens.

### 3. O usar el script

1. Abre `subir-github.sh` y cambia `TU_USUARIO` y `TU_REPO` en la línea de `REPO_URL`.
2. En Git Bash:

```bash
cd "c:/Users/EDGAR/edgar robot/la-bomba-app"
bash subir-github.sh
```

Cuando el push termine, conecta ese repositorio en **Render** (New → Blueprint) y sigue las instrucciones de `RENDER.md`.
