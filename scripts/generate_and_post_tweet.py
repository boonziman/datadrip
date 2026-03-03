import os
import re
import json
import datetime
import tempfile
import requests
from requests_oauthlib import OAuth1
from dotenv import load_dotenv

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
POSTS_DIR = os.path.join(PROJECT_ROOT, "content", "posts")
SITE_URL = "https://datadripco.com"

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
    """Save the tweet log, keeping the last 50 entries."""
    os.makedirs(os.path.dirname(TWEET_LOG_PATH), exist_ok=True)
    # Keep only last 50 tweets to prevent the file from growing forever
    log = log[-50:]
    with open(TWEET_LOG_PATH, "w") as f:
        json.dump(log, f, indent=2)

def get_recent_tweets_context(count=5):
    """Return the last N tweets as context for the prompt."""
    log = load_tweet_log()
    recent = log[-count:] if log else []
    if not recent:
        return "No previous tweets yet — this is your first one!"
    lines = []
    for entry in recent:
        lines.append(f"- [{entry.get('timestamp', '?')}] {entry.get('tweet_text', '?')}")
    return "\n".join(lines)

# ====================== BLOG POST AWARENESS ======================
def get_todays_posts():
    """Scan content/posts/ for posts created today. Returns list of {title, url}."""
    today = datetime.date.today().isoformat()  # e.g. "2026-03-02"
    posts = []
    try:
        for filename in os.listdir(POSTS_DIR):
            if today not in filename or not filename.endswith(".md"):
                continue
            filepath = os.path.join(POSTS_DIR, filename)
            title = extract_title(filepath)
            # Build full URL from filename for tweet links
            # e.g. "2026-03-02-2224-ais-arctic-power-grab-energy-wars-heat-up.md"
            # Hugo default: /posts/{filename-without-.md}/
            slug = filename.replace(".md", "")
            url = f"{SITE_URL}/posts/{slug}/"
            posts.append({"title": title, "url": url, "filename": filename})
    except FileNotFoundError:
        pass
    return posts

def extract_title(filepath):
    """Extract the title from a markdown file's frontmatter."""
    try:
        with open(filepath, "r") as f:
            content = f.read(2000)  # Only need the frontmatter
        match = re.search(r'^title:\s*["\']?(.+?)["\']?\s*$', content, re.MULTILINE)
        if match:
            return match.group(1)
    except IOError:
        pass
    return "New post"

def format_blog_context(posts):
    """Format today's blog posts for the system prompt."""
    if not posts:
        return "Did a new post drop today? No"
    lines = ["Did a new post drop today? Yes! Here are today's posts:"]
    for p in posts:
        lines.append(f"  - \"{p['title']}\" → {p['url']}")
    lines.append("You can use these titles and URLs in teaser tweets.")
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
            print(f"✅ Image generated, downloading...")
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
        # Write image bytes to a temporary file for the upload
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        with open(tmp_path, "rb") as img_file:
            files = {"media": img_file}
            r = requests.post(url, files=files, auth=auth)

        os.unlink(tmp_path)  # Clean up temp file

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
SYSTEM_PROMPT = """You are @Datadripco — a sharp, trusted voice in AI, Crypto & Tech. 
You run the Datadrip blog. You sound like a real enthusiastic tech journalist who geeks out over breakthroughs but stays professional and helpful. 

Rules you ALWAYS follow:
- 50%+ of tweets must focus on AI (your strongest niche)
- Lean AI → Crypto → Tech crossover naturally
- Never sound robotic. Use natural language, contractions, occasional excitement, 0-2 emojis max.
- Catch and ride hot trends when they appear (Grok has real-time knowledge — use it).
- Only 25-30% of tweets should link to a new blog post — the rest are pure value.
- Hashtags: 0-2 max, only when they feel natural.
- Image: Decide if a custom Grok Imagine image would help (yes for trends/insights, no for pure text questions).
- Length: 100-280 characters, punchy and engaging.
- End with subtle brand nudge when it fits.
- DO NOT repeat or closely paraphrase any of your recent tweets listed below.

Tweet types to choose from (pick the BEST one for right now):
1. Hot trend reaction (if something big is happening in AI/crypto/tech)
2. Original AI insight or "quick thought"
3. Engagement question or poll idea
4. Blog teaser (only if a new post dropped today — include the full URL so readers can click through)
5. Mini-value drop or "did you know" style

Current time (UTC): {current_time}
{blog_context}

Your recent tweets (DO NOT repeat these — vary your topic, style, and angle):
{recent_tweets}

Generate EXACTLY ONE tweet in JSON format:
{{
  "tweet_text": "the full tweet here",
  "use_image": true or false,
  "image_prompt": "detailed Grok Imagine prompt if use_image is true, else empty string"
}}

Make it feel 100% human and brand-perfect for Datadrip."""

# ====================== HELPERS ======================
def get_current_utc_time():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

def parse_json_response(content):
    """Parse JSON from Grok, stripping markdown code fences if present."""
    # Strip markdown code fences like ```json ... ```
    cleaned = re.sub(r'```(?:json)?\s*', '', content).strip()
    cleaned = cleaned.rstrip('`').strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Last resort: try to find JSON object in the text
        match = re.search(r'\{[^{}]*\}', cleaned, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        # Ultimate fallback: use the raw text as tweet
        print("⚠️  Could not parse JSON from Grok — using raw text as tweet")
        return {"tweet_text": content.strip()[:280], "use_image": False, "image_prompt": ""}

def generate_tweet():
    """Call Grok API to generate one tweet with memory and blog awareness."""
    current_time = get_current_utc_time()
    todays_posts = get_todays_posts()
    blog_context = format_blog_context(todays_posts)
    recent_tweets = get_recent_tweets_context(5)

    prompt = SYSTEM_PROMPT.format(
        current_time=current_time,
        blog_context=blog_context,
        recent_tweets=recent_tweets
    )

    payload = {
        "model": "grok-4",
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": "Generate the perfect next tweet right now."}
        ],
        "temperature": 0.85,
        "max_tokens": 300
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

    tweet_data = parse_json_response(content)
    return tweet_data

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
        if image_bytes:
            media_id = upload_image_to_twitter(image_bytes, auth)
        if not media_id:
            print("⚠️  Continuing without image (generation or upload failed)")

    # Build tweet payload
    url = "https://api.twitter.com/2/tweets"
    payload = {"text": tweet_text}
    if media_id:
        payload["media"] = {"media_ids": [media_id]}

    r = requests.post(url, json=payload, auth=auth)
    r.raise_for_status()

    tweet_id = r.json().get("data", {}).get("id", "unknown")
    print(f"✅ Tweet posted successfully! (ID: {tweet_id})")
    print(f"📝 {tweet_text}")
    if media_id:
        print(f"🖼️  Posted with image (media_id: {media_id})")

    return tweet_id

# ====================== MAIN ======================
if __name__ == "__main__":
    print("=" * 60)
    print(f"🚀 Datadrip Tweet Bot — {get_current_utc_time()}")
    print("=" * 60)

    # Validate all keys before starting
    validate_keys()

    # Generate the tweet
    tweet = generate_tweet()
    tweet_text = tweet.get("tweet_text", "").strip()
    use_image = tweet.get("use_image", False)
    image_prompt = tweet.get("image_prompt", "")

    if not tweet_text:
        print("❌ Grok returned empty tweet text. Aborting.")
        exit(1)

    print(f"\n📋 Generated tweet ({len(tweet_text)} chars):")
    print(f"   {tweet_text}")
    print(f"   Image: {'Yes' if use_image else 'No'}")
    if use_image and image_prompt:
        print(f"   Image prompt: {image_prompt[:80]}...")

    # Post to Twitter
    tweet_id = post_to_x(tweet_text, image_prompt, use_image)

    # Log the tweet for memory
    log = load_tweet_log()
    log.append({
        "timestamp": get_current_utc_time(),
        "tweet_text": tweet_text,
        "use_image": use_image,
        "image_prompt": image_prompt if use_image else "",
        "tweet_id": tweet_id
    })
    save_tweet_log(log)
    print(f"💾 Tweet logged ({len(log)} total in memory)")

    print("\n✅ Done!")
