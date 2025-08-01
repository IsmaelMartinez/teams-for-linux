# GitHub Token Setup Guide

This document provides detailed instructions for setting up a GitHub Personal Access Token with the minimum required permissions for the Teams for Linux knowledge base system.

## Overview

The knowledge base extraction system uses the GitHub REST API to read issues from public repositories. While the system can work without authentication, a GitHub token is **strongly recommended** for production use.

## Why You Need a GitHub Token

| Scenario | Rate Limit | Practical Impact |
|----------|------------|------------------|
| **No Authentication** | 60 requests/hour | ⚠️ Can only extract ~600 issues before throttling |
| **With Personal Access Token** | 5,000 requests/hour | ✅ Can extract all 1000+ issues smoothly |

**Our repository has 1000+ issues**, so authentication is essential for complete extraction.

## Required API Endpoints

The extraction system only uses **public, read-only** endpoints:

| Endpoint | Purpose | Permission Required |
|----------|---------|-------------------|
| `GET /repos/{owner}/{repo}/issues` | Read issues and pull requests | `public_repo` (read) |

**No write permissions needed** - this is a read-only system.

## Token Permissions Setup

### Step 1: Create Personal Access Token

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Click **"Tokens (classic)"** in the left sidebar
3. Click **"Generate new token"** → **"Generate new token (classic)"**

### Step 2: Configure Token Settings

**Token Configuration:**

```text
Name: Teams for Linux Knowledge Base
Description: Read-only access for knowledge base generation
Expiration: 90 days (recommended for security)
```

### Step 3: Select Minimum Permissions

**✅ Required Permissions:**

- `public_repo` - Access public repositories (read-only)

**❌ NOT Required:**

- `repo` (full repository access) - ❌ Too broad
- `write:*` permissions - ❌ No write access needed
- `admin:*` permissions - ❌ No admin access needed
- `user:*` permissions - ❌ No user data access needed
- `gist` - ❌ Not using gists
- `notifications` - ❌ Not accessing notifications

### Step 4: Generate and Save Token

1. Click **"Generate token"**
2. **Copy the token immediately** (starts with `ghp_`)
3. Store securely - you won't see it again

## Security Best Practices

### ✅ Secure Token Management

```bash
# ✅ Good: Use environment variables
export GITHUB_TOKEN=ghp_your_token_here

# ✅ Good: Add to shell profile for persistence
echo 'export GITHUB_TOKEN=ghp_your_token_here' >> ~/.bashrc

# ❌ Bad: Never commit tokens to code
# GITHUB_TOKEN=ghp_your_token_here  # Don't do this in files!
```

### 🔒 Additional Security Measures

1. **Regular Rotation**: Rotate tokens every 90 days
2. **Scope Limitation**: Only use `public_repo` scope
3. **Environment Variables**: Never hardcode tokens in scripts
4. **Access Review**: Regularly review token usage in GitHub settings
5. **Revoke Unused**: Delete tokens that are no longer needed

## Verification and Testing

### Test Token Setup

```bash
# 1. Verify token is set
echo $GITHUB_TOKEN  # Should show ghp_...

# 2. Test API access
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/rate_limit

# 3. Test with extraction script
node scripts/knowledge-base/extract-issues.js --help
```

### Expected Results

**With Token:**

```json
{
  "rate": {
    "limit": 5000,
    "remaining": 4999,
    "reset": 1627234567
  }
}
```

**Without Token:**

```json
{
  "rate": {
    "limit": 60,
    "remaining": 59,
    "reset": 1627234567
  }
}
```

## Troubleshooting

### Common Issues

#### "Bad credentials" Error

```bash
❌ Error: GitHub API error: 401 - Bad credentials
```

- **Solution**: Check token is correctly set and hasn't expired

#### Still Getting Rate Limited with Token

```bash
❌ Error: Rate limit exceeded. Resets at...
```

- **Solution**: Verify token has `public_repo` permission
- **Check**: Run `curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/rate_limit`

#### Token Not Found

```bash
❌ Error: GITHUB_TOKEN environment variable not set
```

- **Solution**: Set environment variable: `export GITHUB_TOKEN=ghp_your_token`

### Validation Commands

```bash
# Check rate limit status
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/rate_limit | jq '.rate'

# Test repository access
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/IsmaelMartinez/teams-for-linux | jq '.name'

# Full extraction test (limited)
GITHUB_TOKEN=$GITHUB_TOKEN node scripts/knowledge-base/extract-issues.js
```

## Token Lifecycle Management

### Regular Maintenance

**Monthly:**

- Check token expiration date
- Review usage in GitHub settings

**Quarterly:**

- Rotate token for security
- Update documentation if needed

**Before Expiration:**

1. Generate new token with same permissions
2. Update environment variable
3. Test with extraction script
4. Revoke old token

### Team Usage

For multiple contributors:

1. **Each contributor should create their own token**
2. **Never share tokens between team members**
3. **Document the setup process for new contributors**
4. **Use organization tokens for CI/CD if needed**

## Integration with Extraction Script

The extraction script automatically detects and uses the token:

```javascript
// Automatic token detection
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || null;

// Automatic authentication headers
if (GITHUB_TOKEN) {
  options.headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
}
```

**No code changes needed** - just set the environment variable.

## References

- [GitHub Personal Access Tokens Documentation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [GitHub API Rate Limiting](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting)
- [GitHub API Authentication](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#authentication)

---

> [!TIP]
> **Quick Setup**: `export GITHUB_TOKEN=ghp_your_token` → `node scripts/knowledge-base/extract-issues.js`
