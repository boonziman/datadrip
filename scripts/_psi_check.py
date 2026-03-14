#!/usr/bin/env python3
"""Run Lighthouse via subprocess and parse results."""
import subprocess, json, sys

url = "https://datadripco.com"
strategy = sys.argv[1] if len(sys.argv) > 1 else "mobile"

cmd = [
    "npx", "lighthouse", url,
    f"--emulated-form-factor={strategy}",
    "--only-categories=performance,best-practices,accessibility,seo",
    "--output=json",
    "--chrome-flags=--headless --no-sandbox",
    "--quiet"
]

result = subprocess.run(cmd, capture_output=True, text=True)
if result.returncode != 0:
    print("Lighthouse failed:", result.stderr[:500])
    sys.exit(1)

d = json.loads(result.stdout)
a = d["audits"]

print(f"=== Lighthouse {strategy.upper()} Results ===")
cats = d.get("categories", {})
for k in ["performance", "best-practices", "accessibility", "seo"]:
    if k in cats:
        print(f"  {cats[k]['title']}: {int(cats[k]['score']*100)}")

print("\n--- Core Web Vitals ---")
for m in ["first-contentful-paint", "largest-contentful-paint", "speed-index",
          "total-blocking-time", "cumulative-layout-shift", "interactive"]:
    if m in a:
        print(f"  {a[m]['title']}: {a[m].get('displayValue','?')} (score={a[m].get('score','?')})")

print("\n--- Render-blocking resources ---")
rb = a.get("render-blocking-resources", {})
for item in rb.get("details", {}).get("items", []):
    print(f"  {item.get('url','?')[:90]} ({item.get('wastedMs',0)}ms)")

print("\n--- Unused CSS ---")
for item in a.get("unused-css-rules", {}).get("details", {}).get("items", [])[:5]:
    print(f"  {item.get('url','?')[:90]} ({item.get('wastedBytes',0)/1024:.1f}KB)")

print("\n--- Unused JS ---")
for item in a.get("unused-javascript", {}).get("details", {}).get("items", [])[:5]:
    print(f"  {item.get('url','?')[:90]} ({item.get('wastedBytes',0)/1024:.1f}KB)")

print("\n--- LCP Element ---")
lcp = a.get("largest-contentful-paint-element", {})
for item in lcp.get("details", {}).get("items", []):
    node = item.get("node", item.get("items", [{}]))
    print(f"  {json.dumps(node)[:300]}")

print("\n--- Diagnostics ---")
srt = a.get("server-response-time", {})
print(f"  Server response: {srt.get('displayValue','?')} (score={srt.get('score','?')})")
for key in ["dom-size", "mainthread-work-breakdown", "bootup-time"]:
    audit = a.get(key, {})
    print(f"  {audit.get('title',key)}: {audit.get('displayValue','?')} (score={audit.get('score','?')})")

print("\n--- Failing Audits (weighted) ---")
for cat_key in ["performance", "best-practices", "accessibility", "seo"]:
    cat = cats.get(cat_key, {})
    for ref in cat.get("auditRefs", []):
        aid = ref.get("id", "")
        w = ref.get("weight", 0)
        audit = a.get(aid, {})
        sc = audit.get("score")
        if sc is not None and sc < 1 and w > 0:
            print(f"  [{cat_key}] {aid}: score={sc} weight={w} — {audit.get('title','')}")
