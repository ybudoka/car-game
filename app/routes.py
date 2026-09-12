"""Les routes : une page, trois API, un healthcheck."""

from __future__ import annotations

from flask import Blueprint, current_app, jsonify, render_template, request

from . import niveaux, voitures
from .scores import ScoreInvalide, Tableau

bp = Blueprint("jeu", __name__)


def tableau() -> Tableau:
    return current_app.extensions["tableau_scores"]


@bp.route("/")
def accueil():
    return render_template(
        "index.html",
        nb_niveaux=niveaux.NB_NIVEAUX,
        raretes=voitures.RARETES,
    )


@bp.route("/api/niveaux")
def api_niveaux():
    return jsonify({"niveaux": niveaux.tous()})


@bp.route("/api/voitures")
def api_voitures():
    return jsonify({"voitures": voitures.CATALOGUE, "raretes": voitures.RARETES})


@bp.route("/api/scores", methods=["GET"])
def api_scores():
    return jsonify({"scores": tableau().meilleurs()})


@bp.route("/api/scores", methods=["POST"])
def api_scores_ajouter():
    try:
        score, rang = tableau().ajouter(request.get_json(silent=True))
    except ScoreInvalide as erreur:
        return jsonify({"erreur": str(erreur)}), 400
    return jsonify({"score": score, "rang": rang, "scores": tableau().meilleurs()}), 201


@bp.route("/sante")
def sante():
    """Healthcheck lu par deploy.sh — en direct sur gunicorn, jamais via nginx."""
    return jsonify({"ok": True, "version": current_app.extensions["version"]})


@bp.app_errorhandler(404)
def introuvable(_erreur):
    return render_template("404.html"), 404
