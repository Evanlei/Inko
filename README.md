# Inko

A computational whiteboard, starting with a smooth infinite canvas. The backend uses **Python + FastAPI**; the frontend uses **React + TypeScript + Vite**.

## Run locally

Prerequisites: Node.js 22.12 or newer and [uv](https://docs.astral.sh/uv/). The backend pins Python 3.14; uv can install it automatically.

```sh
npm install
uv sync --directory backend
```

Start these in separate terminals from the repository root:

```sh
npm run dev:backend
```

```sh
npm run dev
```

Open **http://127.0.0.1:5173**. FastAPI runs on **http://127.0.0.1:8000**, with interactive API documentation at `/docs`. The Vite development server proxies `/api` and `/ws` to FastAPI.

## Implemented

- Pressure-sensitive pen, five ink colors, and adjustable pen width.
- Infinite panning, zoom anchored to the cursor, and touchscreen pinch gestures.
- Whole-stroke erasing, grouped undo/redo, and an undoable clear action.
- Local autosave of strokes, workspace name, and camera using IndexedDB.
- A sample drawing and PNG export of the complete drawing, including offscreen ink.
- One Canvas2D board with cached `perfect-freehand` geometry, `Path2D` rendering, and `rbush` viewport culling. The renderer sleeps when idle.
- FastAPI binary room relay, SQLite update persistence, room statistics, and late-join replay.
- Worker-based recognition of circles, connecting lines, single-stroke arrows, two-stroke arrows, and a small handwritten digit vocabulary.
- Executable graph playback for BFS, DFS, and Dijkstra, with node distances, frontier highlights, and final routes drawn on the canvas.
- Undoable connection-weight editing and live vertical scrubbing, including zero and decimal weights.
- A seven-node, eleven-edge routing demo generated from real ink coordinates, plus a minimal interface with contextual, collapsible controls.

The canvas currently saves **one workspace in this browser on this device**. Keep the same origin when reopening it: `localhost` and `127.0.0.1` have separate browser storage. Local saving failures are shown in the interface; PNG export remains available. Undo history lasts for the current session.

The frontend is not connected to Yjs room synchronization yet. General mathematical handwriting recognition, reactive math, semantic zoom, and voice are later milestones in the [engineering specification](docs/engineering-spec.md).

## Explore a graph

Choose **Examples → Routing graph**, then press **Play** to follow an algorithm or **Result** to see its final route. The default Dijkstra result is `A → B → E → F → G`, cost `11`. Choose BFS for the fewest-hop route or DFS for depth-first exploration. Start and end nodes are selectable, and an unreachable destination is shown explicitly.

Loading an example replaces the canvas in one undoable edit. Undo returns to your previous drawing.

To create your own graph, draw circles and connect their boundaries with lines or arrows. A line is undirected; an arrow is directed. Write a small number near the middle of a connection, or use **Connection** in the graph panel to enter its weight. Recognition uses geometric heuristics and $P digit templates; ambiguous ink may need correcting in that editor. Unweighted connections default to `1`.

Use **Select (`V`)** to drag a weight vertically, click a node to set the start, or Shift-click a node to set the destination. Scrubbing updates the route through the worker and commits one undoable change on release. `Escape` cancels it. Weight edits support `0` to `1,000,000` with up to three decimal places and persist as ink across refreshes. Node labels, paths, and weights render inside the board canvas and are included in PNG exports.

## Controls

| Action | Control |
| --- | --- |
| Select / Pen / Eraser / Hand | `V` / `P` / `E` / `H` |
| Temporarily pan | Hold `Space` and drag, or middle-button drag |
| Trackpad pan | Two-finger scroll |
| Zoom at cursor | `Ctrl` or `⌘` + scroll |
| Touch pan / zoom | Two fingers / pinch |
| Zoom in / out | `+` / `-` |
| Fit drawing / 100% | `0` / `1` |
| Undo / Redo | `Ctrl` or `⌘` + `Z` / `Shift` + `Z` |
| Keyboard help | `?` |

## Verification

```sh
npm test
uv run --directory backend pytest -q
npm run build
npm exec --workspace frontend playwright install chromium
npm run test:e2e
```

Browser tests start the frontend and backend automatically when their ports are free. They cover drawing pixels, undo/redo, persistence after reload, pan/zoom, erasing, PNG export, mobile layout, touch gestures, browser-to-FastAPI transport, real pointer-to-graph recognition, traversal playback, weight edits and cancellation, stale worker results, and graph controls on phones.

## Backend contract

| Endpoint | Behavior |
| --- | --- |
| `GET /api/health` | Service readiness |
| `GET /api/rooms/{room_id}/stats` | Active peers, stored Yjs update count, and server uptime |
| `WS /ws/{room_id}` | Binary relay within a room; replays stored updates on connection |

Frame tags follow the specification: `0x01` stores and relays an opaque Yjs update; `0x02` relays a 16-byte cursor payload; `0x03` relays a JSON signaling object. Cursor and signaling frames are ephemeral. The sender is excluded from its own broadcast. Invalid frames are rejected; frames are limited to 2 MiB and signaling to 64 KiB.

SQLite defaults to `backend/data/inko.sqlite3`. Set `INKO_DATABASE_PATH` to override it and `INKO_ALLOWED_ORIGINS` to set a comma-separated origin allowlist. Run one Uvicorn worker: the current live room registry is in memory. This development transport has no authentication or update-log compaction yet.
