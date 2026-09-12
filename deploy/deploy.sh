#!/usr/bin/env bash
# Deploiement d'Auto Évasion sur le serveur de gestiondojo.ca.
#
#   ssh dojoadmin@103.98.215.181
#   bash /srv/auto/repo/deploy/deploy.sh [branche]
#
# ⚠️ A lancer en tant que **dojoadmin**, PAS `www-data` — meme raison que pour
# le site de jeux : `/srv/auto/releases` appartient a dojoadmin et le
# `git fetch` passe par sa cle SSH. Le service, lui, tourne en www-data.
#
# Modele « releases + current » : la nouvelle version est construite a cote,
# et `current` ne bascule qu'une fois le site verifie. Un deploiement rate ne
# coupe donc jamais le site en ligne.
#
# Arborescence attendue (voir deploy/README.md pour l'installation initiale) :
#   /srv/auto/repo/            clone git (origine des releases)
#   /srv/auto/shared/.env      configuration du serveur (hors release)
#   /srv/auto/shared/donnees/  scores.json (hors release, appartient a www-data)
#   /srv/auto/releases/        versions horodatees
#   /srv/auto/current          lien symbolique vers la release active

set -euo pipefail

BRANCHE="${1:-main}"
BASE=/srv/auto
DEPOT="$BASE/repo"
RELEASES="$BASE/releases"
HORODATAGE="$(date +%Y%m%d%H%M%S)"
CIBLE="$RELEASES/$HORODATAGE"
SERVICE=auto-gestiondojo
PORT=8005

echo "==> Recuperation de la branche $BRANCHE"
git -C "$DEPOT" fetch --prune origin "$BRANCHE"
git -C "$DEPOT" reset --hard "origin/$BRANCHE"

echo "==> Nouvelle release : $CIBLE"
mkdir -p "$CIBLE"
git -C "$DEPOT" archive HEAD | tar -x -C "$CIBLE"

echo "==> Environnement Python"
python3 -m venv "$CIBLE/.venv"
"$CIBLE/.venv/bin/pip" install --upgrade pip --quiet
"$CIBLE/.venv/bin/pip" install -r "$CIBLE/requirements.txt" --quiet

echo "==> Configuration partagee"
ln -sfn "$BASE/shared/.env" "$CIBLE/.env"

echo "==> Bascule"
ANCIENNE="$(readlink -f "$BASE/current" || true)"
ln -sfn "$CIBLE" "$BASE/current"
sudo systemctl restart "$SERVICE"

# ⚠️ Ce curl vise gunicorn EN DIRECT (port 8005) : nginx renvoie 444 a tout
# User-Agent contenant « curl » (regle anti-robots du serveur). Un healthcheck
# qui passerait par nginx ou Caddy verrait une panne sur un site sain.
echo "==> Verification (/sante)"
for tentative in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:$PORT/sante" > /dev/null; then
    echo "Site en ligne."
    # On ne garde que les 5 dernieres releases : le disque du serveur est petit.
    ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +6 | xargs -r rm -rf
    exit 0
  fi
  sleep 2
done

echo "!! Le healthcheck a echoue — retour a la version precedente" >&2
if [ -n "$ANCIENNE" ] && [ -d "$ANCIENNE" ]; then
  ln -sfn "$ANCIENNE" "$BASE/current"
  sudo systemctl restart "$SERVICE"
fi
exit 1
