# Deferred Work

- source_spec: none
  summary: Fix "connected" status showing green while Dashboard/device data silently fails to load due to a stale WifiNetworkSpecifier-bound route.
  evidence: Split from the AP+STA bridge intent during step-01 multi-goal check — this is an independently shippable bugfix in companion-app/src/screens/DevicesScreen.tsx and DashboardScreen.tsx/onboarding/wifi.ts, unrelated to adding STA uplink capability, and merging it does not depend on or block the AP+STA feature.

- source_spec: `_bmad-output/implementation-artifacts/spec-ap-sta-wifi-bridge.md`
  summary: CGI endpoints (ha.cgi/config.cgi and the new sta_*.cgi) have no CSRF protection and no auth by default when AAWG_WEBUI_PASSWORD is unset, letting any page loaded while connected to the dongle's AP silently trigger state-changing POSTs.
  evidence: Surfaced by step-04 Blind Hunter review of the AP+STA diff. Pre-existing pattern shared by ha.cgi/config.cgi, not introduced by this story — but this story adds two more state-changing endpoints (sta_set.cgi, sta_enable.cgi) reachable the same way, so the attack surface grows. Root fix (default-require-auth or CSRF token) is a cross-cutting webui concern, out of scope for this feature.

- source_spec: `_bmad-output/implementation-artifacts/spec-ap-sta-wifi-bridge.md`
  summary: Config backup (`aawgd.conf.bak`) is single-generation — a second write in the same session overwrites the backup with an already-edited intermediate state, weakening it as a rollback safety net.
  evidence: Surfaced by step-04 Blind Hunter review. Pre-existing pattern inherited from ha.cgi/config.cgi (this story's sta_set.cgi/sta_enable.cgi intentionally mirror it per the spec's "Always: mirror existing conventions" boundary), not something this story should deviate on unilaterally.
