import json
import struct

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import create_app
from app.ws_multiplexer import MAX_FRAME_BYTES, InvalidFrame, validate_frame


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "inko.sqlite3")) as connection:
        yield connection


def test_health_and_cors(client):
    response = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert response.json() == {"status": "ok", "service": "inko", "storage": "sqlite"}
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert client.get("/api/rooms/new-room/stats").json()["stored_yjs_updates"] == 0


def test_relay_persist_and_replay(client):
    # Empty Yjs update, wrapped in the application frame byte.
    frame = b"\x01\x00\x00"
    with client.websocket_connect("/ws/lab") as alice, client.websocket_connect("/ws/lab") as bob:
        alice.send_bytes(frame)
        assert bob.receive_bytes() == frame
        stats = client.get("/api/rooms/lab/stats").json()
        assert stats["active_peers"] == 2
        assert stats["stored_yjs_updates"] == 1
        with client.websocket_connect("/ws/lab") as late_joiner:
            assert late_joiner.receive_bytes() == frame
    assert client.get("/api/rooms/lab/stats").json()["active_peers"] == 0


def test_cursor_and_signaling_are_ephemeral(client):
    cursor = struct.pack("<BIffHBB", 2, 42, -123.5, 600.25, 1000, 1, 128)
    signal = b"\x03" + json.dumps({"type": "offer", "target": 42, "sdp": "example"}).encode()
    with client.websocket_connect("/ws/audio") as alice, client.websocket_connect("/ws/audio") as bob:
        for frame in [cursor, signal]:
            alice.send_bytes(frame)
            assert bob.receive_bytes() == frame
        assert client.get("/api/rooms/audio/stats").json()["stored_yjs_updates"] == 0


def test_rooms_are_isolated(client):
    with client.websocket_connect("/ws/a") as a1, client.websocket_connect("/ws/a") as a2, \
         client.websocket_connect("/ws/b") as b1, client.websocket_connect("/ws/b") as b2:
        a1.send_bytes(b"\x01room-a")
        b1.send_bytes(b"\x01room-b")
        assert a2.receive_bytes() == b"\x01room-a"
        assert b2.receive_bytes() == b"\x01room-b"


def test_history_survives_server_restart(tmp_path):
    path = tmp_path / "persistent.sqlite3"
    with TestClient(create_app(path)) as first:
        with first.websocket_connect("/ws/saved") as sender, first.websocket_connect("/ws/saved") as receiver:
            sender.send_bytes(b"\x01\x00\x00")
            assert receiver.receive_bytes() == b"\x01\x00\x00"
    with TestClient(create_app(path)) as second:
        with second.websocket_connect("/ws/saved") as returning:
            assert returning.receive_bytes() == b"\x01\x00\x00"


@pytest.mark.parametrize("frame,code", [
    (b"", 1008), (b"\x02bad", 1008), (b"\x03not-json", 1008),
    (b"\x03[]", 1008), (b"\x04unknown", 1003),
    (struct.pack("<BIffHBB", 2, 1, float("nan"), 0, 1000, 0, 128), 1008),
])
def test_malformed_frames_close_connection(client, frame, code):
    with client.websocket_connect("/ws/invalid") as socket:
        socket.send_bytes(frame)
        with pytest.raises(WebSocketDisconnect) as error:
            socket.receive_bytes()
        assert error.value.code == code


def test_rejects_text_frames(client):
    with client.websocket_connect("/ws/invalid") as socket:
        socket.send_text("canvas json")
        with pytest.raises(WebSocketDisconnect) as error:
            socket.receive_bytes()
        assert error.value.code == 1003


def test_oversized_frame():
    with pytest.raises(InvalidFrame) as error:
        validate_frame(b"\x01" + b"a" * MAX_FRAME_BYTES)
    assert error.value.code == 1009


def test_rejects_invalid_room_and_origin(client):
    assert client.get(f"/api/rooms/{'a' * 65}/stats").status_code == 422
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/lab", headers={"Origin": "https://unrelated.example"}):
            pass
