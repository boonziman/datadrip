#!/usr/bin/env python3
"""Parse Lighthouse JSON output."""
import json, sys

path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/lh-mobile.json"
d = json.load(open(path))
a = d["audits"]
cats = d.get("categories", {})

print("=== SCORES ===")
for k in ["performance", "best-practices", "accessibility", "seo"]:
    if k in cats:
        print(f"  {cats[k]['title']}: {int(cats[k]['score']*100)}")

print("\n--- Core Web Vitals ---")
for m in ["first-contentful-paint", "largest-contentful-paint", "speed-index",
          "total-blocking-time", "cumulative-layout-shift"]:
    if m in a:
        print(f"  {a[m]['title']}: {a[m].get('displayValue','?')} (score={a[m].get('score','?')})")

print("\n--- Render-blocking ---")
rb = a.get("render-blocking-resources", {})
for item in rb.get("details", {}).get("items", []):
    print(f"  {item.get('url','?')[:90]} ({item.get('wastedMs',0)}ms)")

print("\n--- Unused CSS/JS ---")
for key in ["unused-css-rules", "unused-javascript"]:
    for item in a.get(key, {}).get("details", {}).get("items", [])[:5]:
        print(f"  [{key}] {item.get('url','?')[:80]} ({item.get('wastedBytes',0)/1024:.1f}KB)")

print("\n--- LCP Element ---")
lcp = a.get("largest-contentful-paint-element", {})
for item in lcp.get("details", {}).get("items", []):
    print(f"  {json.dumps(item)[:300]}")

print("\n--- Failing Audits ---")
for cat_key in ["performance", "best-practices", "accessibility", "seo"]:
    cat = cats.get(cat_key, {})
    for ref in cat.get("auditRefs", []):
        aid = ref.get("id", "")
        w = ref.get("weight", 0)
        audit = a.get(aid, {})
        sc = audit.get("score")
        if sc is not None and sc < 1 and w > 0:
            print(f"  [{cat_key}] {aid}: score={sc} weight={w} -- {audit.get('title','')}")
