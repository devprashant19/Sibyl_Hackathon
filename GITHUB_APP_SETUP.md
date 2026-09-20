# Sibyl GitHub App Integration

Sibyl integrates seamlessly with your existing Pull Request workflow via a native GitHub App. This allows Sibyl to run background chaos simulations against your code changes securely in your own CI environment, and report the results directly into your PRs without requiring source code access.

## Architecture & Security

**Trust Boundary:** The Sibyl GitHub App **does not** execute code or pull your repository. You run the `sibyl ci` command inside your own GitHub Actions runners. The CLI then uploads the *results* to the Sibyl Cloud API, which authenticates via the GitHub App to post the Check Run status and detailed PR comments. 

This guarantees your source code and internal environment variables never leave your secure perimeter.

## Setup Instructions

### 1. Create the GitHub App
1. Go to your GitHub Organization Settings -> **Developer Settings** -> **GitHub Apps**.
2. Click **New GitHub App**.
3. Name it "Sibyl Chaos Engine" (or similar).
4. Set the Homepage URL to `https://sibyl.dev`.

### 2. Configure Webhooks
The webhook is used to notify the Sibyl API when a developer installs the App on a new repository.
1. Check **Active**.
2. Set the Webhook URL to `https://api.sibyl.dev/v1/webhooks/github`.
3. Provide a Webhook Secret (and save this in your Sibyl Dashboard settings).

### 3. Grant Permissions
Sibyl requires the absolute minimum permissions needed to post results back to your PRs.
- **Checks**: `Read & Write` (To post the pass/fail status).
- **Pull Requests**: `Read & Write` (To post the AI root cause analysis comment).
- **Metadata**: `Read-only` (Mandatory for all GitHub Apps).

### 4. Subscribe to Events
Under the "Subscribe to events" section, check the following:
- `Check run`
- `Pull request`

### 5. Generate Private Key
1. Save your App.
2. Under the "General" settings for your new App, click **Generate a private key**.
3. Download the `.pem` file. 
4. Upload this `.pem` file and your App ID to your Project Settings in the Sibyl Dashboard.

## Enforcing Reliability (Required Checks)

To enforce that code cannot be merged unless it passes all Sibyl chaos simulations:

1. Go to your Repository Settings -> **Branches**.
2. Edit your branch protection rules for `main`.
3. Enable **Require status checks to pass before merging**.
4. Search for `Sibyl Chaos Engine` and select it as a required check.

If Sibyl detects a vulnerability during your CI pipeline, the PR will be blocked, and the AI Explainer Agent will automatically post a detailed root-cause analysis in the PR comments so your team can fix it immediately.
