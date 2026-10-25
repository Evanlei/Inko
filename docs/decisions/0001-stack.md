# 0001 — React/TypeScript frontend and Python/FastAPI backend

Status: accepted by the project owner.

Use React, TypeScript, and Vite for the browser application, with Canvas2D for board content and Web Workers for future recognition and computation. Use Python and FastAPI for HTTP endpoints, binary WebSocket room traffic, and WebRTC signaling. Use SQLite for persisted room updates and IndexedDB for local workspaces.

The server's initial workload is asynchronous message relay and storage. Python fits that workload; the drawing frame rate and computational feedback depend primarily on the browser implementation. Keep the custom frame contract explicit and test the browser-to-Python boundary rather than changing languages to share TypeScript definitions.

The first canvas milestone stores its document locally. Connecting canonical ink to Yjs room synchronization is a separate milestone; the existing FastAPI transport is implemented and tested independently.
