#!/usr/bin/env python3
"""
Datadrip Smart Reply Bot
=========================
Finds high-value tweets in the AI/Crypto/Tech space and crafts
genuine, engaging replies to boost visibility and grow our following.

Strategy:
1. Search X for recent tweets from relevant accounts
2. Score them: follower size × engagement velocity × freshness
3. Pick the best one we haven't replied to recently
4. Have Grok write a reply that adds real value
5. Post it and log everything

Runs 2x daily (9:30am + 3:30pm PST).
"""

import os
import re
import sys
import json
import math
import random
import datetime
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

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPLY_LOG_PATH = os.path.join(PROJECT_ROOT, "data", "reply_log.json")

# ====================== SEARCH QUERIES ======================
# We rotate through these each run to stay varied.
# AI queries appear twice → ~50% of searches are AI-focused (our strength).
SEARCH_QUERIES = [
    # AI — primary focus
    '("AI" OR "GPT" OR "Claude" OR "LLM" OR "OpenAI") -is:retweet -is:reply lang:en',
    '("artificial intelligence" OR "machine learning" OR "Gemini" OR "Copilot" OR "Anthropic") -is:retweet -is:reply lang:en',
    # Crypto
    '("Bitcoin" OR "Ethereum" OR "crypto" OR "DeFi" OR "Web3") -is:retweet -is:reply lang:en',
    # Tech
    '("tech startup" OR "SaaS" OR "cybersecurity" OR "Apple" OR "Google AI") -is:retweet -is:reply lang:en',
]

# ====================== VALIDATION ======================
def validate_keys():
    missing = []
    for key_name in ["GROK_API_KEY", "X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"]:
        if not os.getenv(key_name):
            missing.append(key_name)
    if missing:
        print(f"❌ Missing required environment variables: {', '.join(missing)}")
        exit(1)

# ====================== REPLY MEMORY ======================
def load_reply_log():
    if not os.path.exists(REPLY_LOG_PATH):
        return []
    try:
        with open(REPLY_LOG_PATH, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []

def save_reply_log(log):
    os.makedirs(os.path.dirname(REPLY_LOG_PATH), exist_ok=True)
    log = log[-50:]  # Keep last 50 replies
    with open(REPLY_LOG_PATH, "w") as f:
        json.dump(log, f, indent=2)

def get_recently_replied_authors(days=7):
    """Get usernames we've replied to in the last N days — don't reply twice."""
    log = load_reply_log()
    cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)).isoformat()
    return set(
        entry.get("replied_to_author", "").lower()
        for entry in log
        if entry.get("timestamp", "") > cutoff
    )

def get_recently_replied_tweet_ids():
    """Get tweet IDs we've already replied to — never reply to the same tweet."""
    log = load_reply_log()
    return set(entry.get("replied_to_tweet_id", "") for entry in log)

def get_recent_reply_context(count=5):
    """Format recent replies for the Grok prompt so it varies its style."""
    log = load_reply_log()
    recent = log[-count:]
    if not recent:
        return "No previous replies yet — this is your first one."
    lines = []
    for r in recent:
        rtype = r.get("reply_type", "unknown")
        rtext = r.get("reply_text", "")[:100]
        lines.append(f"  - [{rtype}] \"{rtext}...\"")
    return "\n".join(lines)

# ====================== X API SEARCH ======================
def search_tweets(query, max_hours=3):
    """
    Search X for recent tweets matching the query.
    Returns a list of candidate dicts, or None if access denied (need Basic tier).
    """
    auth = OAuth1(X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET)
    now = datetime.datetime.now(datetime.timezone.utc)
    start_time = (now - datetime.timedelta(hours=max_hours)).strftime("%Y-%m-%dT%H:%M:%SZ")

    url = "https://api.twitter.com/2/tweets/search/recent"
    params = {
        "query": query,
        "max_results": 25,
        "start_time": start_time,
        "tweet.fields": "created_at,public_metrics,author_id",
        "expansions": "author_id",
        "user.fields": "public_metrics,username",
    }

    try:
        response = requests.get(url, params=params, auth=auth)

        if response.status_code == 403:
            print("=" * 60)
            print("❌ X API returned 403 — Search access denied.")
            print("")
            print("   The reply bot needs X API Basic tier ($200/mo) to search tweets.")
            print("   Your current plan only allows posting tweets.")
            print("")
            print("   To upgrade: https://developer.x.com/en/portal/products")
            print("   Once upgraded, the reply bot will work automatically.")
            print("=" * 60)
            return None  # Signals: no search access

        if response.status_code == 429:
            print("⚠️  X API rate limited — will try again next run.")
            return []

        response.raise_for_status()
        data = response.json()

        tweets = data.get("data", [])
        users = {u["id"]: u for u in data.get("includes", {}).get("users", [])}

        candidates = []
        for tweet in tweets:
            author_id = tweet.get("author_id", "")
            author = users.get(author_id, {})
            followers = author.get("public_metrics", {}).get("followers_count", 0)
            username = author.get("username", "unknown")

            metrics = tweet.get("public_metrics", {})
            likes = metrics.get("like_count", 0)
            retweets = metrics.get("retweet_count", 0)
            replies = metrics.get("reply_count", 0)

            created_str = tweet.get("created_at", "")
            try:
                created_dt = datetime.datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                hours_old = (now - created_dt).total_seconds() / 3600
            except (ValueError, TypeError):
                hours_old = 2.0

            candidates.append({
                "tweet_id": tweet["id"],
                "text": tweet["text"],
                "author_id": author_id,
                "username": username,
                "followers": followers,
                "likes": likes,
                "retweets": retweets,
                "replies": replies,
                "hours_old": round(hours_old, 2),
            })

        return candidates

    except requests.exceptions.RequestException as e:
        print(f"❌ Search API error: {e}")
        return []

# ====================== SCORING ======================
def score_candidate(c):
    """
    Score a tweet for reply-worthiness. Higher = better.

    Formula:
    - 30% account size (log scale, sweet spot 10k–500k followers)
    - 40% engagement velocity (likes + RTs + replies per hour — is this trending?)
    - 30% freshness (exponential decay, newer = better)
    - Bonuses: tweet asks a question (+0.10), moderate likes sweet spot (+0.05)
    """
    followers = c["followers"]
    likes = c["likes"]
    retweets = c["retweets"]
    replies = c["replies"]
    hours_old = c["hours_old"]

    # Skip tiny accounts — our reply won't get visibility
    if followers < 2000:
        return -1

    # Account size: log scale normalized to 0–1 (caps at ~10M)
    size = min(math.log10(max(followers, 10)), 7) / 7

    # Slight penalty for ultra-massive accounts (reply gets buried in thousands)
    if followers > 2_000_000:
        size *= 0.7

    # Engagement velocity: total weighted engagement / hours since posted
    engagement = likes + (retweets * 2) + (replies * 3)
    velocity = engagement / max(hours_old, 0.2)
    speed = min(math.log10(max(velocity, 1) + 1) / 3.5, 1.0)

    # Freshness: exponential decay (half-life ~2 hours)
    fresh = math.exp(-0.35 * hours_old)

    # Bonus: tweet asks a question → author wants replies, perfect for us
    question_bonus = 0.10 if "?" in c["text"] else 0

    # Bonus: moderate engagement sweet spot (visible but not buried)
    if 10 <= likes <= 500:
        sweet_spot = 0.05
    elif likes > 1000:
        sweet_spot = -0.05  # our reply might get lost
    else:
        sweet_spot = 0

    return (size * 0.30) + (speed * 0.40) + (fresh * 0.30) + question_bonus + sweet_spot

# ====================== FIND BEST TWEET ======================
def find_best_tweet(tracker):
    """
    Search multiple topics and return the single best tweet to reply to.
    Returns (candidate_dict, status_string).
    """
    # Always search 1 AI query + 1 other topic → stays varied
    ai_queries = SEARCH_QUERIES[:2]
    other_queries = SEARCH_QUERIES[2:]
    selected = [random.choice(ai_queries), random.choice(other_queries)]
    random.shuffle(selected)

    all_candidates = []
    seen_ids = set()
    replied_authors = get_recently_replied_authors(days=7)
    replied_tweet_ids = get_recently_replied_tweet_ids()

    for query in selected:
        short_query = query[:55] + "..."
        tracker.log_event(f"Searching X for: {short_query}")
        results = search_tweets(query)

        if results is None:
            return None, "no_access"

        for c in results:
            if c["tweet_id"] not in seen_ids:
                seen_ids.add(c["tweet_id"])
                all_candidates.append(c)

    if not all_candidates:
        tracker.log_event("No tweets found in search results")
        return None, "no_results"

    tracker.log_event(f"Found {len(all_candidates)} candidate tweets")

    # Filter out: already replied, tiny accounts, no engagement, our own replies
    filtered = []
    for c in all_candidates:
        # Skip if we replied to this author recently
        if c["username"].lower() in replied_authors:
            continue
        # Skip if we replied to this exact tweet
        if c["tweet_id"] in replied_tweet_ids:
            continue
        # Skip tiny accounts
        if c["followers"] < 2000:
            continue
        # Skip zero-engagement tweets
        total_engagement = c["likes"] + c["retweets"] + c["replies"]
        if total_engagement < 3:
            continue
        # Skip tweets that are just links/media with no real text
        clean_text = re.sub(r'https?://\S+', '', c["text"]).strip()
        if len(clean_text) < 20:
            continue
        filtered.append(c)

    if not filtered:
        tracker.log_event("No suitable candidates after filtering (already replied, too small, etc.)")
        return None, "filtered_out"

    tracker.log_event(f"{len(filtered)} tweets passed filters")

    # Score and sort
    scored = [(score_candidate(c), c) for c in filtered]
    scored.sort(key=lambda x: x[0], reverse=True)

    # Return the best one
    best_score, best = scored[0]
    tracker.log_event(
        f"🎯 Best: @{best['username']} ({best['followers']:,} followers) — "
        f"{best['likes']}❤️ {best['retweets']}🔁 — "
        f"{best['hours_old']:.1f}h old — score {best_score:.3f}"
    )

    return best, "found"

# ====================== GROK REPLY GENERATION ======================
REPLY_PROMPT = """You are replying to a tweet as the person behind @Datadripco on X/Twitter. You run an AI, Crypto & Tech blog and you're genuinely plugged into the space. You're a sharp tech person who engages in real conversations online.

═══ CRITICAL RULES ═══
- Sound like a REAL PERSON having a conversation. Short, punchy, conversational.
- Reference something SPECIFIC from their tweet. Your reply should NOT work as a generic response to any tweet — it must clearly respond to THIS one.
- Add genuine value: a new angle, a smart question, relevant data, or a clear opinion.
- NEVER mention your blog, website, brand, or link. This is about engaging, not promoting. Zero self-promotion.
- NEVER use generic filler: "Great point!", "So true!", "This!", "Love this take!", "Couldn't agree more!", "Exactly!", "Well said!"
- Keep it to 1-2 sentences. 3 max if you're making a complex point. Short replies get more engagement.
- Use contractions (it's, don't, I'm, we've). Sound like you talk, not like you write an essay.
- NEVER use: "game-changer", "mind-blowing", "paradigm shift", "buckle up", "let that sink in", "deep dive"
- No hashtags in replies. They look spammy in a conversation.
- No emojis overload. One at most, only if it feels natural.

═══ REPLY APPROACHES (pick the BEST one for THIS tweet) ═══
1. "add_insight" — Drop a fact, angle, or connection they didn't mention. "Actually the bigger deal here is..."
2. "ask_question" — Ask something thought-provoking that makes people want to reply. Drive conversation deeper.
3. "take" — Share your opinion clearly. Agree with a reason, or respectfully push back. Debate drives engagement.
4. "connect_dots" — Link their point to something else happening right now. "This + [other trend] = something wild"
5. "experience" — Brief related observation: "Been seeing the same..." or "Tested this yesterday and..."

═══ THE TWEET YOU'RE REPLYING TO ═══
Author: @{username} ({followers:,} followers)
Tweet: "{tweet_text}"

═══ YOUR RECENT REPLIES (vary your approach — don't repeat the same style) ═══
{recent_replies}

═══ OUTPUT ═══
Reply with JSON only:
{{
  "reply_type": "add_insight" or "ask_question" or "take" or "connect_dots" or "experience" or "skip",
  "reply_text": "your reply text (empty string if skip)"
}}

If the tweet is not interesting enough to add genuine value to, reply_type should be "skip".
Remember: you're a real person in a real conversation. Reply like one."""

def parse_json_response(content):
    """Parse JSON from Grok response, handling code fences and malformed output."""
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
        # Last resort — treat the whole response as the reply text
        print("⚠️  Could not parse JSON — using raw text as reply")
        return {
            "reply_type": "take",
            "reply_text": content.strip()[:280],
        }

def generate_reply(candidate, tracker):
    """
    Ask Grok to write a reply to the given tweet.
    Returns dict with reply_type and reply_text, or None if Grok says skip.
    """
    recent_context = get_recent_reply_context(5)

    prompt = REPLY_PROMPT.format(
        username=candidate["username"],
        followers=candidate["followers"],
        tweet_text=candidate["text"],
        recent_replies=recent_context,
    )

    payload = {
        "model": "grok-4",
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": "Write your reply to this tweet. Pick the best approach for maximum engagement."},
        ],
        "temperature": 0.9,
        "max_tokens": 200,
    }
    headers = {
        "Authorization": f"Bearer {GROK_API_KEY}",
        "Content-Type": "application/json",
    }

    tracker.log_event("Asking Grok to craft a reply...")
    response = requests.post("https://api.x.ai/v1/chat/completions", json=payload, headers=headers)
    response.raise_for_status()
    data = response.json()

    # Track token usage
    usage = data.get("usage", {})
    tracker.log_api_call(
        "Reply Generation", model="grok-4",
        input_tokens=usage.get("prompt_tokens", tracker.estimate_tokens(prompt)),
        output_tokens=usage.get("completion_tokens", tracker.estimate_tokens(data["choices"][0]["message"]["content"])),
    )

    content = data["choices"][0]["message"]["content"]
    reply_data = parse_json_response(content)

    if reply_data.get("reply_type") == "skip" or not reply_data.get("reply_text", "").strip():
        return None

    return reply_data

# ====================== POST REPLY ======================
def post_reply(tweet_id, reply_text):
    """Post a reply to a specific tweet. Returns the reply's tweet ID."""
    auth = OAuth1(X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET)

    url = "https://api.twitter.com/2/tweets"
    payload = {
        "text": reply_text,
        "reply": {
            "in_reply_to_tweet_id": tweet_id,
        },
    }

    r = requests.post(url, json=payload, auth=auth)
    r.raise_for_status()

    reply_id = r.json().get("data", {}).get("id", "unknown")
    return reply_id

# ====================== MAIN ======================
if __name__ == "__main__":
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print("=" * 60)
    print(f"💬 Datadrip Reply Bot — {now}")
    print("=" * 60)

    tracker = Tracker("reply")
    tracker.log_event("Reply bot started")

    validate_keys()
    tracker.log_event("API keys validated")

    # --- Step 1: Find the best tweet to reply to ---
    best_tweet, status = find_best_tweet(tracker)

    if status == "no_access":
        tracker.log_error("X API search access denied — need Basic tier ($200/mo)")
        tracker.set_detail("outcome", "Skipped — X API plan doesn't include search. Need to upgrade to Basic tier.")
        tracker.finish()
        print("\n⚠️  Reply bot needs X API Basic tier for search. Exiting gracefully.")
        exit(0)  # Exit 0 so the workflow doesn't show as failed

    if best_tweet is None:
        tracker.log_event(f"No suitable tweet found (reason: {status}). Skipping this run.")
        tracker.set_detail("outcome", f"Skipped — no good tweets to reply to ({status})")
        tracker.finish()
        print("\n⚠️  No good tweets found this run. Will try again next time.")
        exit(0)

    # --- Step 2: Generate a reply with Grok ---
    # Try up to 3 candidates if Grok says "skip" on the first
    reply_data = None
    candidates_tried = 0
    max_tries = 3

    # Re-do the search to have backup candidates
    all_scored = []
    replied_authors = get_recently_replied_authors(days=7)
    replied_ids = get_recently_replied_tweet_ids()

    # We already have the best one, let's try it first
    reply_data = generate_reply(best_tweet, tracker)
    candidates_tried += 1
    target = best_tweet

    if reply_data is None:
        tracker.log_event(f"Grok skipped @{best_tweet['username']}'s tweet — trying next candidate")
        # If Grok skips, we don't have easy access to runner-up.
        # Log and exit gracefully rather than making extra API calls.
        tracker.log_event("No suitable reply generated. Skipping this run.")
        tracker.set_detail("outcome", "Skipped — Grok didn't find the tweet worth replying to")
        tracker.finish()
        exit(0)

    reply_text = reply_data["reply_text"].strip()
    reply_type = reply_data.get("reply_type", "unknown")

    # Safety: enforce length limit
    if len(reply_text) > 280:
        reply_text = reply_text[:277] + "..."

    print(f"\n📋 Replying to @{target['username']}:")
    print(f"   Original: \"{target['text'][:120]}...\"")
    print(f"   Our reply ({reply_type}): \"{reply_text}\"")

    # --- Step 3: Post the reply ---
    tracker.log_event(f"Posting reply to @{target['username']}...")
    try:
        reply_id = post_reply(target["tweet_id"], reply_text)
        tracker.log_event(f"✅ Reply posted! (ID: {reply_id})")
        print(f"\n✅ Reply posted! (ID: {reply_id})")
    except requests.exceptions.HTTPError as e:
        tracker.log_error(f"Failed to post reply: {e}")
        tracker.set_detail("outcome", f"Failed to post reply: {e}")
        tracker.finish()
        exit(1)

    # --- Step 4: Log everything ---
    log = load_reply_log()
    log.append({
        "timestamp": now,
        "replied_to_tweet_id": target["tweet_id"],
        "replied_to_author": target["username"],
        "replied_to_followers": target["followers"],
        "replied_to_text": target["text"][:300],
        "replied_to_engagement": f"{target['likes']}❤️ {target['retweets']}🔁 {target['replies']}💬",
        "reply_type": reply_type,
        "reply_text": reply_text,
        "reply_tweet_id": reply_id,
    })
    save_reply_log(log)
    print(f"💾 Reply logged ({len(log)} total in memory)")

    # Store details for the readable report
    tracker.set_detail("outcome", "Reply posted successfully")
    tracker.set_detail("replied_to", f"@{target['username']} ({target['followers']:,} followers)")
    tracker.set_detail("original_tweet", target["text"][:200])
    tracker.set_detail("reply_text", reply_text)
    tracker.set_detail("reply_type", reply_type)
    tracker.set_detail("reply_tweet_id", reply_id)

    tracker.finish()
    print("\n✅ Done!")
