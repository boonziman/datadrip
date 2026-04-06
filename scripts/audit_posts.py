#!/usr/bin/env python3
"""Audit every post for frontmatter integrity, body quality, and SEO readiness."""
import os
import re

posts_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "content", "posts")

errors = []
warnings = []
total = 0

for fname in sorted(os.listdir(posts_dir)):
    if not fname.endswith(".md"):
        continue
    total += 1
    path = os.path.join(posts_dir, fname)
    with open(path, "r") as f:
        content = f.read()

    # Check basic frontmatter structure
    if not content.startswith("---"):
        errors.append(f"{fname}: Does not start with ---")
        continue

    parts = content.split("---", 2)
    if len(parts) < 3:
        errors.append(f"{fname}: Missing closing --- in frontmatter")
        continue

    fm = parts[1]
    body = parts[2]

    # Check required fields
    required = ["title:", "date:", "slug:", "description:", "categories:", "featuredImage:"]
    for field in required:
        if field not in fm:
            errors.append(f"{fname}: MISSING {field}")

    # Check draft status
    if re.search(r"draft:\s*true", fm, re.IGNORECASE):
        errors.append(f"{fname}: draft: true!")

    # Check if slug is empty
    slug_match = re.search(r'^slug:\s*["\']?([^"\']*)["\']?', fm, re.MULTILINE)
    if slug_match and not slug_match.group(1).strip():
        errors.append(f"{fname}: empty slug!")

    # Check if description is empty
    desc_match = re.search(r'^description:\s*"([^"]*)"', fm, re.MULTILINE)
    if desc_match:
        desc_len = len(desc_match.group(1).strip())
        if desc_len == 0:
            errors.append(f"{fname}: empty description!")
        elif desc_len < 50:
            warnings.append(f"{fname}: short description ({desc_len} chars)")
        elif desc_len > 320:
            warnings.append(f"{fname}: very long description ({desc_len} chars)")

    # Check faq: block integrity if present
    if "faq:" in fm:
        faq_q = re.findall(r"  - q: '", fm)
        faq_a = re.findall(r"    a: '", fm)
        if len(faq_q) != len(faq_a):
            errors.append(f"{fname}: faq q/a count mismatch ({len(faq_q)} q vs {len(faq_a)} a)")

    # Check if post body has a matching FAQ section (if faq: in frontmatter)
    if "faq:" in fm:
        has_faq_body = bool(re.search(r"## (?:FAQ|Frequently Asked Questions)", body))
        if not has_faq_body:
            errors.append(f"{fname}: has faq: frontmatter but NO FAQ section in body!")

    # Check body has actual content
    body_text = body.strip()
    if len(body_text) < 200:
        errors.append(f"{fname}: body too short ({len(body_text)} chars)")

    word_count = len(body_text.split())
    if word_count < 300:
        warnings.append(f"{fname}: low word count ({word_count} words)")

    # Check for H1 headings in body (should only use H2+)
    h1_count = len(re.findall(r"^# [^#]", body, re.MULTILINE))
    if h1_count > 0:
        warnings.append(f"{fname}: has {h1_count} H1 heading(s) in body (should use H2)")

    # Check featured image path format
    img_match = re.search(r'^featuredImage:\s*"([^"]*)"', fm, re.MULTILINE)
    if img_match:
        img_path = img_match.group(1)
        if not img_path.startswith("images/") and not img_path.startswith("/images/"):
            warnings.append(f"{fname}: featuredImage path unusual: {img_path[:50]}")

    # Check date format
    date_match = re.search(r"^date:\s*(\S+)", fm, re.MULTILINE)
    if date_match:
        date_val = date_match.group(1)
        if not re.match(r"\d{4}-\d{2}-\d{2}", date_val):
            errors.append(f"{fname}: bad date format: {date_val}")

    # Check for any robotsNoIndex
    if "robotsNoIndex" in fm:
        errors.append(f"{fname}: has robotsNoIndex in frontmatter!")

    # Check for noindex in body
    if "noindex" in body.lower():
        warnings.append(f"{fname}: 'noindex' text found in body")

print(f"\n=== FRONTMATTER AUDIT: {total} posts ===")
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
    print("\n✅ All posts passed frontmatter validation - zero errors")
