from github import Github
import os
import json
from datetime import datetime, timedelta

# --- Configuration ---
GITHUB_TOKEN = os.getenv("GITHUB_MCP_PAT")
REPO_OWNER = "IsmaelMartinez"
REPO_NAME = "teams-for-linux"

# Fetch issues from the last year
SINCE_DATE = datetime.now() - timedelta(days=365)

OUTPUT_DIR = "data/github_issues"

# --- Main Logic ---
def fetch_and_save_github_issues(owner, repo_name, since_date, output_dir, token):
    if not token:
        print("Error: GITHUB_MCP_PAT environment variable not set.")
        return

    g = Github(token)

    try:
        repo = g.get_user(owner).get_repo(repo_name)
        print(f"Fetching issues for {owner}/{repo_name} since {since_date.strftime('%Y-%m-%d')}...")

        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)

        # Fetch all issues (open and closed) since the specified date
        # PyGithub handles pagination automatically
        issues = repo.get_issues(state='all', since=since_date)

        issue_count = 0
        for issue in issues:
            # GitHub's API considers pull requests as issues internally.
            # We want to include both for a comprehensive troubleshooting guide.
            # if issue.pull_request is None: # Uncomment this line if you only want "true" issues
            issue_data = {
                "id": issue.id,
                "number": issue.number,
                "title": issue.title,
                "body": issue.body,
                "state": issue.state,
                "created_at": issue.created_at.isoformat(),
                "updated_at": issue.updated_at.isoformat(),
                "closed_at": issue.closed_at.isoformat() if issue.closed_at else None,
                "user": issue.user.login,
                "assignee": issue.assignee.login if issue.assignee else None,
                "labels": [label.name for label in issue.labels],
                "comments_count": issue.comments,
                "html_url": issue.html_url,
                "is_pull_request": True if issue.pull_request else False
            }

            file_path = os.path.join(output_dir, f"issue_{issue.number}.json")
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(issue_data, f, indent=4, ensure_ascii=False)
            issue_count += 1
            print(f"  Saved issue #{issue.number}: {issue.title}")

        print(f"\nSuccessfully fetched and saved {issue_count} issues to {output_dir}.")

    except Exception as e:
        print(f"An error occurred: {e}")
        print("Please ensure your GITHUB_MCP_PAT is valid and has the necessary permissions (repo scope).")

if __name__ == "__main__":
    fetch_and_save_github_issues(REPO_OWNER, REPO_NAME, SINCE_DATE, OUTPUT_DIR, GITHUB_TOKEN)
