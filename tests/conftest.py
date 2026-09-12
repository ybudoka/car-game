import sys
from pathlib import Path

import pytest

RACINE = Path(__file__).resolve().parent.parent
if str(RACINE) not in sys.path:
    sys.path.insert(0, str(RACINE))

from app import create_app  # noqa: E402
from config import Config  # noqa: E402


@pytest.fixture
def app(tmp_path):
    class ConfigTest(Config):
        TESTING = True
        DONNEES_DIR = str(tmp_path / "donnees")

    return create_app(ConfigTest)


@pytest.fixture
def client(app):
    return app.test_client()
