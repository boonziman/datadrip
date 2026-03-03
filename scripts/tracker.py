"""
Datadrip Cost Tracker & Event Logger
=====================================
Shared module used by both the blog bot and tweet bot to track:
- API costs (token usage per call, image generation)
- Key events (what happened during each run)
- Errors (anything that went wrong)

Reports are:
1. Printed to console (visible in GitHub Actions logs)
2. Saved to data/cost_log.json (committed by workflows — historical data)
3. Written to GitHub Actions step summary (nice markdown table in the Actions UI)

Pricing estimates (update PRICING dict if x.ai changes rates):
- grok-4 text: ~$3/1M input tokens, ~$15/1M output tokens
- grok-imagine-image: ~$0.07 per image

Usage:
    from tracker import Tracker
    tracker = Tracker("tweet")  # or "blog"
    tracker.log_event("Starting tweet generation")
    tracker.log_api_call("Tweet Gen", model="grok-4", input_tokens=500, output_tokens=100)
    tracker.log_image(success=True)
    tracker.finish()  # saves report + prints summary + writes GH summary
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
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.total_cost = 0.0
        self.image_count = 0

    # ---- Logging methods ----

    def log_event(self, message):
        """Log a key event with timestamp."""
        timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S UTC")
        self.events.append(f"[{timestamp}] {message}")
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
            "label": f"Image Generation ({'✅' if success else '❌ failed'})",
            "model": "grok-imagine-image",
            "input_tokens": 0,
            "output_tokens": 0,
            "cost": cost,
        })

    def log_error(self, message):
        """Log an error event."""
        timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S UTC")
        entry = f"[{timestamp}] ❌ {message}"
        self.events.append(entry)
        self.errors.append(entry)
        print(f"❌ TRACKER: {message}")

    # ---- Utilities ----

    @staticmethod
    def estimate_tokens(text):
        """Rough token estimate: ~4 chars per token for English text."""
        if not text:
            return 0
        return max(1, len(str(text)) // 4)

    # ---- Report generation ----

    def get_report(self):
        """Generate a structured report dict."""
        end_time = datetime.datetime.now(datetime.timezone.utc)
        return {
            "bot": self.bot_name,
            "date": self.start_time.strftime("%Y-%m-%d"),
            "start_time": self.start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "duration_seconds": round((end_time - self.start_time).total_seconds(), 1),
            "events": self.events,
            "api_calls": self.api_calls,
            "errors": self.errors,
            "totals": {
                "input_tokens": self.total_input_tokens,
                "output_tokens": self.total_output_tokens,
                "images_generated": self.image_count,
                "estimated_cost_usd": round(self.total_cost, 4),
            },
        }

    def save_report(self):
        """Append this run's report to data/cost_log.json."""
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

            log.append(self.get_report())
            log = log[-200:]  # Keep last ~200 entries

            with open(log_path, "w") as f:
                json.dump(log, f, indent=2)

            print(f"💾 Report saved to data/cost_log.json")
        except Exception as e:
            print(f"⚠️  Failed to save cost report: {e}")

    def print_summary(self):
        """Print a clean summary to console (visible in GitHub Actions logs)."""
        report = self.get_report()

        print("\n" + "=" * 65)
        print(f"📊 {self.bot_name.upper()} BOT — RUN REPORT")
        print(f"   Date: {report['date']}")
        print(f"   Duration: {report['duration_seconds']}s")
        print("=" * 65)

        print("\n📋 Event Log:")
        for event in self.events:
            print(f"   {event}")

        if self.api_calls:
            print(f"\n💰 API Cost Breakdown:")
            print(f"   {'Call':<32} {'In':>8} {'Out':>8} {'Cost':>10}")
            print(f"   {'-'*32} {'-'*8} {'-'*8} {'-'*10}")
            for call in self.api_calls:
                in_str = f"{call['input_tokens']:,}" if call['input_tokens'] else "—"
                out_str = f"{call['output_tokens']:,}" if call['output_tokens'] else "—"
                print(f"   {call['label']:<32} {in_str:>8} {out_str:>8} ${call['cost']:>8.4f}")
            print(f"   {'-'*32} {'-'*8} {'-'*8} {'-'*10}")
            print(f"   {'TOTAL':<32} {self.total_input_tokens:>8,} {self.total_output_tokens:>8,} ${self.total_cost:>8.4f}")

        if self.errors:
            print(f"\n⚠️  Errors ({len(self.errors)}):")
            for err in self.errors:
                print(f"   {err}")

        status = "✅ No errors" if not self.errors else f"⚠️  {len(self.errors)} error(s)"
        print(f"\n💵 Estimated total cost this run: ${self.total_cost:.4f}")
        print(f"   Status: {status}")
        print("=" * 65)

    def write_github_summary(self):
        """Write a markdown summary to GitHub Actions step summary (shows in the Actions UI)."""
        summary_file = os.getenv("GITHUB_STEP_SUMMARY")
        if not summary_file:
            return  # Not running in GitHub Actions

        try:
            report = self.get_report()
            lines = [
                f"## 📊 {self.bot_name.title()} Bot Report — {report['date']}",
                f"**Duration:** {report['duration_seconds']}s",
                "",
                "### 📋 Event Log",
            ]
            for event in self.events:
                lines.append(f"- {event}")

            if self.api_calls:
                lines.extend([
                    "",
                    "### 💰 Cost Breakdown",
                    "| Call | Input Tokens | Output Tokens | Est. Cost |",
                    "|------|-------------|--------------|-----------|",
                ])
                for call in self.api_calls:
                    in_str = f"{call['input_tokens']:,}" if call['input_tokens'] else "—"
                    out_str = f"{call['output_tokens']:,}" if call['output_tokens'] else "—"
                    lines.append(f"| {call['label']} | {in_str} | {out_str} | ${call['cost']:.4f} |")
                lines.append(f"| **TOTAL** | **{self.total_input_tokens:,}** | **{self.total_output_tokens:,}** | **${self.total_cost:.4f}** |")

            if self.errors:
                lines.extend([
                    "",
                    f"### ⚠️ Errors ({len(self.errors)})",
                ])
                for err in self.errors:
                    lines.append(f"- {err}")

            status_emoji = "✅" if not self.errors else "⚠️"
            lines.extend([
                "",
                f"### {status_emoji} Total Estimated Cost: **${self.total_cost:.4f}**",
                "",
                "*Prices estimated: grok-4 @ $3/1M input, $15/1M output · images @ $0.07/ea*",
            ])

            with open(summary_file, "a") as f:
                f.write("\n".join(lines) + "\n\n")
        except Exception as e:
            print(f"⚠️  Failed to write GitHub Actions summary: {e}")

    def finish(self):
        """Call at the end of a run — saves report, prints summary, writes GH Actions summary."""
        self.log_event(f"{self.bot_name.title()} bot finished")
        self.save_report()
        self.print_summary()
        self.write_github_summary()
