"""La difficulte monte, et le saut reste possible jusqu'au niveau 90."""

from app import niveaux

# ⚠️ Doivent rester egaux aux constantes de static/js/jeu.js : c'est la
# physique du navigateur qu'on verifie ici contre les niveaux du serveur.
GRAVITE = 9.2
IMPULSION = 3.4
SEUIL_SAUT = 0.32
AUTO_L = 64
CAMION_L = 150


def test_il_y_a_90_niveaux():
    tous = niveaux.tous()
    assert len(tous) == 90
    assert [n["numero"] for n in tous] == list(range(1, 91))


def test_la_difficulte_ne_redescend_jamais():
    tous = niveaux.tous()
    for avant, apres in zip(tous, tous[1:]):
        assert apres["vitesse"] >= avant["vitesse"]
        # L'ecart se juge en temps de route, pas en pixels : a un changement
        # de palier de vitesse, les pixels montent mais le temps, lui, baisse.
        assert apres["ecart"] / apres["vitesse"] <= avant["ecart"] / avant["vitesse"] + 1e-9
        assert apres["obstacles"] >= avant["obstacles"]
        assert apres["voies"] >= avant["voies"]
        assert apres["proba_camion"] >= avant["proba_camion"]


def test_les_premiers_niveaux_apprennent():
    premier = niveaux.niveau(1)
    assert premier["voies"] == 1
    assert premier["proba_camion"] == 0.0
    assert premier["proba_mur"] == 0.0
    assert niveaux.niveau(90)["voies"] == 3


def test_les_graines_sont_distinctes():
    graines = [n["graine"] for n in niveaux.tous()]
    assert len(set(graines)) == 90
    assert all(0 < g < 2**31 for g in graines)


def test_hors_bornes():
    import pytest

    with pytest.raises(ValueError):
        niveaux.niveau(0)
    with pytest.raises(ValueError):
        niveaux.niveau(91)


def _temps_au_dessus_du_seuil() -> float:
    """Duree pendant laquelle h(t) = v0·t − g·t²/2 depasse SEUIL_SAUT."""
    # Racines de −g/2·t² + v0·t − seuil = 0
    a, b, c = -GRAVITE / 2, IMPULSION, -SEUIL_SAUT
    disc = b * b - 4 * a * c
    assert disc > 0, "le saut n'atteint jamais le seuil"
    t1 = (-b + disc**0.5) / (2 * a)
    t2 = (-b - disc**0.5) / (2 * a)
    return abs(t2 - t1)


def test_un_camion_reste_franchissable_au_niveau_90():
    """Le saut doit couvrir la traversee d'un camion, avec de la marge."""
    dernier = niveaux.niveau(90)
    traversee = (AUTO_L + CAMION_L) / dernier["vitesse"]
    assert _temps_au_dessus_du_seuil() > traversee * 1.3


def test_on_peut_retomber_entre_deux_obstacles_au_niveau_90():
    """Sinon le dernier niveau exigerait un vol permanent."""
    dernier = niveaux.niveau(90)
    duree_saut = 2 * IMPULSION / GRAVITE
    # Ecart minimal entre le bout d'un obstacle et le debut du suivant.
    trou = dernier["ecart"] * 0.85 / dernier["vitesse"]
    assert duree_saut < trou + (AUTO_L + CAMION_L) / dernier["vitesse"]
