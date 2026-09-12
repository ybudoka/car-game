#!/usr/bin/env python3
"""Verifie que `requirements.txt` et `pyproject.toml` listent la meme chose.

Le deploiement (`deploy/deploy.sh`) installe depuis `requirements.txt`, alors
que la CI et le venv local passent par `pyproject.toml`. Une divergence n'a pas
l'air grave : elle veut simplement dire que la CI teste autre chose que ce qui
tourne en production.
"""

from __future__ import annotations

import re
import sys
import tomllib
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent


def _nom(ligne: str) -> str:
    """« flask>=3.1.0 » -> « flask » (comparaison sur le nom, pas la borne)."""
    return re.split(r"[<>=!~\[ ]", ligne.strip(), maxsplit=1)[0].lower().replace("_", "-")


def lire_requirements() -> dict[str, str]:
    lignes = (RACINE / "requirements.txt").read_text(encoding="utf-8").splitlines()
    return {
        _nom(ligne): ligne.strip()
        for ligne in lignes
        if ligne.strip() and not ligne.lstrip().startswith("#")
    }


def lire_pyproject() -> dict[str, str]:
    donnees = tomllib.loads((RACINE / "pyproject.toml").read_text(encoding="utf-8"))
    return {_nom(dep): dep for dep in donnees["project"]["dependencies"]}


def main() -> int:
    requirements = lire_requirements()
    pyproject = lire_pyproject()

    problemes: list[str] = []
    for nom in sorted(set(pyproject) - set(requirements)):
        problemes.append(f"absent de requirements.txt : {pyproject[nom]}")
    for nom in sorted(set(requirements) - set(pyproject)):
        problemes.append(f"absent de pyproject.toml : {requirements[nom]}")
    for nom in sorted(set(requirements) & set(pyproject)):
        if requirements[nom] != pyproject[nom]:
            problemes.append(
                f"bornes differentes pour {nom} : "
                f"requirements.txt « {requirements[nom]} » vs pyproject.toml « {pyproject[nom]} »"
            )

    if problemes:
        print("Les dependances divergent :", file=sys.stderr)
        for probleme in problemes:
            print(f"  - {probleme}", file=sys.stderr)
        return 1

    print(f"{len(requirements)} dependances synchronisees.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
