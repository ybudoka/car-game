"""Point d'entree local. En production c'est gunicorn qui importe `run:app`."""

import os
from pathlib import Path

from dotenv import load_dotenv

# En production les variables sont injectees par systemd ; on ne charge le .env
# que s'il est lisible, pour ne jamais faire echouer le demarrage.
dotenv_path = Path(__file__).resolve().parent / ".env"
if dotenv_path.exists() and os.access(dotenv_path, os.R_OK):
    load_dotenv(dotenv_path=dotenv_path, override=True)

from app import create_app  # noqa: E402  (apres le chargement du .env)
from config import port_de_dev  # noqa: E402  (idem)

app = create_app()


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        debug=app.config.get("DEBUG", False),
        port=port_de_dev(),
        use_reloader=True,
    )
