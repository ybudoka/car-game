"""Le tableau des meilleurs scores — un fichier JSON, rien de plus.

Pas de base de donnees : quelques dizaines d'entrees, ecrites rarement. Le
fichier est reecrit en entier a chaque ajout, sous un verrou de processus ET un
verrou de fichier (gunicorn a deux workers : deux requetes simultanees
ecriraient sinon l'une par-dessus l'autre).

Ce qui est garde : un pseudo court, le niveau atteint, les points. Rien qui
identifie une personne — un pseudo est ce que le joueur a choisi d'ecrire.
"""

from __future__ import annotations

import fcntl
import json
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path

from .niveaux import NB_NIVEAUX

NB_GARDES = 50
NB_AFFICHES = 10
PSEUDO_MAX = 16

#: Lettres (accents compris), chiffres, espace, tiret, souligne. Rien d'autre :
#: le pseudo est reaffiche a tout le monde.
_PSEUDO = re.compile(r"^[\w \-]{1,16}$", re.UNICODE)

_verrou = threading.Lock()


class ScoreInvalide(ValueError):
    pass


def valider(donnees: object) -> dict:
    """Rend {pseudo, niveau, points} propre, ou leve ScoreInvalide."""
    if not isinstance(donnees, dict):
        raise ScoreInvalide("corps attendu : un objet JSON")

    pseudo = str(donnees.get("pseudo", "")).strip()
    pseudo = re.sub(r"\s+", " ", pseudo)
    if not _PSEUDO.match(pseudo):
        raise ScoreInvalide(f"pseudo : 1 à {PSEUDO_MAX} lettres, chiffres, espaces ou tirets")

    niveau = donnees.get("niveau")
    points = donnees.get("points")
    if not isinstance(niveau, int) or isinstance(niveau, bool):
        raise ScoreInvalide("niveau : entier attendu")
    if not isinstance(points, int) or isinstance(points, bool):
        raise ScoreInvalide("points : entier attendu")
    if not 1 <= niveau <= NB_NIVEAUX:
        raise ScoreInvalide(f"niveau : entre 1 et {NB_NIVEAUX}")
    if not 0 <= points <= 10_000_000:
        raise ScoreInvalide("points : hors bornes")

    return {"pseudo": pseudo, "niveau": niveau, "points": points}


def _cle(score: dict) -> tuple:
    return (-score["niveau"], -score["points"], score.get("date", ""))


class Tableau:
    def __init__(self, dossier: str | os.PathLike) -> None:
        self.dossier = Path(dossier)
        self.fichier = self.dossier / "scores.json"

    def _lire_sans_verrou(self) -> list[dict]:
        if not self.fichier.exists():
            return []
        try:
            contenu = json.loads(self.fichier.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            return []
        if not isinstance(contenu, list):
            return []
        return [s for s in contenu if isinstance(s, dict)]

    def meilleurs(self, n: int = NB_AFFICHES) -> list[dict]:
        with _verrou:
            scores = self._lire_sans_verrou()
        scores.sort(key=_cle)
        return scores[:n]

    def ajouter(self, donnees: object) -> tuple[dict, int]:
        """Ajoute un score. Rend (score, rang 1-based dans le tableau garde)."""
        score = valider(donnees)
        score["date"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        self.dossier.mkdir(parents=True, exist_ok=True)
        verrou_fichier = self.dossier / ".scores.lock"

        with _verrou, open(verrou_fichier, "w") as fd:
            fcntl.flock(fd, fcntl.LOCK_EX)
            try:
                scores = self._lire_sans_verrou()
                scores.append(score)
                scores.sort(key=_cle)
                scores = scores[:NB_GARDES]
                # Ecriture atomique : un plantage en pleine ecriture ne laisse
                # jamais un JSON tronque.
                temporaire = self.fichier.with_suffix(".json.tmp")
                temporaire.write_text(
                    json.dumps(scores, ensure_ascii=False, indent=1), encoding="utf-8"
                )
                os.replace(temporaire, self.fichier)
            finally:
                fcntl.flock(fd, fcntl.LOCK_UN)

        rang = next((i + 1 for i, s in enumerate(scores) if s is score), 0)
        return score, rang
