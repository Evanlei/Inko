import asyncio
import logging
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .storage import UpdateStorage
from .ws_multiplexer import InvalidFrame, RoomHub, validate_frame

ROOM_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
logger = logging.getLogger(__name__)


class RoomStats(BaseModel):
    room_id: str
    active_peers: int
    stored_yjs_updates: int
    uptime_seconds: float


def create_app(database_path: Path | None = None) -> FastAPI:
    allowed_origins = os.getenv("INKO_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    origins = {origin.strip() for origin in allowed_origins if origin.strip()}
    path = database_path or Path(os.getenv("INKO_DATABASE_PATH", str(Path(__file__).resolve().parents[1] / "data" / "inko.sqlite3")))

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        storage = await asyncio.to_thread(UpdateStorage, path)
        application.state.hub = RoomHub(storage)
        yield

    application = FastAPI(title="Inko", version="0.1.0", lifespan=lifespan)
    application.add_middleware(CORSMiddleware, allow_origins=list(origins), allow_methods=["GET"], allow_headers=["*"])

    @application.get("/api/health")
    async def health():
        return {"status": "ok", "service": "inko", "storage": "sqlite"}

    @application.get("/api/rooms/{room_id}/stats", response_model=RoomStats)
    async def room_stats(room_id: str):
        if not ROOM_ID.fullmatch(room_id):
            raise HTTPException(status_code=422, detail="Room IDs must contain 1–64 letters, digits, underscores, or hyphens")
        return await application.state.hub.stats(room_id)

    @application.websocket("/ws/{room_id}")
    async def room_socket(socket: WebSocket, room_id: str):
        origin = socket.headers.get("origin")
        if not ROOM_ID.fullmatch(room_id) or (origin and origin not in origins):
            await socket.close(code=1008)
            return
        hub: RoomHub = application.state.hub
        peer = None
        try:
            peer = await hub.join(room_id, socket)
            while True:
                message = await socket.receive()
                if message["type"] == "websocket.disconnect":
                    break
                frame = message.get("bytes")
                if frame is None:
                    raise InvalidFrame("Binary frames are required", 1003)
                tag = validate_frame(frame)
                await hub.publish(room_id, peer, frame, tag)
        except InvalidFrame as error:
            await socket.close(code=error.code, reason=str(error))
        except (WebSocketDisconnect, TimeoutError):
            pass
        except Exception:
            logger.exception("Room connection failed")
            try:
                await socket.close(code=1011)
            except RuntimeError:
                pass
        finally:
            if peer is not None:
                await hub.leave(room_id, peer)

    return application


app = create_app()
