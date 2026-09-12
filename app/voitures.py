"""Le garage : les autos que le joueur peut debloquer, avec leur rarete.

Une auto se debloque en atteignant un niveau. Le navigateur recoit ce catalogue
et decide, d'apres le niveau atteint (garde en localStorage), lesquelles sont
ouvertes. Comme pour les niveaux, la source unique est ICI.

Chaque auto est purement decorative : aucune ne saute plus haut qu'une autre.
Le jeu recompense le joueur avec des autos, pas avec un avantage — sinon le
tableau des scores comparerait des garages, pas des joueurs.
"""

from __future__ import annotations

from typing import TypedDict

RARETES: dict[str, str] = {
    "commune": "Commune",
    "rare": "Rare",
    "epique": "Épique",
    "legendaire": "Légendaire",
}


class Voiture(TypedDict):
    slug: str
    nom: str
    rarete: str
    couleur: str
    accent: str
    forme: str
    niveau_requis: int


def _v(slug, nom, rarete, couleur, accent, forme, niveau_requis) -> Voiture:
    return Voiture(
        slug=slug,
        nom=nom,
        rarete=rarete,
        couleur=couleur,
        accent=accent,
        forme=forme,
        niveau_requis=niveau_requis,
    )


#: ⚠️ Dans l'ordre de deblocage. Un test verifie que les niveaux requis montent
#: et que la premiere auto est libre des le niveau 1.
CATALOGUE: list[Voiture] = [
    _v("rouge", "Rouge", "commune", "#e63946", "#ffffff", "berline", 1),
    _v("orange", "Orange", "commune", "#f77f00", "#ffffff", "berline", 3),
    _v("bleue", "Bleue", "commune", "#3a86ff", "#ffffff", "berline", 6),
    _v("verte", "Verte", "commune", "#2a9d8f", "#ffffff", "berline", 9),
    _v("jaune", "Taxi jaune", "commune", "#ffd60a", "#111111", "berline", 12),
    _v("mauve", "Mauve", "rare", "#8338ec", "#ffbe0b", "sport", 15),
    _v("cerise", "Cerise", "rare", "#c9184a", "#ffffff", "sport", 20),
    _v("turquoise", "Turquoise", "rare", "#06d6a0", "#073b4c", "sport", 25),
    _v("neige", "Neige", "rare", "#f1faee", "#1d3557", "sport", 30),
    _v("charbon", "Charbon", "epique", "#222222", "#ff4d6d", "muscle", 36),
    _v("cuivre", "Cuivre", "epique", "#b5651d", "#ffe8d6", "muscle", 42),
    _v("emeraude", "Émeraude", "epique", "#00a86b", "#e0fbfc", "muscle", 48),
    _v("nuit", "Nuit polaire", "epique", "#1b263b", "#8ecae6", "muscle", 54),
    _v("or", "Or", "legendaire", "#ffb703", "#ffffff", "fusee", 60),
    _v("argent", "Argent", "legendaire", "#c0c0c0", "#0d1b2a", "fusee", 70),
    _v("aurore", "Aurore", "legendaire", "#ff006e", "#3a86ff", "fusee", 80),
    _v("yoseikan", "Yoseikan", "legendaire", "#000000", "#d90429", "fusee", 90),
]


def par_slug(slug: str) -> Voiture | None:
    for voiture in CATALOGUE:
        if voiture["slug"] == slug:
            return voiture
    return None


def debloquees(niveau_atteint: int) -> list[Voiture]:
    return [v for v in CATALOGUE if v["niveau_requis"] <= niveau_atteint]
