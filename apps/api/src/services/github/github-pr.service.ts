import { prisma } from "../../lib/prisma";
import { vfsService } from "../vfs.service";
import { eventService } from "../event.service";
import { SseEvents } from "@nebula/shared";
import { githubFetch, GithubError } from "./github-api";
import { githubRepositoryService } from "./github-repository.service";
import { bugbotService } from "../bugbot.service";

export class GithubPrService {
  async createPullRequest(
    projectId: string,
    userId: string,
    input: { title?: string; body?: string } = {}
  ) {
    const { repo, token } =
      await githubRepositoryService.assertRepositoryOwnership(projectId, userId);

    const [owner, repoName] = repo.repositoryName.split("/");
    const baseBranch = repo.defaultBranch;
    const headBranch = `nebula/changeset-${Date.now().toString(36)}`;

    const files = await vfsService.snapshot(projectId, userId);
    if (files.length === 0) {
      throw new GithubError("NO_FILES", "No files to export", 400);
    }

    eventService.publish(projectId, SseEvents.GITHUB_SYNC_STARTED, {
      message: `Opening PR from ${headBranch}…`,
    });

    const ref = await githubFetch<{ object: { sha: string } }>(
      `/repos/${owner}/${repoName}/git/ref/heads/${baseBranch}`,
      token
    );
    const parentSha = ref.object.sha;

    await githubFetch(
      `/repos/${owner}/${repoName}/git/refs`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          ref: `refs/heads/${headBranch}`,
          sha: parentSha,
        }),
      }
    );

    const treeItems: Array<{
      path: string;
      mode: string;
      type: string;
      sha: string;
    }> = [];

    for (const file of files) {
      const blob = await githubFetch<{ sha: string }>(
        `/repos/${owner}/${repoName}/git/blobs`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            content: file.content,
            encoding: "utf-8",
          }),
        }
      );
      treeItems.push({
        path: file.path.replace(/\\/g, "/"),
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      });
    }

    const tree = await githubFetch<{ sha: string }>(
      `/repos/${owner}/${repoName}/git/trees`,
      token,
      {
        method: "POST",
        body: JSON.stringify({ tree: treeItems }),
      }
    );

    const commit = await githubFetch<{ sha: string }>(
      `/repos/${owner}/${repoName}/git/commits`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          message: input.title ?? "Nebula changeset",
          tree: tree.sha,
          parents: [parentSha],
        }),
      }
    );

    await githubFetch(
      `/repos/${owner}/${repoName}/git/refs/heads/${headBranch}`,
      token,
      {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: true }),
      }
    );

    const pr = await githubFetch<{ html_url: string; number: number }>(
      `/repos/${owner}/${repoName}/pulls`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          title: input.title ?? "Nebula changeset review",
          body:
            input.body ??
            "Automated pull request from Nebula workspace changes.",
          head: headBranch,
          base: baseBranch,
        }),
      }
    );

    await prisma.githubRepository.update({
      where: { projectId },
      data: { lastCommitSha: commit.sha },
    });

    eventService.publish(projectId, SseEvents.GITHUB_SYNC_COMPLETED, {
      pullRequestUrl: pr.html_url,
      pullRequestNumber: pr.number,
      branch: headBranch,
    });

    // Bugbot PR review (env-gated): post findings as a PR comment.
    if (bugbotService.isEnabled()) {
      setImmediate(() => {
        void (async () => {
          const review = await bugbotService.generateReview(
            files.slice(0, 10).map((f) => ({
              path: f.path,
              previousContent: "",
              newContent: f.content,
            }))
          );
          if (!review) return;
          await githubFetch(
            `/repos/${owner}/${repoName}/issues/${pr.number}/comments`,
            token,
            {
              method: "POST",
              body: JSON.stringify({
                body: `## 🤖 Bugbot review\n\n${review}`,
              }),
            }
          ).catch(() => undefined);
        })();
      });
    }

    return {
      pullRequestUrl: pr.html_url,
      pullRequestNumber: pr.number,
      branch: headBranch,
    };
  }
}

export const githubPrService = new GithubPrService();
