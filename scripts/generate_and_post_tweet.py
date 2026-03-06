import os
import re
import sys
import json
import time
import datetime
import tempfile
import requests
from requests_oauthlib import OAuth1
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tracker import Tracker

load_dotenv()

# ====================== CONFIG ======================
GROK_API_KEY = os.getenv("GROK_API_KEY")
X_API_KEY = os.getenv("X_API_KEY")
X_API_SECRET = os.getenv("X_API_SECRET")
X_ACCESS_TOKEN = os.getenv("X_ACCESS_TOKEN")
X_ACCESS_TOKEN_SECRET = os.getenv("X_ACCESS_TOKEN_SECRET")

# Project root (one level up from scripts/)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TWEET_LOG_PATH = os.path.join(PROJECT_ROOT, "data", "tweet_log.json")
PENDING_TWEET_PATH = os.path.join(PROJECT_ROOT, "data", "pending_tweet.json")
POSTS_DIR = os.path.join(PROJECT_ROOT, "content", "posts")
SITE_URL = "https://datadripco.com"

# Module-level tracker (created in __main__)
tracker = None

# ====================== VALIDATION ======================
def validate_keys():
    """Check all required API keys are present before doing anything."""
    missing = []
    for key_name in ["GROK_API_KEY", "X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"]:
        if not os.getenv(key_name):
            missing.append(key_name)
    if missing:
        print(f"❌ Missing required environment variables: {', '.join(missing)}")
        print("   Add them to your .env file or GitHub Secrets.")
        exit(1)

# ====================== TWEET MEMORY ======================
def load_tweet_log():
    """Load past tweets from the log file."""
    if not os.path.exists(TWEET_LOG_PATH):
        return []
    try:
        with open(TWEET_LOG_PATH, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []

def save_tweet_log(log):
    """Save the tweet log, keeping the last 100 entries."""
    os.makedirs(os.path.dirname(TWEET_LOG_PATH), exist_ok=True)
    log = log[-100:]
    with open(TWEET_LOG_PATH, "w") as f:
        json.dump(log, f, indent=2)

def get_recent_tweets_context(count=8):
    """Return the last N tweets with their type as context for the prompt."""
    log = load_tweet_log()
    recent = log[-count:] if log else []
    if not recent:
        return "No previous tweets yet — this is your first one! Make it count."
    lines = []
    for entry in recent:
        tweet_type = entry.get("tweet_type", "unknown")
        lines.append(f"- [type: {tweet_type}] {entry.get('tweet_text', '?')}")
    return "\n".join(lines)

def get_recent_tweet_types(count=8):
    """Return just the types of recent tweets for variety tracking."""
    log = load_tweet_log()
    recent = log[-count:] if log else []
    return [e.get("tweet_type", "unknown") for e in recent]

def get_promoted_post_urls():
    """Return URLs of blog posts already promoted in recent tweets."""
    log = load_tweet_log()
    promoted = set()
    for entry in log[-20:]:  # Check last 20 tweets
        if entry.get("tweet_type") == "blog_teaser":
            url = entry.get("promoted_url", "")
            if url:
                promoted.add(url)
    return promoted

# ====================== BLOG POST AWARENESS ======================
def get_recent_posts(days=3):
    """Scan content/posts/ for posts from the last N days. Returns list of {title, url, date, filename}."""
    posts = []
    today = datetime.date.today()
    try:
        for filename in sorted(os.listdir(POSTS_DIR), reverse=True):
            if not filename.endswith(".md"):
                continue
            # Extract date from filename (e.g. "2026-03-02-2224-...")
            date_match = re.match(r'(\d{4}-\d{2}-\d{2})', filename)
            if not date_match:
                continue
            post_date = datetime.date.fromisoformat(date_match.group(1))
            if (today - post_date).days > days:
                continue
            filepath = os.path.join(POSTS_DIR, filename)
            title = extract_title(filepath)
            category = extract_category(filepath)
            slug = extract_slug(filepath) or filename.replace(".md", "")
            url = f"{SITE_URL}/posts/{slug}/"
            posts.append({
                "title": title,
                "url": url,
                "date": post_date.isoformat(),
                "category": category,
                "filename": filename,
                "is_today": post_date == today
            })
    except FileNotFoundError:
        pass
    return posts

def extract_title(filepath):
    """Extract the title from a markdown file's frontmatter."""
    try:
        with open(filepath, "r") as f:
            content = f.read(2000)
        match = re.search(r'^title:\s*["\']?(.+?)["\']?\s*$', content, re.MULTILINE)
        if match:
            return match.group(1)
    except IOError:
        pass
    return "New post"

def extract_slug(filepath):
    """Extract the slug from a markdown file's frontmatter (returns None if not set)."""
    try:
        with open(filepath, "r") as f:
            content = f.read(2000)
        match = re.search(r'^slug:\s*["\']?(.+?)["\']?\s*$', content, re.MULTILINE)
        if match:
            return match.group(1).strip("'\"").strip('-')
    except IOError:
        pass
    return None

def extract_category(filepath):
    """Extract the category from a markdown file's frontmatter."""
    try:
        with open(filepath, "r") as f:
            content = f.read(2000)
        match = re.search(r'categories:\s*\n\s*-\s*(.*)', content, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    except IOError:
        pass
    return "Tech"

def format_blog_context(posts, already_promoted):
    """Format recent blog posts for the system prompt, noting which are already promoted."""
    if not posts:
        return "Recent blog posts: None in the last 3 days."
    lines = ["Recent Datadrip blog posts (last 3 days):"]
    unpromoted = []
    for p in posts:
        status = "🆕 NEW TODAY" if p["is_today"] else f"📅 {p['date']}"
        promoted = " (⚠️ ALREADY TWEETED)" if p["url"] in already_promoted else ""
        lines.append(f"  - [{p['category']}] \"{p['title']}\" → {p['url']} {status}{promoted}")
        if p["url"] not in already_promoted:
            unpromoted.append(p)
    if unpromoted:
        lines.append(f"\n  {len(unpromoted)} post(s) haven't been promoted yet — consider a teaser if the timing feels right.")
    else:
        lines.append("\n  All recent posts have been promoted. Focus on value tweets instead.")
    return "\n".join(lines)

# ====================== IMAGE GENERATION ======================
def generate_image(image_prompt):
    """Generate an image via Grok Imagine. Returns the image bytes or None."""
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
    print("🎨 Generating tweet image with Grok Imagine...")
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        if response.status_code == 200:
            temp_url = response.json()["data"][0]["url"]
            print("✅ Image generated, downloading...")
            img_response = requests.get(temp_url, timeout=30)
            if img_response.status_code == 200:
                return img_response.content
            else:
                print(f"❌ Image download failed: {img_response.status_code}")
                return None
        else:
            print(f"❌ Image generation error: {response.status_code} - {response.text}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"❌ Image generation network error: {e}")
        return None

def upload_image_to_twitter(image_bytes, auth):
    """Upload an image to Twitter via v1.1 media upload. Returns media_id or None."""
    url = "https://upload.twitter.com/1.1/media/upload.json"
    try:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        with open(tmp_path, "rb") as img_file:
            files = {"media": img_file}
            r = requests.post(url, files=files, auth=auth)

        os.unlink(tmp_path)

        if r.status_code == 200:
            media_id = r.json()["media_id_string"]
            print(f"✅ Image uploaded to Twitter (media_id: {media_id})")
            return media_id
        else:
            print(f"❌ Twitter image upload failed: {r.status_code} - {r.text}")
            return None
    except Exception as e:
        print(f"❌ Twitter image upload error: {e}")
        return None

# ====================== GROK SYSTEM PROMPT ======================
SYSTEM_PROMPT = """You are the person behind @Datadripco on X/Twitter. You're a real human who runs an AI, Crypto & Tech blog called Datadrip. You're knowledgeable, opinionated, and genuinely passionate — not a corporate account, not a bot, not a news aggregator. Think of yourself like a sharp tech founder who tweets between deep work sessions.

═══ YOUR VOICE ═══
- You sound like a REAL PERSON. Short sentences. Casual but smart. Like texting a friend who happens to be a tech expert.
- Use contractions (it's, don't, can't, I'm). Say "I" and "we" naturally.
- Occasionally show genuine emotion — excitement, skepticism, surprise, curiosity.
- NEVER sound like a press release, a LinkedIn post, or a marketing email.
- NEVER use phrases like: "mind-blowing", "game-changer", "these bad boys", "buckle up", "let that sink in", "this is huge", "imagine a world", "picture this", "just wow", "here's the thing", "hot off the press", "breaking down", "deep dive", "paradigm shift", "revolutionize", "disrupt"
- NEVER use an em-dash (—). Real people on Twitter use a regular hyphen (-) or just a comma, period, or new sentence instead. Em-dashes are an AI tell.
- Keep it natural. How would you actually say this to a friend?

═══ X ALGORITHM OPTIMIZATION ═══
- Tweet length = DYNAMIC. Hot takes/one-liners → short (under 120 chars). Insights/opinions → medium (120-200 chars). Blog teasers/value drops → longer (200-280 chars). Don't pad or cut — let the content decide.
- Questions and opinions drive replies → replies boost reach. Ask things people actually want to answer.
- Don't start every tweet with a statement. Mix up: questions, observations, opinions, one-liners, hot takes.
- Tweets with images get ~2x engagement BUT only when the image adds real value.
- Tweets with links get slightly suppressed by the algorithm, so when you DO include a blog link, make the text extra compelling to overcome that.
- Thread-style tweets (tweet then reply) are NOT what we do. Single tweets only.

═══ CONTENT RULES ═══
- 50%+ of tweets focus on AI (our strongest topic)
- Mix in Crypto and Tech naturally — we cover all three
- Ride REAL trending topics when they're hot (you have real-time knowledge — use it!)
- Only ~25% of tweets should promote a blog post. The rest = pure value, opinion, engagement.
- When promoting a blog post: DON'T just say "check out our new post." Tease the most interesting finding or hot take FROM the article, then drop the link. Make people WANT to click.
- NEVER promote a post that's already been promoted (check the list).

═══ HASHTAGS ═══
- Hashtags are SEPARATE from your tweet content. Write the tweet first, then decide on hashtags. Hashtags should NOT eat into or shorten your actual message.
- Most tweets (~50%) should have ZERO hashtags. Clean tweets look more human.
- When you DO use hashtags, use 3-5 that are smart and audience-targeted — tags people in your niche actually follow and search.
- Smart hashtag strategy — pick from whichever category matches the tweet:
  * AI posts: #AI #ArtificialIntelligence #ChatGPT #MachineLearning #OpenAI #Claude #LLM #Grok
  * Crypto posts: #Bitcoin #Crypto #BTC #Ethereum #Blockchain #DeFi #CryptoNews #Web3
  * Tech posts: #Tech #TechNews #Startups #SaaS #Innovation #Fintech #BigTech
- Bad hashtag use: obscure tags nobody searches, irrelevant tags, generic spam tags.
- CRITICAL for blog_teaser tweets: ALWAYS include 3-5 hashtags, AND the URL MUST be the absolute last thing — order is: tweet text → hashtags → URL. This is how Twitter hides the raw URL and shows only the clean card preview.
- For all other tweet types: hashtags go at the END of the tweet.

═══ IMAGE RULES ═══
- NEVER use an image on blog teaser tweets (the link preview card from our site already shows the article image — adding another image HIDES the link preview which kills click-through).
- Use images on ~30-40% of NON-link tweets (insight tweets, data visualizations, trend reactions).
- When you DO want an image, your prompt must follow these rules:
  * Photo-realistic, editorial magazine quality — like a Reuters or Bloomberg photo
  * SPECIFIC to THIS tweet's topic. Name real objects, settings, people's roles, lighting, camera angle.
  * NEVER: neon, cyberpunk, glowing, holographic, futuristic purple/blue aesthetics, floating holograms, dark tech backgrounds
  * GOOD example: "Close-up of a trader's hands on a Bloomberg terminal with crypto charts, office lighting, shallow depth of field"
  * The image should look like it could appear in Wired, Bloomberg, or TechCrunch

═══ TWEET TYPES (pick the best one for RIGHT NOW) ═══
1. "hot_take" — React to something happening RIGHT NOW in AI/crypto/tech. Short, opinionated.
2. "insight" — Share a genuine observation or prediction. "I've been thinking about..." energy.
3. "engagement" — Ask a real question people want to answer. Polls, "which side are you on?", etc.
4. "blog_teaser" — Promote a Datadrip article (ONLY if there's an unpromoted post, max ~25% of tweets).
5. "value_drop" — Quick fact, stat, or "did you know" that makes people go "huh, interesting."

═══ CONTEXT FOR THIS TWEET ═══
Current time (PST): {current_time}

{blog_context}

Your recent tweet types (VARY these — don't do the same type twice in a row):
{recent_types}

Your recent tweets — avoid identical angles or copy-pasted phrasing, but if a topic is hot/trending it's totally fine to revisit with a fresh take:
{recent_tweets}

═══ OUTPUT ═══
Generate EXACTLY ONE tweet as JSON:
{{
  "tweet_type": "hot_take" or "insight" or "engagement" or "blog_teaser" or "value_drop",
  "tweet_text": "the tweet",
  "use_image": true or false,
  "image_prompt": "detailed photo-realistic prompt if use_image is true, else empty string",
  "promoted_url": "the blog post URL if tweet_type is blog_teaser, else empty string"
}}

Remember: you're a real person, not a bot. Tweet like one."""

# ====================== HELPERS ======================
def get_current_pst_time():
    from zoneinfo import ZoneInfo
    return datetime.datetime.now(ZoneInfo("America/Los_Angeles")).strftime("%Y-%m-%d %H:%M PST")

def parse_json_response(content):
    """Parse JSON from Grok, stripping markdown code fences if present."""
    cleaned = re.sub(r'```(?:json)?\s*', '', content).strip()
    cleaned = cleaned.rstrip('`').strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r'\{[^{}]*\}', cleaned, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        print("⚠️  Could not parse JSON from Grok — using raw text as tweet")
        return {
            "tweet_type": "insight",
            "tweet_text": content.strip()[:280],
            "use_image": False,
            "image_prompt": "",
            "promoted_url": ""
        }

def generate_tweet():
    """Call Grok API to generate one tweet with full context awareness."""
    current_time = get_current_pst_time()
    recent_posts = get_recent_posts(days=3)
    already_promoted = get_promoted_post_urls()
    blog_context = format_blog_context(recent_posts, already_promoted)
    recent_tweets = get_recent_tweets_context(5)
    recent_types = get_recent_tweet_types(8)

    # Format type history
    if recent_types:
        type_summary = ", ".join(recent_types[-5:])
        type_line = f"Last 5 tweet types: [{type_summary}] — pick something DIFFERENT from the last one."
    else:
        type_line = "No previous tweets — start strong with a hot take or insight."

    prompt = SYSTEM_PROMPT.format(
        current_time=current_time,
        blog_context=blog_context,
        recent_tweets=recent_tweets,
        recent_types=type_line
    )

    payload = {
        "model": "grok-4",
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": "What should we tweet right now? Pick the best type for this moment and write it."}
        ],
        "temperature": 0.9,
        "max_tokens": 400
    }

    headers = {
        "Authorization": f"Bearer {GROK_API_KEY}",
        "Content-Type": "application/json"
    }

    print("🤖 Asking Grok for a tweet...")
    response = requests.post("https://api.x.ai/v1/chat/completions", json=payload, headers=headers)
    response.raise_for_status()
    data = response.json()
    content = data["choices"][0]["message"]["content"]

    # Track API usage (capture actual token counts from response)
    if tracker:
        usage = data.get("usage", {})
        tracker.log_api_call(
            "Tweet Generation", model="grok-4",
            input_tokens=usage.get("prompt_tokens", tracker.estimate_tokens(prompt)),
            output_tokens=usage.get("completion_tokens", tracker.estimate_tokens(content)),
        )

    tweet_data = parse_json_response(content)

    # Hard strip em-dashes — they're an AI tell and Grok uses them constantly
    if tweet_data.get("tweet_text"):
        tweet_data["tweet_text"] = tweet_data["tweet_text"].replace("\u2014", " - ").replace("\u2013", " - ")

    # Safety: force no image on blog teasers (link preview is better)
    if tweet_data.get("tweet_type") == "blog_teaser":
        tweet_data["use_image"] = False
        tweet_data["image_prompt"] = ""

    return tweet_data

def ensure_url_is_last(tweet_text, url):
    """
    For blog_teaser tweets: guarantee the URL is the absolute last token.
    Twitter/X only hides the URL and shows just the card when nothing follows the URL.
    If Grok placed hashtags after the URL, this moves them before it.
    """
    if not url:
        return tweet_text

    if url not in tweet_text:
        # URL missing from text entirely — append it
        return tweet_text.rstrip() + "\n" + url

    url_idx = tweet_text.find(url)
    url_end = url_idx + len(url)
    after = tweet_text[url_end:].strip()  # e.g. "#AI #Tech"

    if not after:
        return tweet_text  # already last — nothing to do

    # Move the trailing content (hashtags etc) to before the URL
    before_url = tweet_text[:url_idx].rstrip()
    return f"{before_url} {after}\n{url}"

def post_to_x(tweet_text, image_prompt="", use_image=False):
    """Post a tweet to X/Twitter, optionally with a generated image."""
    auth = OAuth1(
        X_API_KEY,
        X_API_SECRET,
        X_ACCESS_TOKEN,
        X_ACCESS_TOKEN_SECRET
    )

    media_id = None

    # Generate and upload image if requested
    if use_image and image_prompt and image_prompt.strip():
        image_bytes = generate_image(image_prompt)
        if tracker:
            tracker.log_image(success=bool(image_bytes))
        if image_bytes:
            media_id = upload_image_to_twitter(image_bytes, auth)
        if not media_id:
            print("⚠️  Continuing without image (generation or upload failed)")

    # Build tweet payload
    url = "https://api.twitter.com/2/tweets"
    payload = {"text": tweet_text}
    if media_id:
        payload["media"] = {"media_ids": [media_id]}

    # Headers to reduce Cloudflare bot-detection blocks from data center IPs
    headers = {
        "User-Agent": "DatadripBot/1.0",
        "Content-Type": "application/json",
    }

    # Retry with backoff — Cloudflare blocks GitHub Actions IPs transiently,
    # especially around the top-of-hour thundering herd window.
    # Waits: 60s, 120s, 180s (total ~6 min of retries)
    max_retries = 4
    for attempt in range(1, max_retries + 1):
        r = requests.post(url, json=payload, auth=auth, headers=headers)

        if r.ok:
            break

        # Check if it's a Cloudflare challenge (HTML instead of JSON)
        is_cloudflare = "Just a moment" in r.text or "_cf_chl" in r.text

        if is_cloudflare and attempt < max_retries:
            wait = attempt * 60  # 60s, 120s, 180s
            print(f"⚠️  Cloudflare challenge detected (attempt {attempt}/{max_retries}), retrying in {wait}s...")
            time.sleep(wait)
            continue
        elif is_cloudflare:
            print(f"❌ Cloudflare is blocking requests to Twitter API from this server.")
            print(f"   This is a known issue with GitHub Actions data center IPs.")
            print(f"   The tweet was generated but could not be posted.")
            print(f"   Tried {max_retries} times over ~{sum(i*60 for i in range(1,max_retries))}s.")
            r.raise_for_status()
        else:
            # Real Twitter API error (JSON response)
            print(f"❌ Twitter API error {r.status_code}: {r.text}")
            r.raise_for_status()

    tweet_id = r.json().get("data", {}).get("id", "unknown")
    print(f"✅ Tweet posted successfully! (ID: {tweet_id})")
    print(f"📝 {tweet_text}")
    if media_id:
        print(f"🖼️  Posted with image (media_id: {media_id})")

    return tweet_id

# ====================== PENDING TWEET ======================
def save_pending_tweet(tweet_text, tweet_type, use_image, image_prompt, promoted_url):
    """Save a failed tweet so the next run can retry it without calling Grok."""
    pending = {
        "tweet_text": tweet_text,
        "tweet_type": tweet_type,
        "use_image": use_image,
        "image_prompt": image_prompt,
        "promoted_url": promoted_url,
        "saved_at": get_current_pst_time(),
    }
    with open(PENDING_TWEET_PATH, "w") as f:
        json.dump(pending, f, indent=2)
    print(f"💾 Pending tweet saved — will retry on next run (no extra API cost).")

def load_pending_tweet():
    """Return pending tweet dict if one exists, else None."""
    if not os.path.exists(PENDING_TWEET_PATH):
        return None
    try:
        with open(PENDING_TWEET_PATH) as f:
            return json.load(f)
    except Exception:
        return None

def clear_pending_tweet():
    """Delete the pending tweet file after a successful retry."""
    if os.path.exists(PENDING_TWEET_PATH):
        os.remove(PENDING_TWEET_PATH)


# ====================== MAIN ======================
if __name__ == "__main__":
    # Random startup jitter (0-90s): prevents Cloudflare from blocking when
    # GitHub Actions jobs all start simultaneously at scheduled times.
    import random
    _jitter = random.randint(0, 90)
    if _jitter > 0:
        print(f"⏳ Startup jitter: waiting {_jitter}s to stagger API calls...", flush=True)
        time.sleep(_jitter)

    print("=" * 60)
    print(f"🚀 Datadrip Tweet Bot — {get_current_pst_time()}")
    print("=" * 60)

    # Initialize cost & event tracker
    tracker = Tracker("tweet")
    tracker.log_event("Tweet bot started")

    # Validate all keys before starting
    validate_keys()
    tracker.log_event("API keys validated")

    # ── Check for a pending tweet from a previous failed run ──────────────────
    # If a tweet was generated but couldn't be posted last time (e.g. Cloudflare
    # block), it was saved to pending_tweet.json. We retry it here for FREE
    # (no Grok call needed — the text is already written).
    pending = load_pending_tweet()
    if pending:
        tweet_text   = pending["tweet_text"]
        tweet_type   = pending["tweet_type"]
        use_image    = pending["use_image"]
        image_prompt = pending["image_prompt"]
        promoted_url = pending["promoted_url"]
        saved_at     = pending.get("saved_at", "unknown")
        print(f"\n🔄 Found a pending tweet from {saved_at} — retrying (no Grok cost).")
        print(f"   {tweet_text}")
        tracker.log_event(f"Retrying pending tweet from {saved_at}")
    else:
        # Normal path: ask Grok to generate a fresh tweet
        tweet = generate_tweet()
        tweet_text   = tweet.get("tweet_text", "").strip()
        tweet_type   = tweet.get("tweet_type", "unknown")
        use_image    = tweet.get("use_image", False)
        image_prompt = tweet.get("image_prompt", "")
        promoted_url = tweet.get("promoted_url", "")

        if not tweet_text:
            print("❌ Grok returned empty tweet text. Aborting.")
            if tracker:
                tracker.log_error("Grok returned empty tweet text")
                tracker.finish()
            exit(1)

        # For blog teasers: strip ANY url Grok may have written (it could be wrong,
        # truncated, or slightly different) and append the exact promoted_url dead last.
        # Twitter only collapses the URL into a card when it is the absolute last thing.
        if tweet_type == "blog_teaser" and promoted_url:
            tweet_text = re.sub(r'https?://\S+', '', tweet_text).strip()
            tweet_text = tweet_text.rstrip() + "\n" + promoted_url

        print(f"\n📋 Generated tweet ({len(tweet_text)} chars, type: {tweet_type}):")
        print(f"   {tweet_text}")
        print(f"   Image: {'Yes' if use_image else 'No'}")
        if use_image and image_prompt:
            print(f"   Image prompt: {image_prompt[:100]}...")
        if promoted_url:
            print(f"   Promoting: {promoted_url}")

    # ── Post to Twitter — same-run retries every 5 min before saving as pending ──
    # Attempt 1: post immediately.
    # If it fails, wait 5 min and try again — up to 3 extra retries (4 total).
    # Each retry has a fresh GitHub runner IP assignment window, so odds improve.
    # Only after ALL 4 attempts fail do we save to pending_tweet.json and exit.
    SAME_RUN_RETRIES = 3          # extra attempts after the first
    RETRY_WAIT_SECS  = 5 * 60    # 5 minutes between each retry
    total_attempts   = SAME_RUN_RETRIES + 1  # 4 total

    tweet_id   = None
    last_error = None

    for attempt in range(1, total_attempts + 1):
        try:
            tweet_id = post_to_x(tweet_text, image_prompt, use_image)
            clear_pending_tweet()   # wipe any old pending file on success
            break
        except Exception as e:
            last_error = str(e)
            if attempt < total_attempts:
                print(f"\n⏳ Post failed (attempt {attempt}/{total_attempts}) — waiting 5 min then retrying same run...")
                print(f"   Error: {last_error}")
                tracker.log_event(f"Post attempt {attempt} failed, retrying in 5 min")
                time.sleep(RETRY_WAIT_SECS)
            else:
                # All attempts in this run exhausted — save for next scheduled run
                print(f"\n❌ FAILED TO POST TWEET after {total_attempts} attempts: {last_error}")
                tracker.log_error(f"Tweet post failed: {last_error}")
                tracker.set_detail("tweet_text", tweet_text)
                tracker.set_detail("tweet_type", tweet_type)
                tracker.set_detail("outcome", f"❌ FAILED — {last_error}")
                tracker.set_detail("had_image", use_image)
                if promoted_url:
                    tracker.set_detail("promoted_url", promoted_url)
                # Save tweet so next scheduled run posts it FREE (no Grok cost)
                save_pending_tweet(tweet_text, tweet_type, use_image, image_prompt, promoted_url)
                tracker.finish()
                exit(1)

    # Log the tweet with full context for memory
    log = load_tweet_log()
    log.append({
        "timestamp": get_current_pst_time(),
        "tweet_type": tweet_type,
        "tweet_text": tweet_text,
        "use_image": use_image,
        "image_prompt": image_prompt if use_image else "",
        "promoted_url": promoted_url,
        "tweet_id": tweet_id
    })
    save_tweet_log(log)
    print(f"💾 Tweet logged ({len(log)} total in memory)")

    # Store details for the readable report
    tracker.set_detail("tweet_text", tweet_text)
    tracker.set_detail("tweet_type", tweet_type)
    tracker.set_detail("tweet_id", tweet_id)
    tracker.set_detail("had_image", use_image)
    if promoted_url:
        tracker.set_detail("promoted_url", promoted_url)

    tracker.log_event(f"Tweet posted and logged (type: {tweet_type}, ID: {tweet_id})")
    tracker.finish()

    print("\n✅ Done!")
