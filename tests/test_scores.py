import json

import pytest

from app.scores import Tableau, ScoreInvalide, valider


def test_valider_nettoie_le_pseudo():
    assert valider({"pseudo": "  Léa   Tremblay ", "niveau": 3, "points": 10})["pseudo"] == "Léa Tremblay"


@pytest.mark.parametrize(
    "donnees",
    [
        None,
        [],
        {"pseudo": "", "niveau": 1, "points": 0},
        {"pseudo": "<script>", "niveau": 1, "points": 0},
        {"pseudo": "x" * 17, "niveau": 1, "points": 0},
        {"pseudo": "ok", "niveau": 0, "points": 0},
        {"pseudo": "ok", "niveau": 91, "points": 0},
        {"pseudo": "ok", "niveau": "3", "points": 0},
        {"pseudo": "ok", "niveau": True, "points": 0},
        {"pseudo": "ok", "niveau": 3, "points": -1},
        {"pseudo": "ok", "niveau": 3, "points": 1.5},
    ],
)
def test_valider_refuse(donnees):
    with pytest.raises(ScoreInvalide):
        valider(donnees)


def test_tableau_trie_par_niveau_puis_points(tmp_path):
    tableau = Tableau(tmp_path / "d")
    tableau.ajouter({"pseudo": "a", "niveau": 2, "points": 500})
    tableau.ajouter({"pseudo": "b", "niveau": 5, "points": 100})
    _, rang = tableau.ajouter({"pseudo": "c", "niveau": 5, "points": 300})
    assert rang == 1
    assert [s["pseudo"] for s in tableau.meilleurs()] == ["c", "b", "a"]


def test_tableau_ne_garde_que_les_meilleurs(tmp_path):
    tableau = Tableau(tmp_path / "d")
    for i in range(60):
        tableau.ajouter({"pseudo": f"j{i}", "niveau": 1, "points": i})
    contenu = json.loads((tmp_path / "d" / "scores.json").read_text())
    assert len(contenu) == 50
    assert contenu[0]["points"] == 59


def test_fichier_corrompu_ne_plante_pas(tmp_path):
    dossier = tmp_path / "d"
    dossier.mkdir()
    (dossier / "scores.json").write_text("{pas du json")
    tableau = Tableau(dossier)
    assert tableau.meilleurs() == []
    tableau.ajouter({"pseudo": "x", "niveau": 1, "points": 1})
    assert len(tableau.meilleurs()) == 1
