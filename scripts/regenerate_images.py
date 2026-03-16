"""
Regenerate featured images for specific blog posts using the new image prompt rules.
This script reads each post's title + opening, asks Grok-4 to write a photo prompt,
then generates the image with grok-imagine-image and saves it with the SAME filename
the post already references — so no frontmatter changes needed.

Usage:
    python scripts/regenerate_images.py
"""

import os
import re
import sys
import time
import shutil
import subprocess
import requests
from dotenv import load_dotenv

load_dotenv()

GROK_API_KEY = os.getenv("GROK_API_KEY")
if not GROK_API_KEY:
    print("❌ GROK_API_KEY not found in .env")
    sys.exit(1)

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTS_DIR = os.path.join(PROJECT_ROOT, "content", "posts")
IMAGES_DIR = os.path.join(PROJECT_ROOT, "static", "images", "posts")
THUMB_DIR = os.path.join(IMAGES_DIR, "thumb")
HERO_DIR = os.path.join(IMAGES_DIR, "hero")

# Posts to regenerate — markdown filename → image filename (no extension)
POSTS_TO_FIX = [
    "2026-03-10-0706-ais-physical-frontier-lecuns-1b-push-and-nvidias-agent-revolution.md",
    "2026-03-09-0710-will-ai-upend-venture-capital-forever.md",
    "2026-03-07-0543-ais-listening-crisis-jammers-flops-and-dorseys-reboot.md",
    "2026-03-03-1405-ais-stealth-invasion-gadgets-calls-and-biotech-bre.md",
    "2026-03-02-2224-ais-arctic-power-grab-energy-wars-heat-up.md",
    "2026-03-14-0656-chatgpts-app-integrations-ignite-ai-risk-debates.md",
    "2026-03-12-0715-googles-ai-maps-revolution-flood-predictions-meet-immersive-navigation.md",
    "2026-03-11-0716-googles-32b-wiz-buy-fuels-ai-security-boom.md",
    "2026-03-07-0553-ev-shakeup-fatal-flaws-bold-buyouts-and-hybrid-heroes.md",
    "2026-03-05-0620-ai-ethics-clash-nvidia-retreats-as-anthropic-scrambles.md",
]

API_URL = "https://api.x.ai/v1/chat/completions"
IMAGE_URL = "https://api.x.ai/v1/images/generations"
HEADERS = {
    "Authorization": f"Bearer {GROK_API_KEY}",
    "Content-Type": "application/json",
}


def extract_post_info(filepath):
    """Read a post file and return title, opening text, and the image filename."""
    with open(filepath, "r") as f:
        content = f.read()

    title_match = re.search(r'title:\s*"?(.*?)"?\s*\n', content)
    title = title_match.group(1).strip('"').strip() if title_match else "Untitled"

    img_match = re.search(r'featuredImage:\s*"?(.*?)"?\s*\n', content)
    image_path = img_match.group(1).strip('"').strip() if img_match else None

    # Get the body opening (first ~400 chars after frontmatter)
    body_start = content.split("---", 2)[-1][:400].strip()

    return title, body_start, image_path


def generate_smart_prompt(title, body_start):
    """Use Grok-4 to write a custom image prompt based on the article content."""
    image_prompt_request = f"""Read this article title and opening, then create ONE highly specific, visually descriptive photo prompt for an AI image generator. The image must look completely unique to THIS article.

Rules:
1. Describe a REAL, grounded scene — real objects, real settings, real lighting. It should look like an actual photograph, not an AI art piece.
2. Include camera details: lens focal length, lighting direction, depth of field, and color palette. This keeps images looking like real photography.
3. Be specific to THIS article — use relevant objects, symbols, devices, locations, or scenarios from the topic. Relevant logos and brand symbols (like the Bitcoin logo, Apple logo, Ethereum symbol, etc.) are encouraged when they fit the story.
4. AVOID the typical AI-image look: no neon glows, no glowing holograms, no floating UI elements, no dark purple/blue cyberpunk backgrounds, no futuristic cityscapes. Keep it grounded and realistic.
5. NEVER put fake magazine titles, newspaper mastheads, headline text, or watermark-style text onto the image. Do NOT create images that look like a magazine cover with a title on it. If the scene naturally contains screens, signs, or documents, that's fine — just don't fabricate fake publication branding.
6. AVOID recognizable faces of real public figures.
7. VARY the visual approach every time — rotate between: macro close-up, wide establishing shot, street photography, aerial/bird's-eye, portrait-framing of objects, documentary candid, over-the-shoulder, or detail shot. Don't repeat the same style back to back.
8. Keep it clean and not too busy. A strong simple composition beats a cluttered scene. Think editorial photojournalism, not stock photo collage.
- Output ONLY the image prompt text. No preamble, no explanation, no labels.

Article title: {title}
Opening: {body_start}"""

    payload = {
        "model": "grok-4",
        "messages": [{"role": "user", "content": image_prompt_request}],
        "temperature": 0.9,
        "max_tokens": 300,
    }

    try:
        resp = requests.post(API_URL, headers=HEADERS, json=payload, timeout=60)
        if resp.status_code == 200:
            return resp.json()["choices"][0]["message"]["content"].strip()
        else:
            print(f"  ⚠️ Prompt generation failed ({resp.status_code}): {resp.text[:100]}")
            return None
    except Exception as e:
        print(f"  ⚠️ Prompt generation error: {e}")
        return None


def generate_image(prompt):
    """Call grok-imagine-image and return the temporary URL."""
    payload = {
        "model": "grok-imagine-image",
        "prompt": prompt,
        "n": 1,
        "aspectRatio": "16:9",
    }

    for attempt in range(2):
        try:
            resp = requests.post(IMAGE_URL, headers=HEADERS, json=payload, timeout=90)
            if resp.status_code == 200:
                return resp.json()["data"][0]["url"]
            else:
                print(f"  {'⚠️ Attempt 1 failed, retrying...' if attempt == 0 else '❌ Image gen failed'}: {resp.status_code}")
                if attempt == 0:
                    time.sleep(5)
        except Exception as e:
            print(f"  {'⚠️ Attempt 1 error, retrying...' if attempt == 0 else '❌ Image gen error'}: {e}")
            if attempt == 0:
                time.sleep(5)
    return None


def download_and_save(image_url, target_filename):
    """Download image and overwrite the existing file + create WebP variants."""
    jpg_path = os.path.join(IMAGES_DIR, target_filename)
    webp_name = target_filename.replace(".jpg", ".webp")

    try:
        resp = requests.get(image_url, timeout=30)
        if resp.status_code != 200:
            print(f"  ❌ Download failed: {resp.status_code}")
            return False

        # Save JPG (overwrite existing)
        with open(jpg_path, "wb") as f:
            f.write(resp.content)
        print(f"  ✅ Saved: {target_filename}")

        # Create WebP variants if cwebp is available
        has_cwebp = shutil.which("cwebp") is not None
        if has_cwebp:
            # Full-size WebP
            full_webp = os.path.join(IMAGES_DIR, webp_name)
            subprocess.run(["cwebp", "-q", "55", "-m", "6", jpg_path, "-o", full_webp], capture_output=True)
            print(f"  → WebP full: {webp_name}")

            # Thumbnail 400px wide
            thumb_webp = os.path.join(THUMB_DIR, webp_name)
            subprocess.run(["cwebp", "-q", "60", "-resize", "400", "0", jpg_path, "-o", thumb_webp], capture_output=True)
            print(f"  → WebP thumb: thumb/{webp_name}")

            # Hero 800px wide
            hero_webp = os.path.join(HERO_DIR, webp_name)
            subprocess.run(["cwebp", "-q", "60", "-m", "6", "-resize", "800", "0", jpg_path, "-o", hero_webp], capture_output=True)
            print(f"  → WebP hero: hero/{webp_name}")
        else:
            print("  ⚠️ cwebp not found — skipping WebP variants")

        return True

    except Exception as e:
        print(f"  ❌ Download error: {e}")
        return False


def main():
    print("=" * 60)
    print("🎨 Image Regeneration Script")
    print(f"   Posts to fix: {len(POSTS_TO_FIX)}")
    print("=" * 60)

    success = 0
    failed = 0

    for i, post_file in enumerate(POSTS_TO_FIX, 1):
        filepath = os.path.join(POSTS_DIR, post_file)
        if not os.path.exists(filepath):
            print(f"\n[{i}/{len(POSTS_TO_FIX)}] ❌ File not found: {post_file}")
            failed += 1
            continue

        title, body_start, image_path = extract_post_info(filepath)
        if not image_path:
            print(f"\n[{i}/{len(POSTS_TO_FIX)}] ❌ No featuredImage in: {post_file}")
            failed += 1
            continue

        # Extract just the filename from the path (e.g. "images/posts/foo.jpg" → "foo.jpg")
        target_filename = os.path.basename(image_path)

        print(f"\n[{i}/{len(POSTS_TO_FIX)}] 📰 {title}")
        print(f"  Image: {target_filename}")

        # Step 1: Generate smart prompt
        print("  🧠 Generating image prompt with Grok-4...")
        prompt = generate_smart_prompt(title, body_start)
        if not prompt:
            # Fallback prompt
            prompt = (
                f"A realistic editorial photograph related to: {title}. "
                f"Shot on a 35mm lens at f/2.8, natural ambient lighting, shallow depth of field. "
                f"Clean composition, not too busy. Real-world scene, no fake magazine titles or AI glow effects."
            )
            print(f"  ⚠️ Using fallback prompt")
        else:
            print(f"  📝 Prompt: {prompt[:120]}...")

        # Step 2: Generate the image
        print("  🎨 Generating image with Grok Imagine...")
        temp_url = generate_image(prompt)
        if not temp_url:
            print(f"  ❌ FAILED to generate image for: {title}")
            failed += 1
            continue

        # Step 3: Download and save (overwrite old image + create WebP variants)
        if download_and_save(temp_url, target_filename):
            success += 1
        else:
            failed += 1

        # Brief pause between posts to avoid rate limits
        if i < len(POSTS_TO_FIX):
            print("  ⏳ Pausing 3s before next post...")
            time.sleep(3)

    print("\n" + "=" * 60)
    print(f"✅ Done! {success} succeeded, {failed} failed out of {len(POSTS_TO_FIX)}")
    print("=" * 60)

    if success > 0:
        print("\n📋 Next steps:")
        print("  1. Run: hugo --gc --minify")
        print("  2. Check the images look good locally (hugo server -D)")
        print("  3. Commit and push to deploy")


if __name__ == "__main__":
    main()
