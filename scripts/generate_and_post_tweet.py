import os
import json
import datetime
import random
import requests
from dotenv import load_dotenv

load_dotenv()

# ====================== CONFIG ======================
GROK_API_KEY = os.getenv("GROK_API_KEY")
X_API_KEY = os.getenv("X_API_KEY")
X_API_SECRET = os.getenv("X_API_SECRET")
X_ACCESS_TOKEN = os.getenv("X_ACCESS_TOKEN")
X_ACCESS_TOKEN_SECRET = os.getenv("X_ACCESS_TOKEN_SECRET")

# ====================== GROK SYSTEM PROMPT (the magic) ======================
SYSTEM_PROMPT = """You are @Datadripco — a sharp, trusted voice in AI, Crypto & Tech. 
You run the Datadrip blog (datadripco.com). You sound like a real enthusiastic tech journalist who geeks out over breakthroughs but stays professional and helpful. 

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

Tweet types to choose from (pick the BEST one for right now):
1. Hot trend reaction (if something big is happening in AI/crypto/tech)
2. Original AI insight or "quick thought"
3. Engagement question or poll idea
4. Blog teaser (only if a new post dropped today — make it exciting, not salesy)
5. Mini-value drop or "did you know" style

Current time (UTC): {current_time}
Did a new post drop today? {new_post_today}

Generate EXACTLY ONE tweet in JSON format:
{{
  "tweet_text": "the full tweet here",
  "use_image": true or false,
  "image_prompt": "detailed Grok Imagine prompt if use_image is true, else empty string"
}}

Make it feel 100% human and brand-perfect for Datadrip."""

# ====================== HELPERS ======================
def get_current_utc_time():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M UTC")

def has_new_post_today():
    try:
        posts_dir = "content/posts"
        today = datetime.date.today().isoformat()
        for f in os.listdir(posts_dir):
            if today in f:
                return True
        return False
    except:
        return False

def generate_tweet():
    current_time = get_current_utc_time()
    new_post = "Yes" if has_new_post_today() else "No"

    prompt = SYSTEM_PROMPT.format(current_time=current_time, new_post_today=new_post)

    payload = {
        "model": "grok-4.1-fast",  # cheapest & fast
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

    response = requests.post("https://api.x.ai/v1/chat/completions", json=payload, headers=headers)
    response.raise_for_status()
    data = response.json()
    content = data["choices"][0]["message"]["content"]

    # Parse JSON from Grok
    try:
        tweet_data = json.loads(content)
    except:
        # fallback if not perfect JSON
        tweet_data = {"tweet_text": content.strip(), "use_image": False, "image_prompt": ""}

    return tweet_data

def post_to_x(tweet_text, image_prompt=""):
    # Simple OAuth1 posting with requests (no extra libs needed beyond what's already in requirements)
    from requests_oauthlib import OAuth1

    auth = OAuth1(
        X_API_KEY,
        X_API_SECRET,
        X_ACCESS_TOKEN,
        X_ACCESS_TOKEN_SECRET
    )

    url = "https://api.twitter.com/2/tweets"

    payload = {"text": tweet_text}

    r = requests.post(url, json=payload, auth=auth)
    r.raise_for_status()
    print("✅ Tweet posted successfully!")
    print(tweet_text)

    if image_prompt and image_prompt.strip():
        print(f"🖼️  Suggested image prompt for manual upload if you want: {image_prompt}")

# ====================== MAIN ======================
if __name__ == "__main__":
    print("🚀 Starting smart Datadrip tweet generator...")
    tweet = generate_tweet()
    post_to_x(tweet["tweet_text"], tweet.get("image_prompt", ""))
    print("✅ Done!")
