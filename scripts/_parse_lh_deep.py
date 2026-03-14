#!/usr/bin/env python3
"""Deep dive into LCP and FCP details from Lighthouse JSON."""
import json, sys

path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/lh-mobile.json"
d = json.load(open(path))
a = d["audits"]

# Server response time
srt = a.get("server-response-time", {})
print(f"Server response time: {srt.get('displayValue','?')} (score={srt.get('score','?')})")

# Network requests
nr = a.get("network-requests", {})
items = nr.get("details", {}).get("items", [])
print(f"\nFirst 10 network requests:")
for item in items[:10]:
    url = item.get("url", "?")
    if len(url) > 80:
        url = url[:77] + "..."
    print(f"  {item.get('startTime',0):.0f}-{item.get('endTime',0):.0f}ms {item.get('resourceType','?'):12} {item.get('transferSize',0)/1024:.1f}KB  {url}")

# Critical request chains
crc = a.get("critical-request-chains", {})
print(f"\nCritical request chains: {json.dumps(crc.get('displayValue', 'none'))}")

# Diagnostics
print("\nDiagnostics:")
for key in ["dom-size", "mainthread-work-breakdown", "bootup-time", "font-display", "uses-text-compression", "uses-responsive-images", "efficient-animated-content"]:
    audit = a.get(key, {})
    sc = audit.get("score")
    print(f"  {audit.get('title', key)}: {audit.get('displayValue','?')} (score={sc})")

# Check for LCP breakdown
lcp_breakdown = a.get("lcp-lazy-loaded", {})
print(f"\nLCP lazy loaded: score={lcp_breakdown.get('score', '?')}")

# Network RTT
nrtt = a.get("network-rtt", {})
items = nrtt.get("details", {}).get("items", [])
if items:
    print("\nNetwork RTT:")
    for item in items[:5]:
        print(f"  {item.get('origin','?')}: {item.get('rtt',0):.0f}ms")

# Total byte weight
tbw = a.get("total-byte-weight", {})
print(f"\nTotal byte weight: {tbw.get('displayValue', '?')} (score={tbw.get('score','?')})")
items = tbw.get("details", {}).get("items", [])
for item in items[:8]:
    url = item.get("url", "?")
    if len(url) > 70:
        url = url[:67] + "..."
    print(f"  {item.get('totalBytes',0)/1024:.1f}KB  {url}")
