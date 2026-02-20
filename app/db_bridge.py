"""
Database Bridge for Consensus
Provides Flask integration for the ConsensusDB class
"""
import sys
from pathlib import Path

# Add parent directory to path to import db.py
root_dir = Path(__file__).parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from db import ConsensusDB
from flask import g, current_app


def get_consensus_db():
    """Get ConsensusDB instance from Flask g object"""
    if 'consensus_db' not in g:
        g.consensus_db = ConsensusDB(current_app.config['DB_PATH'])
    return g.consensus_db


def close_consensus_db(e=None):
    """Close database connection (cleanup if needed)"""
    # ConsensusDB uses context managers, no persistent connection to close
    g.pop('consensus_db', None)
