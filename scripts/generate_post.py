import os
import re
import feedparser
import requests
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

GROK_API_KEY = os.getenv("GROK_API_KEY")
if not GROK_API_KEY:
    print("❌ Please add your GROK_API_KEY to .env file")
    exit()

RSS_FEEDS = {
    "AI": [
        "https://www.wired.com/feed/tag/ai/latest/rss",
        "https://techcrunch.com/tag/artificial-intelligence/feed/",
        "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml",
        "https://openai.com/news/rss.xml",
        "https://huggingface.co/blog/feed"
    ],
    "Crypto": [
        "https://www.coindesk.com/arc/outboundfeeds/rss/",
        "https://cointelegraph.com/rss",
        "https://decrypt.co/feed",
        "https://cryptoslate.com/feed/",
        "https://bitcoinmagazine.com/feed"
    ],
    "Tech": [
        "https://techcrunch.com/feed/",
        "https://www.theverge.com/rss/index.xml",
        "https://www.wired.com/feed/rss",
        "https://arstechnica.com/feed/",
        "https://www.engadget.com/rss.xml"
    ]
}

def fetch_recent_news(category, limit=8):
    articles = []
    seen_links = set()
    for url in RSS_FEEDS[category]:
        feed = feedparser.parse(url)
        for entry in feed.entries[:5]:
            link = entry.link
            if link in seen_links: continue
            seen_links.add(link)
            articles.append({
                "title": entry.title,
                "link": link,
                "summary": entry.get("summary", "")[:500]
            })
            if len(articles) >= limit: break
        if len(articles) >= limit: break
    return articles

def count_words(text):
    body = re.split(r'---\s*', text, maxsplit=2)[-1] if '---' in text else text
    return len(re.findall(r'\b\w+\b', body))

def generate_image(image_prompt):
    url = "https://api.x.ai/v1/images/generations"
    headers = {
        "Authorization": f"Bearer {GROK_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "grok-imagine-image",
        "prompt": image_prompt,
        "n": 1,
        "aspectRatio": "16:9"
    }
    print("🎨 Generating custom image with Grok Imagine...")
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        if response.status_code == 200:
            return response.json()["data"][0]["url"]
        else:
            print(f"❌ Image generation error: {response.status_code} - {response.text}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"❌ Image generation network error: {e}")
        return None

def generate_post(category="AI", test_mode=False):
    news = fetch_recent_news(category)
    context = "\n\n".join([f"Title: {a['title']}\nLink: {a['link']}\nSummary: {a['summary']}" for a in news])

    system_prompt = f"""You are the lead editor and senior tech journalist at Datadrip — a respected, forward-thinking publication known for cutting through hype with sharp, original insights on AI, Crypto, and Tech that readers actually use to make better decisions.

Your writing style:
- Confident, authoritative, slightly conversational (blend of TechCrunch, Wired's best writers, and top Substack analysts)
- Use contractions, varied sentence length, rhetorical questions, and occasional "I" or "we" when it adds authority
- Always have a clear opinion and unique angle — never just summarize the news
- Every post must feel like it came from a human expert who has been following these topics for years

Requirements for every post (2026 context):
- The main body content (everything AFTER the frontmatter) must be EXACTLY 1,900–2,500 words of actual readable text. Count ONLY the article body.
- Extremely strong hook in the first 2-3 sentences — but NEVER start with "Picture this", "Imagine a world", "From my vantage point", or any cliché opener. Each post must begin differently: try a hard stat, a blunt opinion, a short punchy sentence, a question to the reader, a mini-anecdote, a news peg, or jump straight into the story. Match the opener to THIS article's unique tone.
- Clear SEO-friendly H1 title (under 60 chars)
- 4–7 subheadings (H2) — but vary the number and rhythm per post. Not every post needs the same count or pacing.
- Bullet lists, short paragraphs, bold key points for scannability
- Deep original analysis: risks, opportunities, future implications, your personal take, actionable steps
- ALWAYS include a FAQ section at the bottom of every post (before the CTA) with 3–5 relevant questions and concise answers. This is mandatory for SEO and reader engagement. Comparison tables are optional — only include one when it genuinely adds value.
- Cite 4–6 real sources with proper links
- Strong CTA at the end (newsletter, share, comment, "What do you think?")
- SEO: primary keyword in title/first paragraph, related terms throughout, multiple internal links to /categories/ai/ etc.
- Zero obvious AI patterns: no "delve", no "realm of", no repetitive phrases, no "pivotal shift", no "landscape"
- NEVER give direct financial advice, specific portfolio allocations, or investment recommendations (e.g. "put 35% in crypto"). If the post discusses investing, trading, portfolios, or token picks, include a brief disclaimer near the relevant section: "*This is for entertainment and educational purposes only and is not financial advice. Always do your own research and consult a professional advisor.*"
- ALWAYS create a FRESH, UNIQUE angle — never repeat topics or phrasing from previous posts
- VARY the structure and flow of each post. Do not follow the same section order every time. Some posts should lead with analysis then bring in news; some should be narrative-driven; some should open with a bold prediction; some can weave data tables into the middle. Each post should feel like its own unique story, not a template. The FAQ section must always appear near the bottom, just before the CTA.

Output ONLY valid Hugo Markdown with this exact frontmatter at the top (use today's real date in 2026 format):

---
title: "Your SEO Title Here"
date: YYYY-MM-DD
draft: false
categories:
  - {category}
tags:
  - keyword1
  - keyword2
description: "Natural, conversational meta description under 160 chars — do NOT force the year into it unless it fits naturally"
---

Then the full post content."""

    user_prompt = f"""Today's top stories in {category} (focus on the most timely and viral ones):
{context}

Write one original, high-value Datadrip article that ties 2–4 of these together with fresh analysis. Choose the most timely and impactful angle. Make it completely unique — no repetition of previous topics or phrasing."""

    if test_mode:
        print("=== TEST MODE ===")
        return None

    print(f"🤖 Pass 1: Generating draft for {category}...")
    url = "https://api.x.ai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {GROK_API_KEY}", "Content-Type": "application/json"}
    payload = {"model": "grok-4", "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}], "temperature": 0.7, "max_tokens": 9500}
    response = requests.post(url, headers=headers, json=payload)
    
    if response.status_code != 200:
        print(f"❌ API Error: {response.status_code} - {response.text}")
        return None
    
    content = response.json()["choices"][0]["message"]["content"]

    # === SELF-GRADING & IMPROVEMENT PASS ===
    print(f"🤖 Pass 2: Self-review & improving for {category}...")
    review_prompt = f"""You just wrote this Datadrip post. First, count the exact number of words in the body text only (after the frontmatter).

If the body is under 1,900 words, you MUST expand it significantly with more original analysis, deeper insights, actionable takeaways, real-world examples, and bold predictions. Add at least 500 new words of high-value content. Do NOT shorten anything.

Also check and fix these specific quality issues:
1. LEAD PARAGRAPH: If the first paragraph after the hook starts with "Picture this", "Imagine a world", "From my vantage point", or any generic opener — rewrite it with a fresh, unique start that fits this specific article's tone. Every post must open differently.
2. META DESCRIPTION: If the description in the frontmatter sounds templated or forces "in 2026" awkwardly, rewrite it to sound natural and conversational.
3. FAQ: Every post MUST have a FAQ section near the bottom (before the CTA) with 3–5 relevant, unique questions and concise answers. If one is missing, add it. Comparison tables are optional — remove them if forced.
4. STRUCTURE: If the post follows a rigid template (intro → same H2 rhythm → table → CTA), restructure it so it flows naturally. Vary the section order, pacing, and rhythm to make it feel like a unique editorial piece, not a formula. The FAQ should always sit near the bottom, just before the CTA.

Grade the post 1-10 on depth, originality, engagement, and value. Then rewrite the entire post to make it significantly better while keeping the exact same frontmatter format (use today's real 2026 date). Ensure it is completely unique — no repetition of previous topics or phrasing.

Output ONLY the improved full Hugo Markdown post (no image lines — those will be added separately).

Post:
{content}"""

    payload2 = {"model": "grok-4", "messages": [{"role": "user", "content": review_prompt}], "temperature": 0.7, "max_tokens": 10500}
    response2 = requests.post(url, headers=headers, json=payload2)
    
    if response2.status_code != 200:
        print(f"❌ API Error on Pass 2: {response2.status_code} - {response2.text}")
        return None
    
    final_content = response2.json()["choices"][0]["message"]["content"]

    actual_words = count_words(final_content)
    print(f"📊 Actual body word count for {category}: {actual_words}")

    # Force correct frontmatter and date
    today = datetime.now().strftime("%Y-%m-%d")
    final_content = re.sub(r'date:\s*\d{4}-\d{2}-\d{2}', f'date: {today}', final_content)
    final_content = re.sub(r'draft:\s*true', 'draft: false', final_content, flags=re.IGNORECASE)

    # === PASS 3: SMART IMAGE PROMPT + GROK IMAGINE ===
    print(f"🎨 Pass 3: Generating unique image prompt for {category}...")
    title_match = re.search(r'title:\s*"?(.*?)"?\s*\n', final_content, re.IGNORECASE)
    raw_title = title_match.group(1).strip('"').strip() if title_match else "Datadrip post"

    # Extract first ~400 chars of body for context
    body_start = final_content.split('---', 2)[-1][:400].strip()

    image_prompt_request = f"""Read this article title and opening and create ONE highly specific, visually descriptive image prompt for an AI image generator. The image must look completely unique to THIS article — not generic tech, not dark cyberpunk, not glowing AI figures.

Rules:
- Match the EXACT theme, setting, and mood of this article
- Use real-world scenes, real objects, real environments (e.g. a busy trading floor, a courtroom with lawyers and screens, a rural community using solar panels, a boardroom debate, a phone screen showing an app)
- Photo-realistic editorial style, like a high-quality news photo or magazine cover
- NO neon glows, NO purple/blue dark tech aesthetic, NO floating holograms, NO generic security shields
- Be SPECIFIC: name the objects, people, setting, action, lighting, and camera angle
- Output ONLY the image prompt text, nothing else

Article title: {raw_title}
Opening: {body_start}"""

    prompt_payload = {"model": "grok-4", "messages": [{"role": "user", "content": image_prompt_request}], "temperature": 0.9, "max_tokens": 300}
    prompt_response = requests.post(url, headers=headers, json=prompt_payload)

    if prompt_response.status_code == 200:
        image_prompt = prompt_response.json()["choices"][0]["message"]["content"].strip()
        print(f"   Prompt: {image_prompt[:120]}...")
    else:
        # Fallback: build a specific prompt from the title
        image_prompt = f"Editorial photo-realistic image for a news article titled '{raw_title}'. Professional lighting, clean composition, magazine quality."

    image_url = generate_image(image_prompt)

    # Insert image after the first paragraph (end of intro) or first H2
    if image_url:
        # Strip any placeholder/inline image lines Grok may have left in the body
        final_content = re.sub(r'!\[.*?\]\(image_url\)\n*', '', final_content)
        final_content = re.sub(r'!\[.*?\]\(https?://placeholder.*?\)\n*', '', final_content)
        final_content = re.sub(r'!\[.*?\]\(https?://.*?\)\n*', '', final_content)
        # Add featuredImage to frontmatter only — the layout handles display
        parts = final_content.split('---', 2)
        if len(parts) == 3:
            frontmatter = '---' + parts[1] + '---'
            body = parts[2]
            frontmatter = frontmatter.replace('\n---', f'\nfeaturedImage: "{image_url}"\n---')
            final_content = frontmatter + body
    slug = re.sub(r'[^a-z0-9\s-]', '', raw_title.lower().strip())
    slug = re.sub(r'[\s-]+', '-', slug).strip('-')[:50]

    time_str = datetime.now().strftime("%H%M")
    filename = f"{today}-{time_str}-{slug}.md"

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    posts_dir = os.path.join(project_root, "content", "posts")
    os.makedirs(posts_dir, exist_ok=True)

    full_path = os.path.join(posts_dir, filename)

    with open(full_path, "w", encoding="utf-8") as f:
        f.write(final_content)

    print(f"✅ Improved {category} post saved: {full_path}")
    print("Open it in VS Code and review!")

    return full_path

def generate_daily_posts():
    print("🚀 Starting daily generation — 3 unique posts (AI, Crypto, Tech)")
    results = {}
    for category in ["AI", "Crypto", "Tech"]:
        try:
            result = generate_post(category=category)
            results[category] = "✅" if result else "⚠️ skipped"
        except Exception as e:
            print(f"❌ {category} post failed: {e}")
            results[category] = "❌ failed"
    print(f"\n📋 Daily summary: {results}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        generate_post(test_mode=True)
    elif len(sys.argv) > 1 and sys.argv[1] == "--daily":
        generate_daily_posts()
    else:
        generate_post()  # default: single post (AI)



