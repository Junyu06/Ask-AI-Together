# Controller + Multi-Tab Plan

## Goal
Add a persistent controller workspace that orchestrates real AI tabs while keeping the popup limited to launcher actions.

## Product Shape
- Popup acts as a lightweight entry point.
- Controller page is the main workspace for prompt input, targeting, history, and runtime state.
- Each AI runs in a real browser tab.

## Scope
- Reuse the current site registry and content-script automation where possible.
- Do not embed third-party pages inside the controller.
- Background/service worker owns tab discovery, creation, reuse, and routing.

## Milestones
1. Define runtime model
- Add a shared model for workspace, target instance, transport mode, and runtime state.
- Treat `tab` as the only transport in the first implementation.

2. Build popup launcher flow
- Keep popup minimal.
- Add actions to open the controller, restore the workspace, and focus/open specific AI targets.

3. Build controller workspace
- Add the main input surface.
- Add target selection and status chips.
- Add history and recent session URLs.
- Add explicit actions for send, new chat, open/focus target, and restore workspace.

4. Add background orchestration
- Track known AI tabs by site.
- Create a missing tab when the controller requests it.
- Reuse an existing live tab when possible.
- Route controller actions to the correct content script.

5. Adapt content-script protocol
- Keep current site-specific DOM automation.
- Add status messages for ready, sending, error, URL updates, and optional acknowledgement signals.

6. Preserve current capabilities where practical
- Prompt broadcast to selected sites
- New chat
- Session URL recall
- Quote-text return
- Basic per-site status updates

## Risks
- Attachment flows may be less reliable when the target tab is backgrounded.
- Some sites may resist automation when not focused.
- Status inference will remain heuristic.

## Success Criteria
- User can keep the controller open while AI targets run in separate tabs.
- Sending one prompt to multiple sites works without iframe embedding.
- Grok works in tab mode if its issue is limited to embedded contexts.

## Suggested Order
1. Shared runtime model
2. Background tab registry
3. Controller send flow
4. Popup launcher
5. History/session reintegration
6. Status refinement
