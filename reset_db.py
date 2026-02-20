#!/usr/bin/env python3
"""
Reset the Consensus database with the correct schema.
Backs up the old database before removing it.
"""
import os
import shutil
from pathlib import Path
from datetime import datetime

# Get project root
project_root = Path(__file__).parent
db_path = project_root / 'consensus.db'

# Check if database exists
if db_path.exists():
    # Create backup with timestamp
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = project_root / f'consensus.db.backup_{timestamp}'

    print(f"Backing up database to: {backup_path}")
    shutil.copy(db_path, backup_path)

    # Remove old database files
    for pattern in ['consensus.db', 'consensus.db-shm', 'consensus.db-wal']:
        file_path = project_root / pattern
        if file_path.exists():
            print(f"Removing: {file_path}")
            os.remove(file_path)

    print("Database reset complete. It will be recreated on next startup.")
else:
    print("No database file found. Nothing to reset.")
