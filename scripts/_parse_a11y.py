#!/usr/bin/env python3
"""Deep dive into accessibility failures from Lighthouse JSON."""
import json, sys

path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/lh-mobile.json"
d = json.load(open(path))
a = d["audits"]

# Color contrast details
cc = a.get("color-contrast", {})
print("=== COLOR CONTRAST ===")
print(f"Score: {cc.get('score')}")
items = cc.get("details", {}).get("items", [])
for item in items:
    node = item.get("node", {})
    print(f"  Element: {node.get('snippet', '?')[:120]}")
    print(f"  Selector: {node.get('selector', '?')}")
    print(f"  Explanation: {node.get('explanation', '?')}")
    print()

# Heading order details
ho = a.get("heading-order", {})
print("=== HEADING ORDER ===")
print(f"Score: {ho.get('score')}")
items = ho.get("details", {}).get("items", [])
for item in items:
    node = item.get("node", {})
    print(f"  Element: {node.get('snippet', '?')[:120]}")
    print(f"  Selector: {node.get('selector', '?')}")
    print()
