# 0002 — Executable ink graphs

Recognize circles, connecting lines, single-stroke arrows, two-stroke arrows, and nearby numerical edge weights in `inkWorker.ts`. Cache geometric classifications by stroke ID and version. The worker maintains its own incremental stroke map and generates deterministic BFS, DFS, and priority-queue Dijkstra traces. Requests carry revisions; the main thread discards outdated responses.

Canonical data remains ink. Changing a weight generates numerical ink with an explicit edge binding and replaces the previous number in one undoable, locally persisted edit. Scrubbing previews an override in the worker, then commits once on pointer release; cancellation restores the canonical value. Graphs, algorithm traces, endpoint selection, and playback state are derived or session-local.

Recognition supports a small handwritten digit vocabulary using an independent $P point-cloud matcher. Ambiguous input stays raw; unmatched edges default to weight 1 and can be corrected through the connection editor. Explicit token metadata is permitted for demo numbers and user-edited values, as described in the engineering specification. Demo circles and arrows have no topology metadata. Weights are non-negative, at most 1,000,000, and edits use up to three decimal places.

This milestone treats recognized nodes on one board as one graph, including disconnected components. Spatial workspace clustering remains a later milestone. Unreachable destinations are explicit results. The graph engine operates entirely in the browser worker; FastAPI retains its existing transport responsibilities.
