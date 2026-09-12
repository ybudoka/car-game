def test_accueil(client):
    reponse = client.get("/")
    assert reponse.status_code == 200
    html = reponse.get_data(as_text=True)
    assert 'id="toile"' in html
    assert "/api/niveaux" in html
    assert "/static/js/jeu.js" in html


def test_sante(client):
    donnees = client.get("/sante").get_json()
    assert donnees["ok"] is True
    assert donnees["version"].count(".") == 2


def test_api_niveaux_et_voitures(client):
    assert len(client.get("/api/niveaux").get_json()["niveaux"]) == 90
    voitures = client.get("/api/voitures").get_json()
    assert voitures["voitures"][0]["slug"] == "rouge"
    assert "legendaire" in voitures["raretes"]


def test_api_scores(client):
    assert client.get("/api/scores").get_json() == {"scores": []}

    refus = client.post("/api/scores", json={"pseudo": "", "niveau": 1, "points": 0})
    assert refus.status_code == 400
    assert "pseudo" in refus.get_json()["erreur"]

    ok = client.post("/api/scores", json={"pseudo": "Léa", "niveau": 4, "points": 1230})
    assert ok.status_code == 201
    assert ok.get_json()["rang"] == 1
    assert client.get("/api/scores").get_json()["scores"][0]["pseudo"] == "Léa"


def test_404(client):
    reponse = client.get("/nulle-part")
    assert reponse.status_code == 404
    assert "Mauvaise sortie" in reponse.get_data(as_text=True)


def test_statiques(client):
    assert client.get("/static/js/jeu.js").status_code == 200
    assert client.get("/static/css/styles.css").status_code == 200
    assert client.get("/static/img/favicon.svg").status_code == 200
