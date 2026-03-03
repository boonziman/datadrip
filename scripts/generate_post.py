import os
import re
import sys
import feedparser
import requests
from datetime import datetime
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tracker import Tracker

load_dotenv()

GROK_API_KEY = os.getenv("GROK_API_KEY")
if not GROK_API_KEY:
    print("❌ Please add your GROK_API_KEY to .env file")
    exit()

# Module-level tracker (created in __main__ or generate_daily_posts)
tracker = None

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

def generate_image(image_prompt, slug="post"):
    """Generate an image via Grok Imagine, download it locally, return the local path."""
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
            temp_url = response.json()["data"][0]["url"]
            # Download the image to static/images/posts/ so it's permanent
            return download_image(temp_url, slug)
        else:
            print(f"❌ Image generation error: {response.status_code} - {response.text}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"❌ Image generation network error: {e}")
        return None


def download_image(image_url, slug="post"):
    """Download an image from a URL and save it to static/images/posts/. Returns the Hugo-relative path."""
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    images_dir = os.path.join(project_root, "static", "images", "posts")
    os.makedirs(images_dir, exist_ok=True)

    today = datetime.now().strftime("%Y-%m-%d")
    time_str = datetime.now().strftime("%H%M")
    filename = f"{today}-{time_str}-{slug[:40]}.jpg"
    filepath = os.path.join(images_dir, filename)

    try:
        print(f"📥 Downloading image to static/images/posts/{filename}...")
        img_response = requests.get(image_url, timeout=30)
        if img_response.status_code == 200:
            with open(filepath, "wb") as f:
                f.write(img_response.content)
            print(f"✅ Image saved: {filepath}")
            # Return path without leading / so Hugo's absURL/relURL handles the base path
            return f"images/posts/{filename}"
        else:
            print(f"❌ Image download failed: {img_response.status_code}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"❌ Image download error: {e}")
        return None

# === TOPIC MEMORY SYSTEM ===
# Scans your existing published posts — the posts themselves ARE the memory.
# Works identically whether you run locally or on GitHub Actions.
def load_past_topics(category, limit=20):
    """Read titles and descriptions from already-published posts for a category."""
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    posts_dir = os.path.join(project_root, "content", "posts")
    if not os.path.exists(posts_dir):
        return []
    entries = []
    for filename in sorted(os.listdir(posts_dir), reverse=True):
        if not filename.endswith(".md"):
            continue
        filepath = os.path.join(posts_dir, filename)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read(2000)  # Only need the frontmatter
        except IOError:
            continue
        # Check if this post belongs to the requested category
        cat_match = re.search(r'categories:\s*\n\s*-\s*(.*)', content, re.IGNORECASE)
        if cat_match and cat_match.group(1).strip().lower() != category.lower():
            continue
        title_match = re.search(r'title:\s*"?(.*?)"?\s*\n', content, re.IGNORECASE)
        desc_match = re.search(r'description:\s*"?(.*?)"?\s*\n', content, re.IGNORECASE)
        date_match = re.search(r'date:\s*(\d{4}-\d{2}-\d{2})', content)
        if title_match:
            entries.append({
                "title": title_match.group(1).strip('"').strip(),
                "angle": desc_match.group(1).strip('"').strip() if desc_match else "",
                "date": date_match.group(1) if date_match else ""
            })
        if len(entries) >= limit:
            break
    return entries

def call_api(url, headers, payload, timeout=300, retries=2):
    """Wrapper for API calls using streaming to prevent connection drops on long generations."""
    import time
    import json as _json
    payload_with_stream = {**payload, "stream": True}
    for attempt in range(1, retries + 1):
        try:
            response = requests.post(url, headers=headers, json=payload_with_stream, timeout=timeout, stream=True)
            if response.status_code != 200:
                # Return a fake response-like object so callers can check status_code
                return response
            # Collect streamed chunks into the full response
            full_content = []
            for line in response.iter_lines():
                if not line:
                    continue
                line_str = line.decode("utf-8")
                if line_str.startswith("data: "):
                    data = line_str[6:]
                    if data.strip() == "[DONE]":
                        break
                    try:
                        chunk = _json.loads(data)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        if "content" in delta:
                            full_content.append(delta["content"])
                    except _json.JSONDecodeError:
                        continue
            # Build a response-like object that the rest of the code can use
            class StreamedResponse:
                def __init__(self, status, content_text):
                    self.status_code = status
                    self._content = content_text
                def json(self):
                    return {"choices": [{"message": {"content": self._content}}]}
            return StreamedResponse(200, "".join(full_content))
        except requests.exceptions.RequestException as e:
            if attempt < retries:
                print(f"⚠️  Connection error (attempt {attempt}/{retries}): {e} — retrying in 10s...")
                time.sleep(10)
            else:
                raise

def generate_post(category="AI", test_mode=False):
    news = fetch_recent_news(category)
    if tracker:
        tracker.log_event(f"Fetched {len(news)} RSS articles for {category}")
    context = "\n\n".join([f"Title: {a['title']}\nLink: {a['link']}\nSummary: {a['summary']}" for a in news])

    system_prompt = f"""You are the lead editor and senior tech journalist at Datadrip — a respected, forward-thinking publication known for cutting through hype with sharp, original insights on AI, Crypto, and Tech that readers actually use to make better decisions.

Your writing style:
- Confident, authoritative, slightly conversational (blend of TechCrunch, Wired's best writers, and top Substack analysts)
- Use contractions, varied sentence length, rhetorical questions, and occasional "I" or "we" when it adds authority
- Always have a clear opinion and unique angle — never just summarize the news
- Every post must feel like it came from a human expert who has been following these topics for years

Requirements for every post (2026 context):
- CRITICAL: The main body content (everything AFTER the frontmatter closing ---) must be AT LEAST 2,000 words and ideally 2,200-2,500 words. This is a HARD minimum. Write long, detailed, in-depth content. Do NOT be brief. Expand every section with analysis, examples, data, and predictions. If in doubt, write MORE.
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

    # Load past topics from existing posts to avoid rehashing the same stories
    past_topics = load_past_topics(category)
    if past_topics:
        avoid_list = "\n".join([f"- \"{t['title']}\" ({t['date']}) — angle: {t['angle']}" for t in past_topics])
        avoid_section = f"""\n\n⚠️ STORIES WE ALREADY PUBLISHED — do NOT rehash these:\n{avoid_list}\n\nIMPORTANT: Do NOT rewrite or re-angle any of the above stories. However, if there is genuinely NEW breaking news or a FRESH development about the same company, person, or technology — that IS allowed and encouraged. Cover the NEW information, not what we already said. The goal is fresh, timely content — not avoiding entire topics forever."""
    else:
        avoid_section = ""

    user_prompt = f"""Today's top stories in {category} (focus on the most timely and viral ones):
{context}{avoid_section}

Write one original, high-value Datadrip article that ties 2–4 of these together with fresh analysis. Choose the most timely and impactful angle. Make it completely unique — no rehashing of previously published stories."""

    if test_mode:
        print("=== TEST MODE ===")
        return None

    print(f"🤖 Pass 1: Generating draft for {category}...")
    url = "https://api.x.ai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {GROK_API_KEY}", "Content-Type": "application/json"}
    payload = {"model": "grok-4", "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}], "temperature": 0.7, "max_tokens": 12000}
    response = call_api(url, headers, payload)
    
    if response.status_code != 200:
        print(f"❌ API Error: {response.status_code} - {response.text}")
        if tracker:
            tracker.log_error(f"{category} Pass 1 failed (HTTP {response.status_code})")
        return None
    
    content = response.json()["choices"][0]["message"]["content"]

    if tracker:
        tracker.log_api_call(
            f"{category} Draft (Pass 1)", model="grok-4",
            input_tokens=tracker.estimate_tokens(system_prompt + user_prompt),
            output_tokens=tracker.estimate_tokens(content),
        )

    # === SELF-GRADING & IMPROVEMENT PASS ===
    print(f"🤖 Pass 2: Self-review & improving for {category}...")
    review_prompt = f"""You are reviewing and improving this Datadrip post. Your job is to make it SIGNIFICANTLY longer and better.

STEP 1 — WORD COUNT CHECK:
Count the body words (after the frontmatter). If the body is under 2,000 words, you MUST expand it to at least 2,200 words. Add substantial new paragraphs: deeper analysis, more real-world examples, additional expert insights, bold predictions, actionable takeaways, relevant data points, and richer context. Do NOT pad with filler — every addition must be high-value content a reader would appreciate.

STEP 2 — QUALITY FIXES:
1. LEAD PARAGRAPH: If it starts with "Picture this", "Imagine a world", "From my vantage point", or any generic opener — rewrite with a fresh start.
2. META DESCRIPTION: Must sound natural and conversational, not templated.
3. FAQ: Must have 3–5 questions near the bottom before the CTA. Add if missing.
4. STRUCTURE: Vary section order and pacing. No rigid templates.

STEP 3 — OUTPUT RULES:
- Output ONLY the improved full Hugo Markdown post
- Do NOT include any word counts, grades, scores, ratings, editorial notes, or meta-commentary in your output
- Do NOT include lines like "(Word count: ...)" or "Grade: ..." or "Sources cited: ..."
- Do NOT include any image markdown lines — images are added separately
- The output must be ONLY the final publishable article, starting with --- and ending with the CTA

Post to improve:
{content}"""

    payload2 = {"model": "grok-4", "messages": [{"role": "user", "content": review_prompt}], "temperature": 0.7, "max_tokens": 14000}
    response2 = call_api(url, headers, payload2)
    
    if response2.status_code != 200:
        print(f"❌ API Error on Pass 2: {response2.status_code} - {response2.text}")
        if tracker:
            tracker.log_error(f"{category} Pass 2 failed (HTTP {response2.status_code})")
        return None
    
    final_content = response2.json()["choices"][0]["message"]["content"]

    if tracker:
        tracker.log_api_call(
            f"{category} Review (Pass 2)", model="grok-4",
            input_tokens=tracker.estimate_tokens(review_prompt),
            output_tokens=tracker.estimate_tokens(final_content),
        )

    # Strip any leaked metadata the AI might have left in the output
    final_content = re.sub(r'\n*\(Word count:.*?\)\s*$', '', final_content, flags=re.IGNORECASE | re.DOTALL)
    final_content = re.sub(r'\n*\*?\(Sources? cited:.*?\)\s*$', '', final_content, flags=re.IGNORECASE | re.DOTALL)
    final_content = re.sub(r'\n*Grade:.*$', '', final_content, flags=re.IGNORECASE | re.MULTILINE)
    final_content = re.sub(r'\n*Rating:.*$', '', final_content, flags=re.IGNORECASE | re.MULTILINE)
    final_content = final_content.rstrip()

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
    prompt_response = call_api(url, headers, prompt_payload, timeout=60)

    if prompt_response.status_code == 200:
        image_prompt = prompt_response.json()["choices"][0]["message"]["content"].strip()
        print(f"   Prompt: {image_prompt[:120]}...")
        if tracker:
            tracker.log_api_call(
                f"{category} Image Prompt (Pass 3)", model="grok-4",
                input_tokens=tracker.estimate_tokens(image_prompt_request),
                output_tokens=tracker.estimate_tokens(image_prompt),
            )
    else:
        # Fallback: build a specific prompt from the title
        image_prompt = f"Editorial photo-realistic image for a news article titled '{raw_title}'. Professional lighting, clean composition, magazine quality."
        if tracker:
            tracker.log_error(f"{category} Pass 3 failed (HTTP {prompt_response.status_code}), using fallback prompt")

    # Build slug early so we can use it for the image filename
    slug = re.sub(r'[^a-z0-9\s-]', '', raw_title.lower().strip())
    slug = re.sub(r'[\s-]+', '-', slug).strip('-')[:50]

    image_url = generate_image(image_prompt, slug=slug)
    if tracker:
        tracker.log_image(success=bool(image_url))

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

    time_str = datetime.now().strftime("%H%M")
    filename = f"{today}-{time_str}-{slug}.md"

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    posts_dir = os.path.join(project_root, "content", "posts")
    os.makedirs(posts_dir, exist_ok=True)

    full_path = os.path.join(posts_dir, filename)

    with open(full_path, "w", encoding="utf-8") as f:
        f.write(final_content)

    print(f"✅ Improved {category} post saved: {full_path}")
    print(f"🧠 Memory: {len(past_topics)} past {category} posts will be avoided next run")
    print("Open it in VS Code and review!")

    if tracker:
        tracker.log_event(f"✅ {category} post saved: {filename}")
        tracker.set_detail(f"post_{category.lower()}", f"[{category}] {raw_title}")

    return full_path

def generate_daily_posts():
    global tracker
    tracker = Tracker("blog")
    tracker.log_event("Blog bot started — generating 3 posts (AI, Crypto, Tech)")
    print("🚀 Starting daily generation — 3 unique posts (AI, Crypto, Tech)")
    results = {}
    for category in ["AI", "Crypto", "Tech"]:
        try:
            tracker.log_event(f"Starting {category} post generation")
            result = generate_post(category=category)
            results[category] = "✅" if result else "⚠️ skipped"
            if not result:
                tracker.log_error(f"{category} post was skipped")
        except Exception as e:
            print(f"❌ {category} post failed: {e}")
            results[category] = "❌ failed"
            tracker.log_error(f"{category} post failed: {e}")
    print(f"\n📋 Daily summary: {results}")
    success_count = sum(1 for v in results.values() if v == "✅")
    tracker.set_detail("posts_generated", f"{success_count} of 3 posts generated successfully")
    tracker.finish()

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        generate_post(test_mode=True)
    elif len(sys.argv) > 1 and sys.argv[1] == "--daily":
        generate_daily_posts()
    else:
        tracker = Tracker("blog")
        tracker.log_event("Blog bot started — single post mode (AI)")
        generate_post()  # default: single post (AI)
        tracker.finish()



