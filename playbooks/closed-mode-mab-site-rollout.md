# Roll out closed-mode MAB one site at a time and keep the blast radius to one port

## Problem
Closing access ports is like changing the locks in a building that never closes: every door has to keep working for the people already inside while you work. On networks full of cameras, intercoms, sensors and controllers that cannot do 802.1X, MAC Authentication Bypass (MAB) in closed mode means a port passes nothing until the policy server authorizes the device. One wrong group, one stale MAC or one quiet device and something useful goes dark.

## Where it fits
Cisco switches using interface templates for identity (IBNS 2.0 style configuration) with Cisco ISE as the policy server. The order of work applies to any NAC product. Check every command against the configuration guide for your platform and release: classic IOS and IOS-XE differ in show commands and device tracking.

## What works
1. **Agree the scope with the owner first.** Run a short test call on one port of each device type. Record which types passed, which are approved, which are excluded and which are on hold. Safety-related devices stay on hold until their owner approves in writing.
2. **Keep a safety net in policy.** While ports are being closed, the catch-all authorization rule is deliberately set to permit. That is not how the product ships. Tightening it is a later, separate change.
3. **Build the device list per site and verify it against three sources** before writing any commands: a fresh read-only capture from the switches, the endpoint export from the policy server, and the tracking sheet. Fix stale MACs first.
4. **Check the policy server read-only.** The site's switches exist as network devices, each endpoint is in the right group, the MAB rules exist.
5. **Work one switch at a time, in a fixed order:** network device entry on the policy server, a fresh admin login test while the old session stays open, a pre-check, the ports, the test, then save.
6. **Pre-check** that the switch can reach the policy servers and that the identity template is present on the switch.
7. **Give one paste block per switch** with real names and addresses inline. Per port: a description that says what the device is, then the closed template. A port with several MAC addresses behind it needs its host mode chosen on purpose and agreed with the owner: multi-host authenticates the first MAC and opens the port for the rest (one session for the port), multi-auth authenticates every MAC separately.
8. **Never bounce a PoE port to restart authentication.** Shutting the port cuts power to the device. Clear the session on the interface instead.
9. **The person saves the session log to a file; the assistant reads the file** and updates the tracking sheet and the site document before the next switch.

## Why it works
Many outages in a rollout like this start with a wrong assumption about what is plugged in. Verifying the list first, changing one switch at a time and proving each port before moving on keeps the blast radius at one port.

## Gotchas
- Quiet devices only start MAB when they send their next frame. Give them up to a few minutes before deciding something failed. No session and no MAC usually means the device has sent nothing yet. Check link and power before blaming policy.
- A show command right after clearing a session can return nothing for a few seconds. Run it again.
- Uplinks and routed links never get the template. Access ports only.
- Device types that are not approved are labelled and left alone, not skipped silently.
- A working TACACS+ admin login proves nothing about RADIUS. Test each service by itself.
- If the policy server profiles endpoints and reacts to profile changes, a change of profile can drop a device. Know that setting before you start.

## Verify
Per port: the session shows authorized by MAB with the expected tag or VLAN, the device answers a ping, and the policy server's live log shows the pass. Per switch: the save is confirmed. Per site: every port in scope is on the tracking sheet as verified from output, not from memory.

## Rollback
Per port: remove the template (and the host mode if you added one), then clear the session on that interface.
