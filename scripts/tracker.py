"""
Datadrip Cost Tracker & Event Logger
=====================================
Shared module used by both the blog bot and tweet bot to track:
- API costs (token usage per call, image generation)
- Key events (what happened during each run)
- Errors (anything that went wrong)
- Extra details (tweet text, post titles, etc.)

Reports go to 3 places:
1. data/report.md — Human-readable log you can open on GitHub (newest at top)
2. GitHub Actions step summary — Same readable report right in the Actions UI
3. data/cost_log.json — Raw data backup (you don't need to read this)

Pricing estimates (update PRICING dict if x.ai changes rates):
- grok-4 text: ~$3/1M input tokens, ~$15/1M output tokens
- grok-imagine-image: ~$0.07 per image
"""

import os
import json
import datetime

# ====================== PRICING (estimates — update if x.ai changes rates) ======================
PRICING = {
    "grok-4": {
        "input_per_1m": 3.00,   # $ per 1M input tokens
        "output_per_1m": 15.00,  # $ per 1M output tokens
    },
    "grok-imagine-image": {
        "per_image": 0.07,  # $ per image generated
    },
}


class Tracker:
    """Track costs, events, and errors for a single bot run."""

    def __init__(self, bot_name):
        """
        bot_name: "blog" or "tweet" — identifies which bot this run is for.
        """
        self.bot_name = bot_name
        self.start_time = datetime.datetime.now(datetime.timezone.utc)
        self.events = []
        self.api_calls = []
        self.errors = []
        self.details = {}  # Extra context like tweet text, post titles, etc.
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.total_cost = 0.0
        self.image_count = 0

    # ---- Logging methods ----

    def log_event(self, message):
        """Log a key event with timestamp."""
        timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S UTC")
        self.events.append({"time": timestamp, "message": message})
        print(f"📋 {message}")

    def log_api_call(self, label, model="grok-4", input_tokens=0, output_tokens=0):
        """Log a text API call with token counts and estimated cost."""
        rates = PRICING.get(model, PRICING["grok-4"])
        cost = (input_tokens * rates["input_per_1m"] + output_tokens * rates["output_per_1m"]) / 1_000_000
        self.total_input_tokens += input_tokens
        self.total_output_tokens += output_tokens
        self.total_cost += cost
        self.api_calls.append({
            "label": label,
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost": round(cost, 6),
        })

    def log_image(self, success=True):
        """Log an image generation call."""
        cost = PRICING["grok-imagine-image"]["per_image"] if success else 0
        self.total_cost += cost
        if success:
            self.image_count += 1
        self.api_calls.append({
            "label": f"Image Generation ({'success' if success else 'failed'})",
            "model": "grok-imagine-image",
            "input_tokens": 0,
            "output_tokens": 0,
            "cost": cost,
            "success": success,
        })

    def log_error(self, message):
        """Log an error event."""
        timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S UTC")
        self.events.append({"time": timestamp, "message": f"❌ ERROR: {message}"})
        self.errors.append(message)
        print(f"❌ TRACKER: {message}")

    def set_detail(self, key, value):
        """Store extra context for the report (tweet text, post title, etc.)."""
        self.details[key] = value

    # ---- Utilities ----

    @staticmethod
    def estimate_tokens(text):
        """Rough token estimate: ~4 chars per token for English text."""
        if not text:
            return 0
        return max(1, len(str(text)) // 4)

    # ---- Human-readable report (the main report you read) ----

    def _build_readable_report(self):
        """Build a clean, human-readable markdown report."""
        end_time = datetime.datetime.now(datetime.timezone.utc)
        duration = round((end_time - self.start_time).total_seconds(), 1)
        date_str = self.start_time.strftime("%B %d, %Y")  # "March 3, 2026"
        time_str = self.start_time.strftime("%I:%M %p UTC")  # "06:07 AM UTC"
        status = "✅ Everything ran successfully" if not self.errors else f"⚠️ {len(self.errors)} error(s) occurred"
        bot_emoji = {"tweet": "🐦", "blog": "📝", "reply": "💬"}.get(self.bot_name, "🤖")
        bot_label = {"tweet": "Tweet Bot", "blog": "Blog Bot", "reply": "Reply Bot"}.get(self.bot_name, f"{self.bot_name.title()} Bot")

        lines = []
        lines.append(f"## {bot_emoji} {bot_label} — {date_str} at {time_str}")
        lines.append("")
        lines.append(f"**Status:** {status}")
        lines.append(f"**Total time:** {duration} seconds")
        lines.append(f"**Estimated cost:** ${self.total_cost:.4f}")
        lines.append("")

        # ---- What happened (step by step) ----
        lines.append("### What happened (step by step)")
        lines.append("")
        for i, event in enumerate(self.events, 1):
            lines.append(f"{i}. **{event['time']}** — {event['message']}")
        lines.append("")

        # ---- Details (tweet content, post titles, reply info, etc.) ----
        if self.details:
            lines.append("### Details")
            lines.append("")

            # Outcome (used by reply bot when skipping)
            if "outcome" in self.details:
                lines.append(f"**Outcome:** {self.details['outcome']}")
                lines.append("")

            # Tweet bot details
            if "tweet_text" in self.details:
                lines.append(f"**Tweet posted:**")
                lines.append(f"> {self.details['tweet_text']}")
                lines.append("")
            if "tweet_type" in self.details:
                lines.append(f"**Tweet type:** {self.details['tweet_type']}")
            if "tweet_id" in self.details:
                lines.append(f"**Tweet ID:** {self.details['tweet_id']}")
            if "promoted_url" in self.details:
                lines.append(f"**Blog post promoted:** {self.details['promoted_url']}")
            if "had_image" in self.details:
                lines.append(f"**Image attached:** {'Yes' if self.details['had_image'] else 'No'}")

            # Reply bot details
            if "replied_to" in self.details:
                lines.append(f"**Replied to:** {self.details['replied_to']}")
            if "original_tweet" in self.details:
                lines.append(f"**Their tweet:**")
                lines.append(f"> {self.details['original_tweet']}")
                lines.append("")
            if "reply_text" in self.details:
                lines.append(f"**Our reply:**")
                lines.append(f"> {self.details['reply_text']}")
                lines.append("")
            if "reply_type" in self.details:
                lines.append(f"**Reply style:** {self.details['reply_type']}")
            if "reply_tweet_id" in self.details:
                lines.append(f"**Reply ID:** {self.details['reply_tweet_id']}")

            # Blog bot details
            if "posts_generated" in self.details:
                lines.append(f"**Posts generated:** {self.details['posts_generated']}")
            for key, val in self.details.items():
                if key.startswith("post_"):
                    lines.append(f"  - {val}")
            lines.append("")

        # ---- Cost breakdown ----
        if self.api_calls:
            lines.append("### Cost breakdown")
            lines.append("")
            lines.append("What we paid for (estimated):")
            lines.append("")
            for call in self.api_calls:
                if call["model"] == "grok-imagine-image":
                    success = call.get("success", True)
                    if success:
                        lines.append(f"- **Image generation** — 1 image created — **${call['cost']:.4f}**")
                    else:
                        lines.append(f"- **Image generation** — ❌ failed (no charge)")
                else:
                    in_tokens = f"{call['input_tokens']:,}" if call['input_tokens'] else "0"
                    out_tokens = f"{call['output_tokens']:,}" if call['output_tokens'] else "0"
                    lines.append(f"- **{call['label']}** — sent {in_tokens} tokens, got back {out_tokens} tokens — **${call['cost']:.4f}**")
            lines.append("")
            lines.append(f"**💰 Total estimated cost: ${self.total_cost:.4f}**")
            lines.append("")

        # ---- Errors ----
        if self.errors:
            lines.append("### ⚠️ Errors")
            lines.append("")
            for err in self.errors:
                lines.append(f"- ❌ {err}")
            lines.append("")

        lines.append("---")
        lines.append("")

        return "\n".join(lines)

    # ---- Save methods ----

    def _save_json_backup(self):
        """Append raw data to data/cost_log.json (machine-readable backup)."""
        try:
            project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            log_path = os.path.join(project_root, "data", "cost_log.json")
            os.makedirs(os.path.dirname(log_path), exist_ok=True)

            if os.path.exists(log_path):
                try:
                    with open(log_path, "r") as f:
                        log = json.load(f)
                except (json.JSONDecodeError, IOError):
                    log = []
            else:
                log = []

            end_time = datetime.datetime.now(datetime.timezone.utc)
            log.append({
                "bot": self.bot_name,
                "date": self.start_time.strftime("%Y-%m-%d"),
                "start_time": self.start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "duration_seconds": round((end_time - self.start_time).total_seconds(), 1),
                "api_calls": self.api_calls,
                "errors": self.errors,
                "details": self.details,
                "totals": {
                    "input_tokens": self.total_input_tokens,
                    "output_tokens": self.total_output_tokens,
                    "images_generated": self.image_count,
                    "estimated_cost_usd": round(self.total_cost, 4),
                },
            })
            log = log[-200:]

            with open(log_path, "w") as f:
                json.dump(log, f, indent=2)
        except Exception as e:
            print(f"⚠️  Failed to save JSON backup: {e}")

    def _save_readable_report(self):
        """Prepend this run's report to data/report.md (newest first)."""
        try:
            project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            report_path = os.path.join(project_root, "data", "report.md")
            os.makedirs(os.path.dirname(report_path), exist_ok=True)

            new_report = self._build_readable_report()

            # Read existing content
            existing = ""
            if os.path.exists(report_path):
                try:
                    with open(report_path, "r", encoding="utf-8") as f:
                        existing = f.read()
                except IOError:
                    existing = ""

            # Strip old header if present, we'll re-add it
            if existing.startswith("# 📊 Datadrip Bot Reports"):
                # Find where the header ends (after the description line + blank line)
                header_end = existing.find("\n---\n")
                if header_end != -1:
                    existing = existing[header_end + 5:]  # skip past \n---\n

            # Build full file: header + new report + old reports
            header = "# 📊 Datadrip Bot Reports\n\n"
            header += "*This file is automatically updated every time the tweet bot or blog bot runs.*\n"
            header += "*Newest reports are at the top. Scroll down for older runs.*\n\n"
            header += "---\n\n"

            # Keep the file from growing forever — cap at roughly 100 reports
            # Each report ends with "---\n\n", so split on that
            all_reports = (new_report + existing).split("---\n\n")
            all_reports = [r for r in all_reports if r.strip()]  # remove empties
            all_reports = all_reports[:100]  # keep last 100

            body = "---\n\n".join(all_reports)
            if not body.endswith("---\n\n"):
                body += "---\n\n"

            with open(report_path, "w", encoding="utf-8") as f:
                f.write(header + body)

            print(f"💾 Report saved to data/report.md")
        except Exception as e:
            print(f"⚠️  Failed to save readable report: {e}")

    def _write_github_summary(self):
        """Write the human-readable report to GitHub Actions step summary."""
        summary_file = os.getenv("GITHUB_STEP_SUMMARY")
        if not summary_file:
            return

        try:
            report_md = self._build_readable_report()
            with open(summary_file, "a") as f:
                f.write(report_md + "\n")
        except Exception as e:
            print(f"⚠️  Failed to write GitHub Actions summary: {e}")

    def _print_console_summary(self):
        """Print a clean summary to the console."""
        end_time = datetime.datetime.now(datetime.timezone.utc)
        duration = round((end_time - self.start_time).total_seconds(), 1)
        status = "✅ No errors" if not self.errors else f"⚠️  {len(self.errors)} error(s)"
        bot_label = {"tweet": "TWEET", "blog": "BLOG", "reply": "REPLY"}.get(self.bot_name, self.bot_name.upper())

        print("\n" + "=" * 60)
        print(f"📊 {bot_label} BOT — RUN REPORT")
        print(f"   Date: {self.start_time.strftime('%B %d, %Y at %I:%M %p UTC')}")
        print(f"   Duration: {duration}s")
        print(f"   Status: {status}")
        print(f"   Estimated cost: ${self.total_cost:.4f}")
        print("=" * 60)

        print("\nWhat happened:")
        for i, event in enumerate(self.events, 1):
            print(f"   {i}. [{event['time']}] {event['message']}")

        if self.api_calls:
            print(f"\nCost breakdown:")
            for call in self.api_calls:
                if call["model"] == "grok-imagine-image":
                    success = call.get("success", True)
                    status_str = "created" if success else "failed"
                    print(f"   • Image generation ({status_str}): ${call['cost']:.4f}")
                else:
                    print(f"   • {call['label']}: {call['input_tokens']:,} in + {call['output_tokens']:,} out = ${call['cost']:.4f}")
            print(f"   ─────────────────────────")
            print(f"   💰 TOTAL: ${self.total_cost:.4f}")

        if self.errors:
            print(f"\n⚠️  Errors:")
            for err in self.errors:
                print(f"   ❌ {err}")

        print("=" * 60)

    # ---- Main finish method ----

    def finish(self):
        """Call at the end of a run — saves all reports and prints summary."""
        self.log_event(f"{self.bot_name.title()} bot finished")
        self._save_json_backup()
        self._save_readable_report()
        self._print_console_summary()
        self._write_github_summary()
