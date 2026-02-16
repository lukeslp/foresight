"""
Database management for Foresight
SQLite with WAL mode for concurrent access

This module provides Flask integration for the ForesightDB class.
The actual database implementation is in the root-level db.py module.
"""
import sys
from pathlib import Path

# Add parent directory to path to import db.py
root_dir = Path(__file__).parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from db import ForesightDB
from flask import g, current_app


def get_db():
    """Get ForesightDB instance from Flask g object"""
    if 'foresight_db' not in g:
        g.foresight_db = ForesightDB(current_app.config['DB_PATH'])
    return g.foresight_db


def close_db(e=None):
    """Close database connection (cleanup if needed)"""
    # ForesightDB uses context managers, no persistent connection to close
    g.pop('foresight_db', None)


def init_db(app):
    """Initialize database schema"""
    with app.app_context():
        db = get_db()
        # Schema is automatically initialized in ForesightDB.__init__
        app.logger.info(f'ForesightDB initialized at {app.config["DB_PATH"]} with WAL mode enabled')
