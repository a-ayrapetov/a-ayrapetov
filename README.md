# Arkadiy Ayrapetov

Cyber Security Architect. 13+ years in enterprise and OT network security: Cisco ISE, TrustSec, SD-Access, Catalyst Center, 802.1X, RADIUS and TACACS+, segmentation for industrial and life-science environments. CCNP Enterprise.

## What is here

Client-neutral tools that I use in real engagements, rewritten so anyone can run them:

- Read-only by default. Show commands and GET calls unless the README says otherwise.
- Credentials prompted at runtime, never stored.
- Sample data uses RFC 5737 documentation addresses only.
- Every repo ships with tests and a CI gate that rejects secrets and private addresses.

## Focus areas

- Identity and access: ISE policy export, NAC readiness, new-endpoint watch, TrustSec health.
- Fabric and campus: Catalyst Center inventory, port triage, drift detection.
- Operations: port health, evidence collection, Netmiko show-command runners.

## Tools

- [a-ayrapetov](https://github.com/a-ayrapetov/a-ayrapetov): Profile
- [cisco-config-drift](https://github.com/a-ayrapetov/cisco-config-drift): Read-only configuration drift detection for Cisco IOS and IOS-XE (Netmiko)
- [cisco-interface-health](https://github.com/a-ayrapetov/cisco-interface-health): Offline triage of Cisco show interfaces output: CRC, duplex mismatch, err-disabled, drops, flapping
- [ios-hardening-audit](https://github.com/a-ayrapetov/ios-hardening-audit): Offline security hardening audit of Cisco IOS / IOS-XE running-configs
- [ise-endpoint-explain](https://github.com/a-ayrapetov/ise-endpoint-explain): Explain why an endpoint got its Cisco ISE result: session, auth history, authz, SGT, failure causes
- [ise-health-audit](https://github.com/a-ayrapetov/ise-health-audit): Read-only Cisco ISE health and certificate-expiry audit via the ISE OpenAPI
- [vesta-ai-copy](https://github.com/a-ayrapetov/vesta-ai-copy): The copy of vesta ai for beta test
- [win-security-posture-audit](https://github.com/a-ayrapetov/win-security-posture-audit): Read-only PowerShell audit of a Windows machine's security and health posture

More are added as each tool passes review.
