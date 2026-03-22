# Controller + Multi-Window Tiling Plan

## Goal
Preserve a side-by-side comparison workflow without iframe embedding by running each AI in a top-level browser window while the controller remains separate.

## Product Shape
- Popup remains a launcher.
- Controller page remains the main command surface.
- Each AI can run in its own browser window.
- Background logic is responsible for tiling and restoring window layout.

## Scope
- Build on the same controller/runtime contract used by tab mode.
- Treat window orchestration as a transport variant rather than a separate product.
- Keep content-script automation largely unchanged.

## Milestones
1. Reuse runtime model
- Extend target instances with `windowId`.
- Add `window` as a transport mode.

2. Window lifecycle orchestration
- Create one window per selected AI when requested.
- Reuse existing windows if they are still alive.
- Track tab-to-window ownership.

3. Window tiling
- Define a deterministic layout strategy for 1, 2, 3, and 4 windows.
- Add restore and retile actions.
- Keep controller outside the tiled comparison area unless explicitly included later.

4. Controller integration
- Let users switch selected targets into window mode.
- Show which targets are currently running as windows.
- Add actions for tile, retile, focus, and restore.

5. Status and recovery
- Reattach to windows after extension restart if possible.
- Surface missing/closed window state clearly in the controller.

## Risks
- Window placement and resize behavior can vary across displays and OS setups.
- Multi-monitor support can complicate deterministic tiling.
- Window mode adds more lifecycle edge cases than tab mode.

## Success Criteria
- User can send one prompt from the controller to multiple top-level AI windows.
- Window layout can be recreated predictably enough for side-by-side comparison.
- Grok remains usable because it is no longer embedded in an extension page.

## Suggested Order
1. Finish tab-mode controller/runtime contract first
2. Add window transport and registry support
3. Implement simple tiling for up to 3 or 4 targets
4. Add restore/retile UX in the controller
5. Refine lifecycle recovery
