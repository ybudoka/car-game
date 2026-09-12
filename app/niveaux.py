"""Les 90 niveaux du jeu — generes ici, en Python, et servis au navigateur.

Le navigateur ne connait AUCUNE regle de difficulte : il recoit une liste et
la joue. Tout ce qui fait qu'un niveau est plus dur que le precedent (vitesse,
espacement, longueur des obstacles, nombre de voies) se decide dans ce fichier,
et un test verifie que la difficulte MONTE, jamais ne redescend.

Chaque niveau porte aussi une `graine` : le navigateur en tire ses obstacles
avec un generateur deterministe, donc le niveau 37 est le meme pour tout le
monde. Un tableau des scores ne veut rien dire si chacun joue un jeu different.
"""

from __future__ import annotations

from typing import TypedDict

NB_NIVEAUX = 90

#: Vitesse de defilement, en pixels par seconde, du premier au dernier niveau.
VITESSE_MIN = 260.0
VITESSE_MAX = 720.0

#: Temps de route (en secondes) entre deux obstacles, du plus large au plus
#: serre. ⚠️ En SECONDES et non en pixels : un ecart fixe en pixels devient
#: derisoire quand la vitesse triple, et au niveau 90 le joueur retombait
#: sur l'obstacle suivant quoi qu'il fasse (tests/test_niveaux.py le garde).
TEMPS_ECART_MAX = 2.2
TEMPS_ECART_MIN = 0.85

#: Obstacles a franchir pour terminer le niveau.
OBSTACLES_MIN = 8
OBSTACLES_MAX = 40


class Niveau(TypedDict):
    numero: int
    vitesse: float
    ecart: float
    obstacles: int
    voies: int
    proba_camion: float
    proba_mur: float
    proba_bouclier: float
    proba_piece: float
    graine: int


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def _progression(numero: int) -> float:
    """0.0 au niveau 1, 1.0 au niveau 90."""
    return (numero - 1) / (NB_NIVEAUX - 1)


def voies_du_niveau(numero: int) -> int:
    """Une seule voie pour apprendre a sauter, puis deux, puis trois."""
    if numero <= 10:
        return 1
    if numero <= 30:
        return 2
    return 3


def niveau(numero: int) -> Niveau:
    if not 1 <= numero <= NB_NIVEAUX:
        raise ValueError(f"niveau {numero} hors de 1..{NB_NIVEAUX}")

    t = _progression(numero)
    # La vitesse monte par paliers de 10 niveaux : a l'interieur d'une dizaine
    # le joueur sent qu'il progresse par le nombre d'obstacles, pas par la
    # vitesse, et chaque nouvelle dizaine est un vrai cran.
    palier = (numero - 1) // 10 / 8.0
    vitesse = round(_lerp(VITESSE_MIN, VITESSE_MAX, palier), 1)
    # Ecart en pixels, deduit du temps : c'est ce que le navigateur consomme.
    ecart = round(vitesse * _lerp(TEMPS_ECART_MAX, TEMPS_ECART_MIN, t), 1)
    obstacles = round(_lerp(OBSTACLES_MIN, OBSTACLES_MAX, t))

    return Niveau(
        numero=numero,
        vitesse=vitesse,
        ecart=ecart,
        obstacles=obstacles,
        voies=voies_du_niveau(numero),
        # Les camions (longs, il faut sauter au bon moment) apparaissent a partir
        # du niveau 4, jusqu'a un obstacle sur trois.
        proba_camion=0.0 if numero < 4 else round(min(0.34, 0.06 + t * 0.32), 3),
        # Un « mur » = un obstacle sur CHAQUE voie en meme temps : changer de
        # voie ne suffit plus, il faut sauter. Sans lui, a trois voies, le
        # joueur pourrait rouler dans la voie vide sans jamais sauter.
        proba_mur=0.0 if voies_du_niveau(numero) == 1 else round(min(0.5, 0.15 + t * 0.4), 3),
        # Un bouclier de temps en temps : plus rare quand le niveau est long,
        # sinon il porte le joueur d'un bout a l'autre.
        proba_bouclier=round(max(0.03, 0.10 - t * 0.06), 3),
        proba_piece=0.35,
        # Graine deterministe, distincte d'un niveau a l'autre.
        graine=(numero * 2654435761 + 97) % 2_147_483_647,
    )


def tous() -> list[Niveau]:
    return [niveau(n) for n in range(1, NB_NIVEAUX + 1)]
