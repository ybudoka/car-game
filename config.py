"""Configuration du jeu.

Le jeu n'a ni compte ni base de donnees : la progression (niveau atteint,
autos debloquees, auto choisie) vit dans le `localStorage` du navigateur. La
seule chose que le serveur garde, c'est le tableau des meilleurs scores, dans
un fichier JSON sous `DONNEES_DIR`.
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

RACINE = Path(__file__).resolve().parent


def port_de_dev() -> int:
    """Port du serveur local — source unique, lu a l'appel pour voir le .env."""
    explicite = (os.getenv("APP_PORT") or os.getenv("FLASK_RUN_PORT") or "").strip()
    if explicite.isdigit():
        return int(explicite)

    base_url = (os.getenv("APP_BASE_URL") or "").strip()
    if base_url:
        port = urlparse(base_url).port
        if port:
            return port

    return 5300


def _flag(name: str, default: bool = False) -> bool:
    valeur = (os.getenv(name) or "").strip().lower()
    if not valeur:
        return default
    return valeur in {"1", "true", "yes", "on", "oui"}


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "cle-de-developpement-a-changer")

    SITE_NAME = os.getenv("SITE_NAME", "Auto Évasion")
    SITE_TAGLINE = os.getenv(
        "SITE_TAGLINE",
        "Saute par-dessus le trafic, débloque des autos, grimpe les 90 niveaux",
    )
    SITE_AUTEUR = os.getenv("SITE_AUTEUR", "Martin Gagné")

    APP_BASE_URL = os.getenv("APP_BASE_URL", "http://127.0.0.1:5300")

    # Ou vit scores.json. Relatif a la racine du projet si ce n'est pas absolu.
    DONNEES_DIR = str((RACINE / os.getenv("DONNEES_DIR", "donnees")).resolve())

    SEND_FILE_MAX_AGE_DEFAULT = int(os.getenv("STATIC_MAX_AGE", "0"))

    DEBUG = _flag("FLASK_DEBUG", False)
