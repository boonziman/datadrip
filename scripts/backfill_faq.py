#!/usr/bin/env python3
"""One-time script to backfill FAQ structured data into existing post frontmatter.

Reads each post in content/posts/, extracts FAQ Q&A pairs from the markdown body,
and injects them as `faq:` YAML into the frontmatter so the Hugo template can
render FAQPage JSON-LD schema (rich results in Google).

Safe to run multiple times — skips posts that already have `faq:` in frontmatter.
"""

import os
import re
import glob

POSTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "content", "posts")

def extract_faq(content: str) -> list[dict]:
    """Extract FAQ Q&A pairs from markdown content."""
    faq_section = re.search(
        r'## (?:FAQ|Frequently Asked Questions)\s*\n(.*?)(?=\n## |\Z)',
        content, re.DOTALL
    )
    if not faq_section:
        return []

    faq_text = faq_section.group(1)
    # Match **Question** followed by answer text (stop at blank line too)
    faq_pairs = re.findall(
        r'\*\*(.+?)\*\*\s*\n?(.+?)(?=\n\*\*|\n## |\n\n|\Z)',
        faq_text, re.DOTALL
    )

    results = []
    for q, a in faq_pairs:
        q = q.strip().rstrip('?').strip() + '?'
        a = re.sub(r'\s+', ' ', a.strip())  # flatten to single line
        # Remove markdown links but keep text
        a = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', a)
        # Strip trailing CTA/boilerplate text that isn't part of the answer
        cta_patterns = [
            r'\s*(?:What do you think|Drop a comment|Subscribe to|Share this|Let.s keep|If this|Sources?:).*$',
        ]
        for pat in cta_patterns:
            a = re.sub(pat, '', a, flags=re.IGNORECASE|re.DOTALL)
        if len(q) > 10 and len(a) > 10:
            results.append({"q": q, "a": a})
    return results


def inject_faq(content: str, faq_pairs: list[dict]) -> str:
    """Inject faq: YAML block into frontmatter."""
    faq_yaml = 'faq:\n'
    for pair in faq_pairs:
        # Use single-quoted YAML strings to avoid double-quote issues with jsonify
        q = pair["q"].replace("'", "''")  # escape single quotes for YAML
        a = pair["a"].replace("'", "''")
        faq_yaml += f"  - q: '{q}'\n    a: '{a}'\n"

    parts = content.split('---', 2)
    if len(parts) == 3:
        return '---' + parts[1] + faq_yaml + '---' + parts[2]
    return content


def main():
    posts = sorted(glob.glob(os.path.join(POSTS_DIR, "*.md")))
    updated = 0
    skipped = 0
    no_faq = 0

    for path in posts:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Skip if already has faq: in frontmatter
        fm_end = content.find('---', content.find('---') + 3)
        frontmatter = content[:fm_end] if fm_end > 0 else ''
        if 'faq:' in frontmatter:
            # Remove existing faq: block so we can re-inject with fixed format
            import re as re2
            content = re2.sub(r'\nfaq:\n(?:  - [^\n]*\n(?:    [^\n]*\n)*)*', '\n', content, count=1)
            reinjected = True
        else:
            reinjected = False

        faq_pairs = extract_faq(content)
        if not faq_pairs:
            no_faq += 1
            print(f"  ⚠️  No FAQ pairs found: {os.path.basename(path)}")
            continue

        new_content = inject_faq(content, faq_pairs)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)

        updated += 1
        action = "re-injected" if reinjected else "added"
        print(f"  ✅ {len(faq_pairs)} FAQ pairs {action} → {os.path.basename(path)}")

    print(f"\n📋 Summary: {updated} updated, {skipped} already had FAQ, {no_faq} had no extractable FAQ")


if __name__ == "__main__":
    main()
