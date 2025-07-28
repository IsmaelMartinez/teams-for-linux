import os
import json
from collections import defaultdict

# --- Configuration ---
ISSUES_DIR = "data/github_issues"

# Define categories and associated keywords (case-insensitive)
CATEGORIES = {
    "Installation/Update Issues": [
        "install", "setup", "package", "deb", "rpm", "flatpak", "snap", "aur",
        "ubuntu", "fedora", "debian", "arch", "update", "upgrade", "version",
        "not starting", "crash on startup", "cannot execute binary", "openpgp",
        "gtk", "libdbus", "appimage"
    ],
    "Login/Authentication Issues": [
        "login", "sign in", "authenticate", "2fa", "mfa", "account", "session",
        "token", "godaddy", "intune", "logout", "re-authentication", "credentials",
        "sso", "hardware security key", "passkey"
    ],
    "Screen Sharing Issues": [
        "screen share", "blurry", "share screen", "pipewire", "wayland", "x11",
        "green bar", "low resolution", "window sharing", "desktop sharing",
        "screen capture", "grimblast"
    ],
    "Audio/Video Issues": [
        "audio", "mic", "microphone", "camera", "video", "volume", "sound",
        "gain control", "mute", "unmute", "device settings", "no video", "no audio",
        "ringtone"
    ],
    "Performance/Stability Issues": [
        "slow", "lag", "crash", "freeze", "hang", "not responding", "core dump",
        "memory", "cpu usage", "unexpectedly closes", "render-process-gone"
    ],
    "Notification Issues": [
        "notification", "toast", "badge", "system tray", "systray", "tray icon",
        "pop up", "alert"
    ],
    "UI/UX Issues": [
        "window", "resize", "blurry font", "dark mode", "icon", "tray icon",
        "menu", "context menu", "emoji", "font", "scaling", "taskbar",
        "window decorations", "layout", "display"
    ],
    "Link Handling Issues": [
        "link", "url", "deep link", "open in browser", "meetup-join", "msteams://",
        "external link", "presenter link"
    ],
    "File/Content Issues": [
        "file upload", "file download", "drag and drop", "chat history",
        "code block", "onedrive", "attachments", "copy paste", "timestamp"
    ],
    "Other/Miscellaneous": [] # Catch-all for issues not fitting other categories
}

# Keywords that often indicate a solution or workaround
SOLUTION_KEYWORDS = [
    "fix", "solution", "workaround", "resolved by", "try this", "steps to resolve",
    "config option", "setting", "update to", "downgrade to", "install", "enable",
    "disable", "revert", "patch", "script", "command", "flag", "changed to"
]

def analyze_issues(issues_dir):
    categorized_issues = defaultdict(list)
    issue_details = {}

    for filename in os.listdir(issues_dir):
        if filename.endswith(".json"):
            filepath = os.path.join(issues_dir, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                issue = json.load(f)

            issue_id = issue["number"]
            issue_details[issue_id] = issue

            text_content = (issue["title"] + " " + (issue["body"] or "")).lower()
            found_categories = set()

            for category, keywords in CATEGORIES.items():
                for keyword in keywords:
                    if keyword.lower() in text_content:
                        found_categories.add(category)
                        break
            
            if not found_categories:
                found_categories.add("Other/Miscellaneous")

            for category in found_categories:
                categorized_issues[category].append(issue_id)

    # Now, analyze for solutions within the categorized issues
    issues_with_solutions = defaultdict(list)
    for category, issue_ids in categorized_issues.items():
        for issue_id in issue_ids:
            issue = issue_details[issue_id]
            solution_found = False
            
            # Check issue body for solution keywords
            if issue["body"]:
                for keyword in SOLUTION_KEYWORDS:
                    if keyword.lower() in issue["body"].lower():
                        issues_with_solutions[category].append(issue_id)
                        solution_found = True
                        break
            
            # If no solution found in body, check comments (requires fetching comments, which we don't have in the initial JSONs)
            # For now, we'll just note if comments exist and suggest manual review.
            if not solution_found and issue["comments_count"] > 0:
                # This is a placeholder. Actual comment fetching would go here.
                # For this task, we'll just mark it as potentially having a solution in comments.
                pass # We'll handle this in the next step if needed

    return categorized_issues, issues_with_solutions, issue_details

def generate_report(categorized_issues, issues_with_solutions, issue_details):
    report = "# GitHub Issues Analysis Report (Last Year)\n\n"
    report += "This report summarizes recurring themes and potential solutions found in GitHub issues from the last year.\n\n"
    report += "## Summary by Category\n\n"

    for category, issue_ids in sorted(categorized_issues.items()):
        report += f"### {category} ({len(issue_ids)} issues)\n\n"
        if category in issues_with_solutions and issues_with_solutions[category]:
            report += "**Potential Solutions/Workarounds Identified:**\n"
            for issue_id in issues_with_solutions[category]:
                issue = issue_details[issue_id]
                report += f"*   [#{issue_id}] {issue["title"]} ([Link]({issue["html_url"]}))\n"
                # Add a snippet of the body if it contains a solution keyword
                # This part would need more sophisticated NLP for accurate extraction
                # For now, just indicate that a solution might be in the body.
                report += f"    (Solution likely in issue body or comments. Manual review recommended.)\n"
        else:
            report += "No explicit solutions/workarounds identified in issue bodies for this category.\n"
        report += "\n"

    report += "## Issues by Category (Detailed List)\n\n"
    for category, issue_ids in sorted(categorized_issues.items()):
        report += f"### {category}\n\n"
        for issue_id in issue_ids:
            issue = issue_details[issue_id]
            report += f"*   [#{issue_id}] {issue["title"]} (State: {issue["state"]}) ([Link]({issue["html_url"]}))\n"
            if issue["comments_count"] > 0:
                report += f"    (Comments: {issue["comments_count"]})\n"
        report += "\n"

    return report

if __name__ == "__main__":
    categorized_issues, issues_with_solutions, issue_details = analyze_issues(ISSUES_DIR)
    report_content = generate_report(categorized_issues, issues_with_solutions, issue_details)

    output_filepath = "docs/github_issues_analysis_report.md"
    with open(output_filepath, 'w', encoding='utf-8') as f:
        f.write(report_content)
    print(f"Analysis report generated: {output_filepath}")
