from app import voitures


def test_la_premiere_auto_est_libre():
    assert voitures.CATALOGUE[0]["niveau_requis"] == 1


def test_les_deblocages_montent():
    requis = [v["niveau_requis"] for v in voitures.CATALOGUE]
    assert requis == sorted(requis)
    assert requis[-1] <= 90


def test_slugs_uniques_et_raretes_connues():
    slugs = [v["slug"] for v in voitures.CATALOGUE]
    assert len(slugs) == len(set(slugs))
    for v in voitures.CATALOGUE:
        assert v["rarete"] in voitures.RARETES
        assert v["forme"] in {"berline", "sport", "muscle", "fusee"}
        assert v["couleur"].startswith("#") and len(v["couleur"]) == 7


def test_chaque_rarete_a_au_moins_une_auto():
    presentes = {v["rarete"] for v in voitures.CATALOGUE}
    assert presentes == set(voitures.RARETES)


def test_debloquees():
    assert [v["slug"] for v in voitures.debloquees(1)] == ["rouge"]
    assert len(voitures.debloquees(90)) == len(voitures.CATALOGUE)
    assert voitures.par_slug("rouge")["nom"] == "Rouge"
    assert voitures.par_slug("inconnue") is None
