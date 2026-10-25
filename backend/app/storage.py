"""Opaque Yjs update log. No canvas JSON or transient cursor state is persisted."""

import sqlite3
from contextlib import contextmanager
from pathlib import Path


class UpdateStorage:
    def __init__(self, database_path: Path):
        self.path = database_path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS room_updates (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    room_id TEXT NOT NULL,
                    payload BLOB NOT NULL
                );
                CREATE INDEX IF NOT EXISTS room_updates_by_room
                    ON room_updates(room_id, sequence);
            """)

    @contextmanager
    def _connect(self):
        connection = sqlite3.connect(self.path, timeout=10)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def append(self, room_id: str, payload: bytes) -> None:
        with self._connect() as connection:
            connection.execute("INSERT INTO room_updates(room_id, payload) VALUES (?, ?)", (room_id, payload))

    def load(self, room_id: str) -> list[bytes]:
        with self._connect() as connection:
            return [row[0] for row in connection.execute(
                "SELECT payload FROM room_updates WHERE room_id = ? ORDER BY sequence", (room_id,)
            )]

    def count(self, room_id: str) -> int:
        with self._connect() as connection:
            return connection.execute("SELECT COUNT(*) FROM room_updates WHERE room_id = ?", (room_id,)).fetchone()[0]
