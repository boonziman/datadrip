#!/usr/bin/env python3
"""Comprehensive verification of all built blog post HTML pages."""
import os, json, re

post_dir = '/Users/seanashkenazi/Desktop/datadrip/public/posts'
errors = []
ok = 0
no_faq = 0
no_blog = 0

for d in sorted(os.listdir(post_dir)):
    idx = os.path.join(post_dir, d, 'index.html')
    if not os.path.isfile(idx):
        continue
    html = open(idx).read()

    # Check robots meta
    if 'noindex' in html.lower() and 'content="noindex' in html.lower():
        errors.append(f'{d}: HAS NOINDEX!')

    # Check canonical
    canon = re.findall(r'<link rel=canonical href=([^>]+)>', html)
    if not canon:
        errors.append(f'{d}: NO CANONICAL TAG')
    elif '404' in canon[0]:
        errors.append(f'{d}: CANONICAL POINTS TO 404!')
    elif d not in canon[0]:
        errors.append(f'{d}: CANONICAL MISMATCH: {canon[0]}')

    # Check title tag exists
    title = re.findall(r'<title>(.*?)</title>', html)
    if not title:
        errors.append(f'{d}: NO TITLE TAG')
    elif len(title[0]) < 10:
        errors.append(f'{d}: TITLE TOO SHORT: {title[0]}')

    # Check meta description
    desc = re.findall(r'<meta name=description content="([^"]*)"', html)
    if not desc:
        errors.append(f'{d}: NO META DESCRIPTION')
    elif len(desc[0]) < 50:
        errors.append(f'{d}: META DESCRIPTION TOO SHORT ({len(desc[0])} chars)')

    # Check OG tags
    if 'og:title' not in html:
        errors.append(f'{d}: NO OG:TITLE')
    if 'og:description' not in html:
        errors.append(f'{d}: NO OG:DESCRIPTION')
    if 'og:image' not in html:
        errors.append(f'{d}: NO OG:IMAGE')

    # Check JSON-LD blocks
    ld_blocks = re.findall(r'<script type=application/ld\+json>(.*?)</script>', html, re.DOTALL)

    has_faq = False
    has_blog = False
    for block in ld_blocks:
        try:
            data = json.loads(block)
            if data.get('@type') == 'FAQPage':
                has_faq = True
                ents = data.get('mainEntity', [])
                if len(ents) < 2:
                    errors.append(f'{d}: FAQPage has only {len(ents)} questions')
                for i, q in enumerate(ents):
                    name = q.get('name', '')
                    text = q.get('acceptedAnswer', {}).get('text', '')
                    if not name or not text:
                        errors.append(f'{d}: FAQ Q{i+1} missing name or text')
                    if '\\u0026' in name or '\\u003c' in name:
                        errors.append(f'{d}: FAQ Q{i+1} has escaped chars in name')
            elif data.get('@type') == 'BlogPosting':
                has_blog = True
                if not data.get('headline'):
                    errors.append(f'{d}: BlogPosting missing headline')
                if not data.get('datePublished'):
                    errors.append(f'{d}: BlogPosting missing datePublished')
        except json.JSONDecodeError as e:
            errors.append(f'{d}: INVALID JSON-LD: {str(e)[:80]}')

    if not has_faq:
        no_faq += 1
        errors.append(f'{d}: NO FAQPage SCHEMA')
    if not has_blog:
        no_blog += 1
        errors.append(f'{d}: NO BlogPosting SCHEMA')

    # Check page size
    size = len(html)
    if size > 200000:
        errors.append(f'{d}: PAGE TOO LARGE ({size} bytes)')

    ok += 1

print(f'Posts checked: {ok}')
print(f'Posts missing FAQPage schema: {no_faq}')
print(f'Posts missing BlogPosting schema: {no_blog}')
print(f'Total errors: {len(errors)}')
if errors:
    print('\n--- ERRORS ---')
    for e in errors:
        print(f'  {e}')
else:
    print('\nALL POSTS PASS ALL CHECKS!')
