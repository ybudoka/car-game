# Mise en ligne — auto.gestiondojo.ca

Meme recette que le site de jeux (`jeux.gestiondojo.ca`) : Flask sous
gunicorn, service systemd, vhost nginx, hote declare dans Caddy.

```
Internet :443 → Caddy (TLS) → nginx 127.0.0.1:8080 → gunicorn 127.0.0.1:8005
```

| | |
|---|---|
| Sous-domaine | `auto.gestiondojo.ca` |
| Port gunicorn | **8005** (8003 = site de jeux, 8004 = KidTube : ne pas reutiliser) |
| Service | `auto-gestiondojo` |
| Dossier | `/srv/auto` |
| Utilisateur du deploiement | `dojoadmin` |
| Utilisateur du service | `www-data` |

## Installation initiale (une seule fois)

```bash
ssh dojoadmin@103.98.215.181

# 1. Arborescence
sudo mkdir -p /srv/auto/{releases,shared/donnees}
sudo chown -R dojoadmin:dojoadmin /srv/auto
sudo chown www-data:www-data /srv/auto/shared/donnees   # gunicorn y ecrit scores.json
git clone git@github.com:ybudoka/car-game.git /srv/auto/repo

# 2. Configuration du serveur (hors release)
cp /srv/auto/repo/.env.example /srv/auto/shared/.env
#   puis editer : SECRET_KEY (unique), APP_BASE_URL=https://auto.gestiondojo.ca,
#   DONNEES_DIR=/srv/auto/shared/donnees, STATIC_MAX_AGE=604800
sudo chown dojoadmin:www-data /srv/auto/shared/.env
sudo chmod 640 /srv/auto/shared/.env

# 3. Service systemd
sudo install -m 644 /srv/auto/repo/deploy/systemd/auto-gestiondojo.service.example \
  /etc/systemd/system/auto-gestiondojo.service
sudo systemctl daemon-reload
sudo systemctl enable auto-gestiondojo

# 4. nginx
sudo install -m 644 /srv/auto/repo/deploy/nginx/auto-gestiondojo.conf.example \
  /etc/nginx/sites-available/auto-gestiondojo.conf
sudo ln -sfn /etc/nginx/sites-available/auto-gestiondojo.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 5. DNS + Caddy : voir deploy/caddy/README.md

# 6. Premiere release
bash /srv/auto/repo/deploy/deploy.sh main
```

## Chaque mise en ligne suivante

```bash
ssh dojoadmin@103.98.215.181 'bash /srv/auto/repo/deploy/deploy.sh main'
```

Le script pose la release a cote de l'ancienne, redemarre le service et ne
garde la bascule que si `/sante` repond. Sinon il revient a la precedente.

## Verifications

```bash
# ⚠️ Toujours un -A : le serveur ferme (444) tout User-Agent contenant « curl ».
curl -s -A navigateur https://auto.gestiondojo.ca/sante
curl -sI -A navigateur -H 'Accept-Encoding: gzip' \
  https://auto.gestiondojo.ca/static/js/jeu.js | grep -i content-encoding
sudo journalctl -u auto-gestiondojo -n 50
```

## Revenir en arriere

```bash
ln -sfn /srv/auto/releases/<precedente> /srv/auto/current
sudo systemctl restart auto-gestiondojo
```
