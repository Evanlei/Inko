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
- Semantic zoom with worker-based bounding-box DBSCAN, incrementally maintained spatial indexing and neighborhood caches, and canvas summaries for graphs and nearby freehand notes.
- Reactive math: spatially ordered variable definitions, computed results, 200-sample function plots, undoable literal scrubbing, an equation editor, and an oscillator demo. Equations, results, plots, and overview sparklines render on the same canvas.

The canvas currently saves **one workspace in this browser on this device**. Keep the same origin when reopening it: `localhost` and `127.0.0.1` have separate browser storage. Local saving failures are shown in the interface; PNG export remains available. Undo history lasts for the current session.

The frontend is not connected to Yjs room synchronization yet. General mathematical handwriting recognition and voice remain later milestones in the [engineering specification](docs/engineering-spec.md).

## Explore live math

Choose **Examples → Oscillator lab**. The workspace contains `k = 4.0`, `c = 0.35`, `w = sqrt(k)`, and `y(x) = exp(-c*x) * cos(k*x)`. Set `k` to `9` to see `w` become `3` and the oscillator curve change. Use **Select (`V`)** to drag a numeric assignment vertically, or select an equation in **Live math** and use **Variable value**. A drag previews changes through the worker; release commits one undoable ink replacement, and `Escape` cancels it. Literal editing supports signed values from `-1,000,000` to `1,000,000`, rounded to three decimal places.

Use the **ƒ / Add equation** button to add your own equation, or **Update equation** to change an existing one. Typed equations become actual stroke paths with explicit symbol tokens; they use the same worker compiler as the demo and recognized handwriting. Handwriting recognition is a small template vocabulary (digits, `k m c w a b x y`, and basic arithmetic symbols), not general OCR. For reliable entry of longer formulas and function names, use the equation editor. You can erase equation strokes normally; derived results and plots are recomputed from the remaining ink.

The parser supports `+ - * / ^`, parentheses, decimal/scientific notation, `pi`, `e`, and `sin`, `cos`, `tan`, `exp`, `sqrt`, `log`, `abs`, `min`, and `max`. Use explicit `*` for multiplication and lowercase names. Assignments resolve top-to-bottom, then left-to-right in 40-unit rows; define variables and functions before using them. Functions capture the definitions above them and sample 200 points on `[0, 10]`, with an automatic vertical range. Undefined samples leave gaps. Forward references, cycles, unsupported syntax, and invalid calculations show equation errors; drawing continues to work. Units, symbolic algebra, custom plot domains, and general handwriting recognition are not implemented.

Plots and computed results are included in **Fit drawing** and PNG exports. Zooming out shows a math summary and curve preview. When math and graphs share a board, **Network / Math** switches the contextual controls.

## Zoom out to explore

Between 38% and 18% zoom, nearby strokes cross-fade into workspace summaries. Graph summaries show node and connection counts, a small topology preview, and the current Dijkstra shortest-path cost between the selected endpoints. Separate groups of freehand strokes get their own summaries; isolated strokes remain visible. Summary content is derived in the worker and never replaces saved ink or undo history.

Click or tap a summary to explore that workspace at a readable zoom. Drag across a summary to pan. Use **Fit drawing (`0`)** for the full board or **100% (`1`)** for full ink detail; fitting a large board on a phone may still show an overview. Graph and math controls collapse at 18% zoom and can be expanded when needed. PNG export always includes the full drawing, computation results, plots, and graph annotations, regardless of the current overview zoom.

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

Browser tests start the frontend and backend automatically when their ports are free. They cover drawing pixels, undo/redo, persistence after reload, pan/zoom, erasing, PNG export, mobile layout, touch gestures, browser-to-FastAPI transport, real pointer-to-graph recognition, traversal playback, weight edits and cancellation, stale worker results, graph controls on phones, live semantic summaries and navigation, math dependencies and plots, real pointer-to-math recognition, scrub cancellation, and mixed math/graph workspaces.

## Backend contract

| Endpoint | Behavior |
| --- | --- |
| `GET /api/health` | Service readiness |
| `GET /api/rooms/{room_id}/stats` | Active peers, stored Yjs update count, and server uptime |
| `WS /ws/{room_id}` | Binary relay within a room; replays stored updates on connection |

Frame tags follow the specification: `0x01` stores and relays an opaque Yjs update; `0x02` relays a 16-byte cursor payload; `0x03` relays a JSON signaling object. Cursor and signaling frames are ephemeral. The sender is excluded from its own broadcast. Invalid frames are rejected; frames are limited to 2 MiB and signaling to 64 KiB.

SQLite defaults to `backend/data/inko.sqlite3`. Set `INKO_DATABASE_PATH` to override it and `INKO_ALLOWED_ORIGINS` to set a comma-separated origin allowlist. Run one Uvicorn worker: the current live room registry is in memory. This development transport has no authentication or update-log compaction yet.
