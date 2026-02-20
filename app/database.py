"""
Database management for Consensus
SQLite with WAL mode for concurrent access

This module provides Flask integration for the ConsensusDB class.
The actual database implementation is in the root-level db.py module.
"""
import sys
from pathlib import Path

# Add parent directory to path to import db.py
root_dir = Path(__file__).parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from db import ConsensusDB
from flask import g, current_app


def get_db():
    """Get ConsensusDB instance from Flask g object"""
    if 'consensus_db' not in g:
        g.consensus_db = ConsensusDB(current_app.config['DB_PATH'])
    return g.consensus_db


def close_db(e=None):
    """Close database connection (cleanup if needed)"""
    # ConsensusDB uses context managers, no persistent connection to close
    g.pop('consensus_db', None)


def init_db(app):
    """Initialize database schema"""
    with app.app_context():
        db = get_db()
        # Schema is automatically initialized in ConsensusDB.__init__
        app.logger.info(f'ConsensusDB initialized at {app.config["DB_PATH"]} with WAL mode enabled')
