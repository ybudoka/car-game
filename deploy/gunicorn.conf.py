# Gunicorn d'Auto Évasion.
#
# ⚠️ Le port 8005 n'est pas arbitraire : sur le serveur de gestiondojo.ca,
# 8000 = production, 8001 = dev, 8002 = conceptk, 8003 = site de jeux, 8004 = KidTube.
# Reprendre un port occupe ferait echouer le demarrage du service (adresse
# deja utilisee) — ou pire, ferait servir un autre site.
bind = "127.0.0.1:8005"

# Une page, trois API JSON et un fichier de scores : des workers synchrones
# suffisent largement.
workers = 2
threads = 4
timeout = 60
graceful_timeout = 30
accesslog = "-"
errorlog = "-"
capture_output = True
