# Auto Évasion

Jeu d'auto **dans le navigateur** : la route défile, le trafic arrive en face,
on saute par-dessus. 90 niveaux, une route qui passe de une à trois voies,
des camions à franchir au bon moment, des pièces, un bouclier — et un garage
de 17 autos à débloquer (communes, rares, épiques, légendaires).

Python (Flask) côté serveur, canvas côté navigateur. Aucune ressource externe :
pas une image, pas une police, pas un son téléchargé — tout est dessiné et
synthétisé par le code.

En ligne : <https://auto.gestiondojo.ca>

## Jouer

| Touche | Tactile | Action |
|---|---|---|
| Espace ou ↑ | toucher | sauter |
| W / S | glisser vers le haut / le bas | changer de voie |
| P ou Échap | bouton ❚❚ | pause |
| M | — | couper le son |

Un niveau se termine quand tous ses obstacles sont passés et que la ligne
d'arrivée est franchie. Un accident termine la partie : le niveau atteint et
les points vont au tableau des scores (avec un pseudo, rien d'autre).

## Ce qui est en Python

- **`app/niveaux.py`** — les 90 niveaux. Le navigateur ne connaît aucune
  règle de difficulté : il reçoit vitesse, écart, nombre d'obstacles, voies,
  probabilités et **graine**. Même graine, mêmes obstacles pour tout le monde.
- **`app/voitures.py`** — le garage et les niveaux de déblocage. Décoratif :
  aucune auto ne saute plus haut qu'une autre.
- **`app/scores.py`** — le tableau des meilleurs scores, un JSON verrouillé
  (deux workers gunicorn), écrit atomiquement, 50 entrées gardées.
- **`app/routes.py`** — `/`, `/api/niveaux`, `/api/voitures`, `/api/scores`
  (GET/POST), `/sante`.

Ce qui survit à un rechargement (niveau atteint, auto choisie, pseudo, son)
vit dans le `localStorage` du navigateur : ni compte, ni témoin, ni suivi.

## Démarrage local

```bash
uv sync --all-groups
cp .env.example .env
uv run python run.py
```

→ http://127.0.0.1:5300

## Tests

```bash
uv run ruff check .
uv run pytest -q
```

`tests/test_niveaux.py` vérifie que la difficulté **monte** de niveau en niveau
et que la physique du saut (constantes reprises de `static/js/jeu.js`) permet
encore de franchir un camion et de retomber entre deux obstacles au niveau 90.
Changer la gravité ou la vitesse maximale sans repasser ces tests, c'est
livrer un niveau injouable sans le savoir.

## Mise en ligne

Voir **[deploy/README.md](deploy/README.md)** : même recette que
`jeux.gestiondojo.ca` (gunicorn sur le port 8004, service systemd
`auto-gestiondojo`, vhost nginx, hôte dans Caddy, modèle « releases + current »).

## Structure

```
run.py                 point d'entrée (gunicorn importe run:app)
config.py              configuration lue de l'environnement / .env
app/__init__.py        fabrique Flask
app/niveaux.py         les 90 niveaux
app/voitures.py        le garage
app/scores.py          le tableau des scores (JSON)
app/routes.py          page, API, healthcheck
templates/             base, index (jeu), 404
static/js/jeu.js       le jeu (canvas, physique, entrées, sons)
static/css/styles.css  mise en page, HUD, voiles, garage
deploy/                gunicorn, deploy.sh, systemd, nginx, caddy
tests/                 pytest
```
