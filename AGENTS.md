# Inko project guidance

- Make regular, focused commits at working feature checkpoints. The project owner explicitly requested commits throughout implementation.
- Keep Python/FastAPI for the backend and React/TypeScript/Vite for the frontend.
- Follow `docs/engineering-spec.md`. All board content belongs in one Canvas2D surface; React is for controls. Recognition and graph/math computation belong in the Web Worker.
- Preserve canonical ink and undo/redo behavior when adding computation. Treat graph ASTs and playback traces as derived state; discard stale worker responses.
- The owner prefers a very minimal, clean interface inspired by the supplied design references: thin typography, generous spacing, translucent neutral surfaces, and restrained warm/cool accents. Keep the workspace clear and controls contextual. Preserve legibility, keyboard access, and touch support.
- Run checks appropriate to each feature checkpoint and keep the README honest about implemented versus upcoming behavior.
