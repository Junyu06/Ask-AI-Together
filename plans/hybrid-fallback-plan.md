# Hybrid Fallback Plan

## Goal
Keep iframe split view where it still works while moving problematic providers such as Grok to top-level tab or window execution.

## Product Shape
- Popup stays a launcher.
- Controller remains the central workspace.
- Targets can run in different transports at the same time:
  - `iframe` for sites that remain reliable inside the extension
  - `tab` for top-level-only sites
  - `window` for side-by-side top-level comparison when desired

## Why This Exists
- Full migration away from iframe may be unnecessary if only a subset of providers break.
- Grok is the immediate driver for a fallback transport model.
- Hybrid mode reduces rewrite pressure while preserving the best available UX per provider.

## Scope
- Do not force every site into the same transport.
- Make transport an explicit per-target runtime property.
- Keep the controller and background protocol transport-agnostic.

## Milestones
1. Formalize transport abstraction
- Define how controller actions target `iframe`, `tab`, and `window` consistently.
- Keep runtime state and history independent of transport.

2. Per-site transport policy
- Add a site capability layer or config that marks sites as iframe-capable, top-level-preferred, or top-level-required.
- Start by treating Grok as top-level-required until proven otherwise.

3. Mixed execution controller
- Show transport badges in the UI.
- Allow send/new-chat/focus actions to work regardless of transport.

4. Progressive fallback
- Attempt the preferred transport for a site.
- If it fails consistently, guide the user into the fallback transport instead of silently breaking.

## Risks
- Hybrid mode is more complex to reason about and test.
- UI can become confusing if transport state is not clearly visible.
- Background/controller contracts must stay disciplined to avoid branching everywhere.

## Success Criteria
- Grok is usable without forcing a full rewrite of sites that still behave in iframe split view.
- The controller presents a unified workflow even when transports differ per site.
- Future provider regressions can be handled by transport reassignment rather than emergency architectural changes.

## Suggested Order
1. First stabilize controller plus tab mode
2. Then add window mode if needed
3. Only after that wire iframe, tab, and window into a shared hybrid controller
