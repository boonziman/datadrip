#!/usr/bin/env python3
"""Audit every built HTML post for SEO correctness."""
import os
import re
import json

public_posts = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "posts")

errors = []
warnings = []
total = 0

# Get all slug-based post directories (exclude date-prefix redirects, page/, index files)
for slug in sorted(os.listdir(public_posts)):
    slug_path = os.path.join(public_posts, slug)
    if not os.path.isdir(slug_path):
        continue
    index_path = os.path.join(slug_path, "index.html")
    if not os.path.exists(index_path):
        continue

    with open(index_path, "r") as f:
        html = f.read()

    # Skip redirect pages (Hugo aliases)
    if len(html) < 1000 and "http-equiv=refresh" in html:
        continue

    # Skip list/pagination pages
    if "page/" in slug or slug.startswith("page"):
        continue

    total += 1

    # 1. Check robots meta
    robots = re.search(r'<meta name=robots content="([^"]+)"', html)
    if not robots:
        errors.append(f"{slug}: NO robots meta tag!")
    elif "noindex" in robots.group(1):
        errors.append(f"{slug}: robots says NOINDEX!")
    elif "index, follow" not in robots.group(1):
        warnings.append(f"{slug}: robots meta is '{robots.group(1)}' (expected 'index, follow')")

    # 2. Check canonical URL
    canonical = re.search(r'<link rel=canonical href=([^>]+)>', html)
    if not canonical:
        errors.append(f"{slug}: NO canonical URL!")
    else:
        canon_url = canonical.group(1)
        if slug not in canon_url:
            errors.append(f"{slug}: canonical URL doesn't match slug: {canon_url}")

    # 3. Check title tag
    title = re.search(r'<title>([^<]+)</title>', html)
    if not title:
        errors.append(f"{slug}: NO title tag!")
    elif len(title.group(1)) < 10:
        warnings.append(f"{slug}: very short title: '{title.group(1)}'")

    # 4. Check meta description
    desc = re.search(r'<meta name=description content="([^"]+)"', html)
    if not desc:
        errors.append(f"{slug}: NO meta description!")
    elif len(desc.group(1)) < 30:
        warnings.append(f"{slug}: very short meta description ({len(desc.group(1))} chars)")

    # 5. Check og:title
    og_title = re.search(r'<meta property="og:title" content="([^"]+)"', html)
    if not og_title:
        errors.append(f"{slug}: NO og:title!")

    # 6. Check og:description
    og_desc = re.search(r'<meta property="og:description" content="([^"]+)"', html)
    if not og_desc:
        errors.append(f"{slug}: NO og:description!")

    # 7. Check og:image
    og_image = re.search(r'<meta property="og:image" content="([^"]+)"', html)
    if not og_image:
        errors.append(f"{slug}: NO og:image!")

    # 8. Check og:url
    og_url = re.search(r'<meta property="og:url" content="([^"]+)"', html)
    if not og_url:
        errors.append(f"{slug}: NO og:url!")

    # 9. Check twitter:card
    tw_card = re.search(r'<meta name=twitter:card content="([^"]+)"', html)
    if not tw_card:
        errors.append(f"{slug}: NO twitter:card!")

    # 10. Check for BlogPosting schema
    if '"BlogPosting"' not in html:
        errors.append(f"{slug}: NO BlogPosting schema!")

    # 11. Check for BreadcrumbList schema
    if '"BreadcrumbList"' not in html:
        errors.append(f"{slug}: NO BreadcrumbList schema!")

    # 12. Validate BlogPosting JSON-LD is valid JSON
    for m in re.finditer(r'<script type=application/ld\+json>({.*?})</script>', html):
        try:
            data = json.loads(m.group(1))
            schema_type = data.get("@type", "unknown")
            if schema_type == "BlogPosting":
                # Check required fields
                for field in ["headline", "description", "datePublished", "author"]:
                    if field not in data:
                        errors.append(f"{slug}: BlogPosting missing '{field}'")
        except json.JSONDecodeError as e:
            errors.append(f"{slug}: INVALID JSON-LD: {e}")

    # 13. Check H1 tag exists
    h1 = re.search(r'<h1[^>]*>([^<]+)</h1>', html)
    if not h1:
        warnings.append(f"{slug}: no H1 tag found in HTML")

    # 14. Check page size
    page_size = len(html)
    if page_size > 500000:  # 500KB
        warnings.append(f"{slug}: very large page ({page_size // 1024}KB)")

print(f"\n=== BUILT HTML AUDIT: {total} post pages ===")
print(f"Errors: {len(errors)}")
print(f"Warnings: {len(warnings)}")
if errors:
    print("\n--- ERRORS ---")
    for e in errors:
        print(f"  ❌ {e}")
if warnings:
    print(f"\n--- WARNINGS ---")
    for w in warnings:
        print(f"  ⚠️  {w}")
if not errors:
    print("\n✅ All built HTML posts passed SEO validation - zero errors")
