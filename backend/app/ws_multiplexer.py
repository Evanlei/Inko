"""Room-scoped relay for 0x01 Yjs, 0x02 cursors, and 0x03 voice signaling."""

import asyncio
import json
import math
import struct
import time
from dataclasses import dataclass, field

from fastapi import WebSocket

from .storage import UpdateStorage

MAX_FRAME_BYTES = 2 * 1024 * 1024
SEND_TIMEOUT_SECONDS = 3


class InvalidFrame(ValueError):
    def __init__(self, message: str, code: int = 1008):
        super().__init__(message)
        self.code = code


def validate_frame(frame: bytes) -> int:
    if len(frame) > MAX_FRAME_BYTES:
        raise InvalidFrame("Frame is too large", 1009)
    if len(frame) < 2:
        raise InvalidFrame("Empty frame")
    tag = frame[0]
    if tag == 0x01:
        return tag  # Yjs payloads are opaque; clients apply and validate their CRDT updates.
    if tag == 0x02:
        if len(frame) != 17:
            raise InvalidFrame("Cursor frames must contain a 16-byte payload")
        _, x, y, zoom, _, _ = struct.unpack("<IffHBB", frame[1:])
        if not math.isfinite(x) or not math.isfinite(y) or not 10 <= zoom <= 10000:
            raise InvalidFrame("Invalid cursor coordinates or zoom")
        return tag
    if tag == 0x03:
        if len(frame) > 65536:
            raise InvalidFrame("Signaling frame is too large", 1009)
        try:
            message = json.loads(frame[1:])
        except (ValueError, UnicodeDecodeError) as error:
            raise InvalidFrame("Signaling must be valid JSON") from error
        if not isinstance(message, dict):
            raise InvalidFrame("Signaling must be a JSON object")
        return tag
    raise InvalidFrame("Unsupported frame type", 1003)


@dataclass(eq=False)
class Peer:
    socket: WebSocket
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def send(self, frame: bytes):
        async with self.send_lock:
            await asyncio.wait_for(self.socket.send_bytes(frame), SEND_TIMEOUT_SECONDS)


@dataclass
class Room:
    peers: set[Peer] = field(default_factory=set)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class RoomHub:
    def __init__(self, storage: UpdateStorage):
        self.storage = storage
        self.rooms: dict[str, Room] = {}
        self.started_at = time.monotonic()

    def room(self, room_id: str) -> Room:
        return self.rooms.setdefault(room_id, Room())

    async def join(self, room_id: str, socket: WebSocket) -> Peer:
        await socket.accept()
        peer = Peer(socket)
        room = self.room(room_id)
        # Replay and registration share the publishing lock: an update cannot be
        # lost in the gap between reading history and subscribing to live traffic.
        async with room.lock:
            updates = await asyncio.to_thread(self.storage.load, room_id)
            for payload in updates:
                await peer.send(b"\x01" + payload)
            room.peers.add(peer)
        return peer

    async def leave(self, room_id: str, peer: Peer):
        room = self.room(room_id)
        async with room.lock:
            room.peers.discard(peer)

    async def publish(self, room_id: str, sender: Peer, frame: bytes, tag: int):
        room = self.room(room_id)
        async with room.lock:
            if tag == 0x01:
                await asyncio.to_thread(self.storage.append, room_id, frame[1:])
            targets = [peer for peer in room.peers if peer is not sender]
            results = await asyncio.gather(*(peer.send(frame) for peer in targets), return_exceptions=True)
            failed = [peer for peer, result in zip(targets, results) if isinstance(result, BaseException)]
            for peer in failed:
                room.peers.discard(peer)
        for peer in failed:
            try:
                await asyncio.wait_for(peer.socket.close(code=1011), SEND_TIMEOUT_SECONDS)
            except (RuntimeError, TimeoutError):
                pass

    async def stats(self, room_id: str) -> dict:
        room = self.room(room_id)
        async with room.lock:
            return {"room_id": room_id, "active_peers": len(room.peers),
                    "stored_yjs_updates": await asyncio.to_thread(self.storage.count, room_id),
                    "uptime_seconds": round(time.monotonic() - self.started_at, 3)}
