# Inko — Computational Multiplayer Whiteboard with Semantic Zoom & Spatial Audio
## Master Engineering Specification for Autonomous Coding Agents (Codex / Claude Code)

---

## 1. Executive Summary & Product Vision

**Inko** is a high-performance, real-time multiplayer computational whiteboard where freehand ink is an **executable data type** and space governs both **visual Level-of-Detail (LoD)** and **voice proximity**.

Unlike static digital whiteboards (Excalidraw, Miro) that treat strokes as dead pixels and turn into unreadable clutter when zoomed out, Inko combines four core systems engineering pillars:
1. **60–120 FPS Custom Canvas Engine with R-Tree Spatial Indexing:** Zero-DOM vector stroke rendering using `perfect-freehand` polygon tessellation, `Path2D` geometry caching, and $O(\log N)$ viewport frustum culling via an in-memory 2D R-Tree (`rbush`).
2. **Asynchronous Web Worker "Active Ink" Compiler:** Fast geometric heuristics (`lineiness`, closed-hull ratio, arrow-tip vector analysis) and a **$P Point-Cloud Recognizer** running off the main thread in `<2ms` to compile freehand ink into:
   - **Live Math & Scrubbable Variables:** Handwritten assignments (e.g., `k = 2.5`, `m = 1.0`, `w = sqrt(k / m)`) and functions (`f(x) = sin(k * x) * exp(-0.2 * x)`) resolved top-left to bottom-right into a reactive Directed Acyclic Graph (DAG). Dragging vertically over any numeric literal scrubs its value at 60 FPS and updates downstream equations and inline 2D function plots in real time.
   - **Executable Hand-Drawn Graphs:** Hand-drawn circles (vertices), connecting arrows (directed/undirected edges), and numeric edge weights automatically compile into an in-memory adjacency list capable of running live, step-by-step animated **BFS, DFS, and Dijkstra Shortest Path** traversals directly over the user's ink.
3. **Incremental DBSCAN Spatial Clustering & Semantic LoD Zoom:** As the user zooms out (`zoom < 0.35`), an incremental bounding-box **DBSCAN** pass groups proximate strokes into semantic workspaces and smoothly cross-fades raw ink into clean **Semantic Summary Cards** displaying evaluated AST outputs (e.g., `ω = 1.58 rad/s` or `Directed Graph (6V, 9E) • Min Path: 14`).
4. **Dual-Representation CRDT Sync & WebRTC Spatial Audio:** Multiplayer state is synchronized via `Yjs` (`Y.Map` for raw ink splines + derived AST nodes) alongside a custom **16-byte binary cursor protocol** and **WebRTC proximity voice chat** routed through the Web Audio API `PannerNode` & `BiquadFilterNode`, panning and attenuating peer voices based on real-time Euclidean distance on the canvas.

---

## 2. Strict Architectural Constraints for Codex

When implementing this repository, adhere strictly to the following engineering rules:

- **NO DOM Nodes for Canvas Elements:** Never render strokes, graph nodes, or summary cards as React HTML/SVG DOM elements. Every board element MUST be drawn inside a single full-viewport `<canvas>` using HTML5 `CanvasRenderingContext2D` (with `Path2D` caching) so the engine sustains 60+ FPS with 50,000+ points. React is strictly reserved for the lightweight floating HUD toolbar, algorithm transport controls, and telemetry overlay.
- **Zero Per-Frame Polygon Re-Tessellation:** Running `getStroke()` from `perfect-freehand` inside `requestAnimationFrame` for every visible stroke will tank frame times. Pre-compute and cache `Path2D` objects keyed by `stroke.id + ":" + stroke.version` upon stroke creation/mutation.
- **Off-Main-Thread Compute:** All stroke recognition (`$P` recognizer, geometric heuristics), DBSCAN spatial clustering, AST evaluation, and graph traversal generation MUST execute inside a dedicated Web Worker (`src/worker/inkWorker.ts`).
- **Deterministic Hybrid CRDT State:** Never transmit full canvas JSON snapshots on pointer move. Active in-flight strokes stream over ephemeral binary frames; committed strokes, parsed AST nodes, and cluster metadata synchronize via `Yjs` shared types.
- **No Stubbed Algorithms:** Implement the complete math for Catmull-Rom / `perfect-freehand` rendering, `$P` point-cloud matching, bounding-box DBSCAN, top-left-to-bottom-right variable DAG evaluation, Dijkstra/BFS step generators, and 16-byte `DataView` binary serialization.
- **One-Click Recruiter Demo Presets:** Include a top-right HUD `"Load Demo Workspace"` menu that programmatically populates the canvas with real freehand stroke coordinates for:
  1. **Damped Harmonic Oscillator Lab** (hand-drawn equations `k = 4.0`, `c = 0.35`, `y(x) = exp(-c*x) * cos(k*x)` + reactive 2D plot), and
  2. **Weighted Network Routing Graph** (7 hand-drawn circular vertices, 11 directed arrow strokes, handwritten edge weights, ready to click `"Run Dijkstra"` or zoom out to test Semantic LoD collapse).

---

## 3. Repository Structure

```text
inko/
├── README.md
├── docker-compose.yml
├── backend/
│   ├── pyproject.toml
│   ├── requirements.txt
│   └── app/
│       ├── __init__.py
│       ├── main.py                 # FastAPI app, CORS, healthcheck, room stats API
│       ├── ws_multiplexer.py       # Binary WebSocket hub (0x01 Yjs, 0x02 16B Cursor, 0x03 WebRTC)
│       └── storage.py              # SQLite / in-memory room snapshot persistence for Yjs updates
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── types/
        │   ├── canvas.ts           # Core Stroke, BBox, Camera,AST, Cluster, & Binary packet types
        │   └── workerMessages.ts   # Strongly typed Main <-> Worker RPC message contracts
        ├── engine/
        │   ├── Camera.ts           # Pan, zoom-to-cursor, world<->screen matrix transforms
        │   ├── SpatialIndex.ts     # rbush R-Tree wrapper for strokes and semantic clusters
        │   ├── PathCache.ts        # Memoized perfect-freehand -> Path2D geometry cache
        │   ├── Renderer.ts         # 60-120 FPS Canvas2D renderer with Semantic LoD cross-fading
        │   └── InputController.ts  # Pointer events, variable scrubbing hit-test, laser trail
        ├── worker/
        │   ├── inkWorker.ts        # Web Worker entry point & debounced dirty-region pipeline
        │   ├── heuristics.ts       # Lineiness, circularity/hull ratio, arrow-tip detector
        │   ├── DollarPRecognizer.ts# $P Point-Cloud recognizer for symbols, digits, & operators
        │   ├── dbscan.ts           # Incremental BBox DBSCAN clustering for Semantic Zoom
        │   ├── MathEngine.ts       # Spatial variable DAG resolver + 2D function sampler
        │   └── GraphEngine.ts      # Circle/Arrow compiler + BFS, DFS, & Dijkstra animators
        ├── network/
        │   ├── BinaryProtocol.ts   # 16-byte ArrayBuffer cursor encoder/decoder + frame tags
        │   ├── SyncEngine.ts       # Yjs document binding + multiplexed WebSocket client
        │   └── SpatialAudio.ts     # WebRTC mesh + Web Audio API PannerNode proximity engine
        ├── presets/
        │   └── demoWorkspaces.ts   # Synthetic procedural freehand stroke generators for 1-click demos
        └── components/
            ├── ToolbarHUD.tsx      # Pen/Eraser/Scrubber/Laser mode selector + Demo Loader
            ├── TelemetryBar.tsx    # Live FPS, R-Tree visible count, Worker latency, LoD state
            └── GraphControlBar.tsx # Floating contextual controls for BFS/DFS/Dijkstra playback
```

---

## 4. Core Data Structures & Type Contracts (`frontend/src/types/canvas.ts`)

```typescript
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface StrokePoint {
  x: number;          // World X coordinate
  y: number;          // World Y coordinate
  pressure: number;   // 0.0 to 1.0 (default 0.5 for mouse/trackpad)
  t: number;          // High-res timestamp (performance.now())
}

export type SemanticRole =
  | 'raw'
  | 'math_symbol'
  | 'graph_vertex'
  | 'graph_edge'
  | 'graph_weight'
  | 'plot_axis';

export interface InkStroke {
  id: string;
  authorId: string;
  version: number;
  points: StrokePoint[];
  bbox: BBox;
  color: string;
  size: number;
  clusterId?: string;
  semanticRole: SemanticRole;
  recognizedToken?: string; // e.g., 'circle', 'arrow', '2', '5', '=', '+'
}

export interface VariableBinding {
  name: string;
  value: number;
  sourceStrokeIds: string[];
  valueBBox: BBox;          // Interactive scrub target hitbox in world coords
  precision: number;        // Decimal places to display when scrubbing
}

export interface MathASTNode {
  kind: 'math';
  id: string;
  clusterId: string;
  strokeIds: string[];
  bbox: BBox;
  rawExpression: string;    // e.g., "k = 4.0" or "y(x) = exp(-c*x) * cos(k*x)"
  isAssignment: boolean;
  variableName?: string;
  numericValue?: number;
  scrubTarget?: VariableBinding;
  plotData?: {
    domain: [number, number];
    range: [number, number];
    samples: Array<[number, number]>;
  };
  error?: string;
}

export interface GraphVertex {
  id: string;
  label: string;
  strokeId: string;
  center: { x: number; y: number };
  radius: number;
  bbox: BBox;
}

export interface GraphEdge {
  id: string;
  strokeId: string;
  sourceVertexId: string;
  targetVertexId: string;
  directed: boolean;
  weight: number;
  weightStrokeIds: string[];
  weightBBox?: BBox;        // Allows scrubbing edge weights live!
  controlPoints: Array<{ x: number; y: number }>;
}

export interface AlgorithmStep {
  stepIndex: number;
  visitedVertexIds: string[];
  frontierVertexIds: string[];
  activeEdgeId?: string;
  pathVertexIds: string[];
  pathEdgeIds: string[];
  distances: Record<string, number | 'INF'>;
  description: string;
}

export interface GraphASTNode {
  kind: 'graph';
  id: string;
  clusterId: string;
  strokeIds: string[];
  bbox: BBox;
  vertices: GraphVertex[];
  edges: GraphEdge[];
  startVertexId?: string;
  targetVertexId?: string;
  steps?: {
    bfs: AlgorithmStep[];
    dfs: AlgorithmStep[];
    dijkstra: AlgorithmStep[];
  };
}

export type SemanticASTNode = MathASTNode | GraphASTNode;

export interface SemanticCluster {
  id: string;
  bbox: BBox;
  strokeIds: string[];
  astNodeIds: string[];
  category: 'math_workspace' | 'graph_topology' | 'freeform_notes';
  title: string;            // e.g., "Damped Oscillator System" or "Weighted Routing Graph"
  primaryMetric: string;    // e.g., "ω = 1.58 rad/s" or "Min Cost: 14 (A → G)"
  secondaryBadge: string;   // e.g., "3 Equations • 1 Live Plot" or "7 Vertices • 11 Edges"
  accentColor: string;
  sparklinePoints?: Array<[number, number]>; // Normalized [0..1, 0..1] preview for LoD card
  updatedAt: number;
}
```

---

## 5. Pillar-by-Pillar Implementation Blueprint

### Pillar 1: 60–120 FPS R-Tree Render Loop & Semantic LoD Cross-Fading

#### 1.1 Camera & Coordinate Transforms (`src/engine/Camera.ts`)
Maintain `x`, `y` (world coordinates at top-left or viewport center), and `zoom` ($\in [0.05, 5.0]$).
- **Screen to World:**
  $$x_w = \frac{x_s - \text{pan}_x}{\text{zoom}}, \quad y_w = \frac{y_s - \text{pan}_y}{\text{zoom}}$$
- **Zoom-to-Cursor Invariant:** When zooming by factor $\Delta z$ around screen cursor $(x_s, y_s)$:
  1. Compute world point under cursor before zoom: $(x_w, y_w) = \text{screenToWorld}(x_s, y_s)$.
  2. Update $\text{zoom}' = \text{clamp}(\text{zoom} \cdot \Delta z, 0.05, 5.0)$.
  3. Recompute pan so $(x_w, y_w)$ remains locked under $(x_s, y_s)$:
     $$\text{pan}_x' = x_s - x_w \cdot \text{zoom}', \quad \text{pan}_y' = y_s - y_w \cdot \text{zoom}'$$

#### 1.2 Dual Spatial R-Tree (`src/engine/SpatialIndex.ts`)
Maintain two `RBush` instances:
1. `strokeTree`: Indexes every `InkStroke` by `{ minX, minY, maxX, maxY, id }`.
2. `clusterTree`: Indexes every `SemanticCluster` by `{ minX, minY, maxX, maxY, id }`.

On every animation frame:
1. Compute the current viewport world bounding box `viewBBox = camera.getViewportWorldBBox(canvas.width, canvas.height)`.
2. Query `strokeTree.search(viewBBox)` and `clusterTree.search(viewBBox)` in $O(\log N)$ time.

#### 1.3 Continuous Semantic LoD Cross-Fade (`src/engine/Renderer.ts`)
Define two zoom thresholds:
- `LOD_FULL_INK_ZOOM = 0.38` (Above 38% zoom, render 100% full detail strokes, live plots, and interactive scrub handles).
- `LOD_SUMMARY_CARD_ZOOM = 0.18` (Below 18% zoom, skip stroke polygon rendering entirely for clustered strokes and render only Semantic Summary Cards).
- For `0.18 < zoom < 0.38`, compute smooth Hermite interpolation (`smoothstep`):
  $$t = \text{clamp}\left(\frac{\text{zoom} - 0.18}{0.38 - 0.18}, 0, 1\right), \quad \alpha_{\text{ink}} = t^2(3 - 2t), \quad \alpha_{\text{card}} = 1 - \alpha_{\text{ink}}$$
- **Summary Card Rendering (`alpha_card > 0.01`):**
  - Draw a rounded glassmorphic card over `cluster.bbox` with border thickness scaled inversely by `camera.zoom` (`lineWidth = 2 / camera.zoom`) so card borders remain crisp and legible even at `zoom = 0.08`.
  - Render `cluster.title`, `cluster.primaryMetric` (in bold monospace font scaled to screen space), `cluster.secondaryBadge`, and the normalized `sparklinePoints` (or mini graph node-link preview) inside the card.

---

### Pillar 2: Web Worker "Active Ink" Compiler (`src/worker/`)

#### 2.1 Stage 1 — Sub-Millisecond Geometric Heuristics (`src/worker/heuristics.ts`)
Whenever a stroke completes, run these deterministic geometric classifiers:

1. **Path Length & Lineiness:**
   $$L_{\text{arc}} = \sum_{i=1}^{n-1} \|P_i - P_{i-1}\|_2, \quad D_{\text{end}} = \|P_{n-1} - P_0\|_2, \quad \text{lineiness} = \frac{D_{\text{end}}}{\max(L_{\text{arc}}, 10^{-5})}$$
   - If $\text{lineiness} \ge 0.86$ and $L_{\text{arc}} > 25\text{px}$, classify as a straight line segment (candidate `plot_axis`, `minus`, `fraction_bar`, or straight `graph_edge`).
2. **Closed-Loop Circularity (Graph Vertex Candidate):**
   - Compute start-to-end closure ratio: $C_{\text{gap}} = \frac{\|P_{n-1} - P_0\|_2}{L_{\text{arc}}}$.
   - Compute bounding box aspect ratio: $R_{\text{aspect}} = \frac{\min(W, H)}{\max(W, H)}$.
   - Compute radial variance around centroid $\mu = \frac{1}{n}\sum P_i$:
     $$\bar{r} = \frac{1}{n}\sum \|P_i - \mu\|_2, \quad \sigma_r = \sqrt{\frac{1}{n}\sum (\|P_i - \mu\|_2 - \bar{r})^2}$$
   - If $C_{\text{gap}} < 0.24$, $R_{\text{aspect}} > 0.55$, $\frac{\sigma_r}{\bar{r}} < 0.28$, and $\bar{r} \in [16\text{px}, 140\text{px}]$, classify as `graph_vertex` with center $\mu$ and radius $\bar{r}$.
3. **Single-Stroke & Multi-Stroke Arrow Detector (Graph Edge Candidate):**
   - **Case A (Single-stroke arrow):** A shaft followed by a sharp reversal/hook at the tail end ($80\% \dots 100\%$ of arc length) where the tangent angle changes by $>115^\circ$, OR
   - **Case B (Two-stroke arrow):** A primary curve/line stroke $S_{\text{shaft}}$ paired with a short V-shaped chevron stroke $S_{\text{head}}$ whose vertex lies within $22\text{px}$ of $S_{\text{shaft}}$'s endpoint.
   - If the start point of $S_{\text{shaft}}$ lies within $1.35 \times r_u$ of Vertex $u$ and the tip lies within $1.35 \times r_v$ of Vertex $v$, bind a `GraphEdge(u -> v)`.

#### 2.2 Stage 2 — `$P` Point-Cloud Recognizer (`src/worker/DollarPRecognizer.ts`)
Implement the classic Vatavu, Anthony, & Wobbrock (2012) **$P Point-Cloud Recognizer** for multi-stroke characters (`0-9`, `.`, `+`, `-`, `=`, `(`, `)`, `x`, `y`, `k`, `m`, `c`, `w`, `a`, `b`):
1. **Resample** a group of candidate character strokes into $N = 32$ equidistant points along their stroke trajectories.
2. **Scale** non-uniformly or proportionally to the reference unit square $[0, 1]^2$ (preserving aspect ratio for narrow strokes like `1`, `-`, `=`).
3. **Translate** centroid to $(0, 0)$.
4. **Greedy Cloud Distance:**
   $$d_{\text{cloud}}(A, B) = \sum_{i=0}^{N-1} w_i \cdot \min_{j \text{ unmatched}} \|A_i - B_j\|_2, \quad w_i = 1 - \frac{(i - 1)}{N}$$
5. Also allow explicit `recognizedToken` metadata on strokes (used by the Demo Presets and optional quick-math bar) so both freehand drawing and seeded formulas execute through the exact same AST pipeline.

#### 2.3 Stage 3 — Spatial Variable DAG & Live Scrubbing (`src/worker/MathEngine.ts`)
1. **Line Grouping:** Group math strokes whose vertical intervals $[y_{\min}, y_{\max}]$ overlap by $>40\%$ and horizontal gap is $<45\text{px}$.
2. **Causal Spatial Sorting:** Sort all recognized expression lines inside a cluster (or globally across the board) by `(Math.floor(bbox.minY / 40), bbox.minX)` — top-to-bottom, left-to-right.
3. **Evaluation & Scrub Binding:**
   - Parse assignments of the form `<ident> = <expr>`.
   - If `<expr>` is a numeric literal (e.g., `k = 4.0`), register a `VariableBinding` with a `valueBBox` covering the RHS numeric strokes.
   - When the user hovers over `valueBBox`, render a subtle vertical scrub pill (`↕ 4.00`).
   - When dragging vertically on a scrub target by $\Delta y_s$ screen pixels:
     $$v_{\text{new}} = v_{\text{start}} - \Delta y_s \cdot \text{sensitivity}$$
     Immediately mutate the variable value, re-evaluate all dependent AST nodes in topological order inside the worker (or synchronously via shared evaluator for `<1ms` latency), and re-sample any dependent function plots $f(x)$ across 200 points in $[x_{\min}, x_{\max}]$.

#### 2.4 Stage 4 — Executable Hand-Drawn Graph Engine (`src/worker/GraphEngine.ts`)
1. **Edge Weight Binding:** For every detected `GraphEdge`, query nearby numeric token clusters within $35\text{px}$ of the edge's midpoint. Parse the numeric value as `edge.weight` (default `1` if unweighted) and register `edge.weightBBox` as a scrubbable numeric target!
2. **Algorithm Step Generators:**
   Precompute step-by-step trace arrays (`AlgorithmStep[]`) whenever graph topology or weights change:
   - **BFS (`bfsSteps`):** Level-order queue expansion starting from the left-most vertex (or user-selected `startVertexId`).
   - **DFS (`dfsSteps`):** Depth-first stack traversal with parent edge highlighting.
   - **Dijkstra (`dijkstraSteps`):** Priority-queue relaxation recording `distances: Record<vertexId, number | 'INF'>`, active relaxation edge, settled vertex set, and final shortest-path tree (`pathEdgeIds`) to the right-most (or selected target) vertex.
3. **Canvas Overlay Rendering:** When an algorithm is active on a `GraphASTNode`, the renderer draws glowing animated pulses directly over the user's hand-drawn vertex circles and arrow strokes, displays live distance pills (`d = 7`) above each vertex, and highlights the shortest path in emerald green.

---

### Pillar 3: Incremental DBSCAN Spatial Clustering (`src/worker/dbscan.ts`)

Whenever strokes settle (debounced at `120ms` after pointer-up), group strokes into `SemanticCluster` workspaces using **Bounding-Box DBSCAN**:

1. **Distance Metric Between Two Bounding Boxes $A$ and $B$:**
   $$dx = \max(0, A_{\min X} - B_{\max X}, B_{\min X} - A_{\max X})$$
   $$dy = \max(0, A_{\min Y} - B_{\max Y}, B_{\min Y} - A_{\max Y})$$
   $$\text{dist}_{\text{bbox}}(A, B) = \sqrt{dx^2 + dy^2}$$
2. **DBSCAN Parameters:**
   - $\epsilon = 110\text{px}$ (in world coordinates).
   - $\text{minPts} = 2$ strokes.
   - Use the worker's `rbush` index to execute `regionQuery(bbox, eps)` by expanding `bbox` by $\epsilon$ in all 4 directions (`{ minX: bbox.minX - eps, minY: bbox.minY - eps, maxX: bbox.maxX + eps, maxY: bbox.maxY + eps }`), making the entire DBSCAN pass run in $O(N \log N)$ time instead of $O(N^2)$.
3. **Cluster Metadata Synthesis:**
   - Compute the union bounding box of all member strokes padded by `32px`.
   - Inspect the `SemanticASTNode`s inside the cluster:
     - If it contains a `GraphASTNode`: set `category = 'graph_topology'`, `title = "Graph Topology (" + V + "V, " + E + "E)"`, `primaryMetric = "Shortest Path: " + minCost`, and populate `sparklinePoints` with normalized vertex centers.
     - If it contains `MathASTNode`s: set `category = 'math_workspace'`, `title = "Computational Math Block"`, `primaryMetric` to the bottom-most evaluated formula result (e.g., `ω = 1.58 rad/s` or `f(x) • 200 pts`), and populate `sparklinePoints` with the function plot curve.

---

### Pillar 4: Binary Multiplexed Networking, CRDTs & Spatial Audio

#### 4.1 16-Byte Binary Cursor Telemetry (`src/network/BinaryProtocol.ts`)
To broadcast 60Hz cursor, zoom, and laser-pointer telemetry across peers with near-zero bandwidth overhead, pack cursor updates into a **17-byte binary WebSocket frame** (1 framing byte + 16 payload bytes):

| Byte Offset | Type | Field | Description |
| :--- | :--- | :--- | :--- |
| `0` | `Uint8` | `frameType` | `0x02` = Binary Cursor Telemetry (`0x01` = Yjs CRDT Delta, `0x03` = WebRTC JSON) |
| `1..4` | `Uint32` (LE) | `clientId` | Unique numeric peer ID (`yDoc.clientID`) |
| `5..8` | `Float32` (LE) | `worldX` | Cursor X in world coordinates |
| `9..12` | `Float32` (LE) | `worldY` | Cursor Y in world coordinates |
| `13..14` | `Uint16` (LE) | `zoomEncoded` | `Math.round(clamp(zoom, 0.01, 10.0) * 1000)` |
| `15` | `Uint8` | `flags` | Bitfield: `bit 0 = isDrawing`, `bit 1 = isLaserActive`, `bit 2 = isScrubbing`, `bits 4..7 = colorIndex` |
| `16` | `Uint8` | `pressureByte` | `Math.round(clamp(pressure, 0, 1) * 255)` |

#### 4.2 WebRTC Spatial Proximity Voice (`src/network/SpatialAudio.ts`)
For each connected remote peer:
1. Establish an `RTCPeerConnection` audio track (with a built-in synthetic ambient oscillator/voice-test generator toggle so a single developer or recruiter testing across 2 browser tabs can immediately hear the spatial panning and distance roll-off without feedback!).
2. Pipe the remote `MediaStream` (or test tone generator) through:
   $$\texttt{SourceNode} \longrightarrow \texttt{BiquadFilterNode (lowpass)} \longrightarrow \texttt{StereoPannerNode} \longrightarrow \texttt{GainNode} \longrightarrow \texttt{ctx.destination}$$
3. On every cursor telemetry tick or camera pan/zoom:
   - Let $(C_x, C_y)$ be the local viewport center in world coordinates, and $(P_x, P_y)$ be the remote peer's cursor in world coordinates.
   - Compute zoom-adjusted perceptual distance:
     $$d = \| (P_x - C_x, P_y - C_y) \|_2 \cdot \text{camera.zoom}$$
   - **Inverse-Distance Gain Attenuation:**
     $$d_{\text{ref}} = 250, \quad d_{\max} = 2800, \quad \rho = 1.25$$
     $$\text{gain} = \text{clamp}\left(\frac{d_{\text{ref}}}{d_{\text{ref}} + \rho \cdot (\max(d, d_{\text{ref}}) - d_{\text{ref}})}, 0.04, 1.0\right)$$
   - **Stereo Panning $\in [-1, 1]$:**
     $$\text{pan} = \text{clamp}\left(\frac{(P_x - C_x) \cdot \text{camera.zoom}}{\text{viewportWidth} \cdot 0.6}, -1.0, 1.0\right)$$
   - **Air-Absorption Low-Pass Filter Cutoff:**
     $$f_{\text{cutoff}} = \text{clamp}\left(18000 - d \cdot 5.5, 650, 18000\right)\text{ Hz}$$
   - Apply smooth exponential transitions via `AudioParam.setTargetAtTime(..., ctx.currentTime, 0.03)` to prevent zipper noise.

---

## 6. Phased Implementation Plan & Verification Checklist for Codex

Execute the build in the following 5 phases and verify each checkpoint before proceeding:

### Phase 1: Project Scaffolding & Backend Multiplexer
- [ ] Initialize `backend/` with FastAPI (`app/main.py`, `app/ws_multiplexer.py`, `app/storage.py`).
- [ ] Implement `/ws/{room_id}` endpoint that accepts binary frames (`0x01` Yjs state updates persisted in room history + broadcast to peers, `0x02` 17-byte cursor frames broadcast immediately with zero copy, `0x03` WebRTC signaling relay).
- [ ] Add `GET /api/rooms/{room_id}/stats` returning active peer count, stored Yjs update count, and uptime.
- [ ] Initialize `frontend/` with Vite + React + TypeScript + TailwindCSS + `perfect-freehand`, `rbush`, `yjs`, `lucide-react`.

### Phase 2: 60–120 FPS Canvas Engine, R-Tree Culling, & Path2D Cache
- [ ] Implement `Camera.ts`, `SpatialIndex.ts` (`rbush`), and `PathCache.ts` (`perfect-freehand` $\rightarrow$ `Path2D`).
- [ ] Implement `Renderer.ts` with infinite dot/grid background that adapts spacing across zoom octaves, active stroke rendering, remote peer cursor/laser rendering, and live HUD metrics.
- [ ] Verify smooth panning (`Space + Drag` or middle/two-finger pan) and zoom-to-cursor (`Ctrl/Meta + Wheel` or pinch) from `0.05x` to `5.0x`.

### Phase 3: Web Worker Active Ink Engine (Math Scrubbing + Executable Graphs)
- [ ] Implement `heuristics.ts`, `DollarPRecognizer.ts`, `MathEngine.ts`, and `GraphEngine.ts` inside `src/worker/`.
- [ ] Wire `InputController.ts` so hovering over a variable assignment RHS (`k = 4.0`) or graph edge weight shows a scrub handle (`↕`), and dragging vertically mutates the stroke value and re-evaluates the AST at 60 FPS.
- [ ] Implement inline 2D function plot rendering on the canvas for functions of `x` (`y(x) = ...`) and interactive BFS / DFS / Dijkstra step-by-step animated playback over hand-drawn graphs.

### Phase 4: DBSCAN Clustering, Semantic LoD Zoom, & Spatial Audio
- [ ] Implement `dbscan.ts` using `rbush` bounding-box range queries.
- [ ] Implement the smooth `0.18x – 0.38x` LoD cross-fade in `Renderer.ts` so zooming out collapses math derivations and graphs into high-contrast Semantic Summary Cards with sparklines and live metrics.
- [ ] Implement `BinaryProtocol.ts`, `SyncEngine.ts`, and `SpatialAudio.ts` (including a `"Simulate Peer Cursor & Spatial Audio Orbit"` toggle in the HUD so a single user can watch a simulated collaborator orbit the board while hearing live Web Audio stereo panning and low-pass distance attenuation).

### Phase 5: One-Click Demo Presets & Verification
- [ ] Implement `src/presets/demoWorkspaces.ts` generating realistic freehand stroke arrays for the **Damped Harmonic Oscillator Lab** and **Weighted Network Routing Graph** side-by-side on the infinite canvas.
- [ ] Auto-load the showcase workspace on initial startup if the room is empty so opening `http://localhost:5173` immediately presents an interactive, recruiter-ready computational canvas.
- [ ] Run `npm run build` and `pytest` to verify zero TypeScript compilation errors or runtime issues.
