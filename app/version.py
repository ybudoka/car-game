"""La version du jeu — lue dans `pyproject.toml`, et nulle part ailleurs.

Aucune dependance (pas meme `tomllib`) : lecture par expression reguliere,
pour que ce fichier puisse etre execute par n'importe quel python3.
"""

from __future__ import annotations

import re
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
PYPROJET = RACINE / "pyproject.toml"

_LIGNE = re.compile(r'^version\s*=\s*"(\d+)\.(\d+)\.(\d+)"[ \t]*$', re.MULTILINE)


def lire(chemin: Path = PYPROJET) -> str:
    trouve = _LIGNE.search(chemin.read_text(encoding="utf-8"))
    if not trouve:
        raise ValueError(f'aucune ligne « version = "x.y.z" » dans {chemin}')
    return ".".join(trouve.groups())


#: Lu UNE fois au demarrage : le fichier ne change pas sous un processus lance.
VERSION = lire()


if __name__ == "__main__":
    print(VERSION)
