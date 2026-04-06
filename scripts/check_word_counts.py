#!/usr/bin/env python3
"""Check word counts across all posts."""
import os

post_dir = '/Users/seanashkenazi/Desktop/datadrip/content/posts'
word_counts = []

for f in sorted(os.listdir(post_dir)):
    if not f.endswith('.md'):
        continue
    content = open(os.path.join(post_dir, f)).read()
    parts = content.split('---', 2)
    if len(parts) >= 3:
        body = parts[2]
    else:
        body = content
    words = len(body.split())
    word_counts.append((f, words))

word_counts.sort(key=lambda x: x[1])

print(f'Total posts: {len(word_counts)}')
print(f'Average word count: {sum(w for _, w in word_counts) // len(word_counts)}')
print(f'Min: {word_counts[0][1]} ({word_counts[0][0][:50]})')
print(f'Max: {word_counts[-1][1]} ({word_counts[-1][0][:50]})')
print()
print('--- Shortest 5 posts ---')
for name, wc in word_counts[:5]:
    print(f'  {wc:5d} words: {name[:60]}')
print()
print('--- Longest 5 posts ---')
for name, wc in word_counts[-5:]:
    print(f'  {wc:5d} words: {name[:60]}')

thin = [n for n, w in word_counts if w < 300]
if thin:
    print(f'\nWARNING: {len(thin)} posts under 300 words (thin content risk)')
else:
    print('\nAll posts are 300+ words. No thin content risk.')
