import { Octokit } from "@octokit/rest";

export interface GitHubAppOptions {
  installationId: number;
  privateKey?: string; // Used in real implementation for JWT auth
}

export class SibylGitHubApp {
  private octokit: Octokit;

  constructor(options: GitHubAppOptions) {
    // In a real implementation, we would use @octokit/auth-app to authenticate
    // as a GitHub App installation. For v1, we mock it with a PAT if provided,
    // or just run in dry-run mode.
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN || "mock-token",
    });
  }

  /**
   * Creates or updates a GitHub Check Run (PR Check).
   */
  public async createCheckRun(
    owner: string,
    repo: string,
    headSha: string,
    status: "queued" | "in_progress" | "completed",
    conclusion?: "success" | "failure" | "neutral" | "skipped",
    failures: number = 0
  ) {
    console.log(`[SibylGitHubApp] Creating Check Run on ${owner}/${repo}@${headSha}...`);
    
    // MOCK EXECUTION to prevent actual network calls failing without real creds
    if (process.env.NODE_ENV === "test" || !process.env.GITHUB_TOKEN) {
      console.log(`[SibylGitHubApp] (Mock) Check Run updated: ${status} / ${conclusion}`);
      return;
    }

    try {
      await this.octokit.checks.create({
        owner,
        repo,
        name: "Sibyl Chaos Engine",
        head_sha: headSha,
        status,
        conclusion,
        output: {
          title: conclusion === "success" ? "All Invariants Passed" : `${failures} Invariants Failed`,
          summary: "Sibyl executed background chaos simulations against your code changes.",
        }
      });
    } catch (err: any) {
      console.error(`[SibylGitHubApp] Failed to create check run: ${err.message}`);
    }
  }

  /**
   * Posts a detailed Markdown comment on the PR detailing the failures.
   */
  public async postPRComment(
    owner: string,
    repo: string,
    prNumber: number,
    failures: number,
    runId: string
  ) {
    console.log(`[SibylGitHubApp] Posting PR Comment on ${owner}/${repo}#${prNumber}...`);
    
    // MOCK EXECUTION
    if (process.env.NODE_ENV === "test" || !process.env.GITHUB_TOKEN) {
      console.log(`[SibylGitHubApp] (Mock) PR Comment posted.`);
      return;
    }

    try {
      const dashboardUrl = `https://app.sibyl.dev/projects/${owner}-${repo}/runs/${runId}`;
      const body = `## ⚠️ Sibyl Chaos Engine Discovered Vulnerabilities

During automated chaos engineering simulations, Sibyl detected that **${failures}** invariants were violated by the changes in this PR.

Please review the event timeline and AI root-cause analysis on the dashboard to resolve these issues before merging.

[👉 **View Run Details & Event Timeline**](${dashboardUrl})
      `;

      await this.octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body
      });
    } catch (err: any) {
      console.error(`[SibylGitHubApp] Failed to post PR comment: ${err.message}`);
    }
  }
}
