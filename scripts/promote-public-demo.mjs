import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const projectIdPattern = /^prj_[A-Za-z0-9]+$/;
const teamIdPattern = /^team_[A-Za-z0-9]+$/;
const deploymentIdPattern = /^dpl_[A-Za-z0-9]+$/;
const jobStatuses = new Set([
  "pending",
  "in-progress",
  "failed",
  "skipped",
  "succeeded",
]);
const uncertainOutcome =
  " The promotion outcome is uncertain and may still complete; verify the public alias. No cancellation was requested.";

// Only these locally written messages may reach CI logs; API bodies and thrown
// transport errors can contain credentials or other private account information.
class PromotionError extends Error {}

function requireValue(condition, message) {
  if (!condition) throw new PromotionError(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readAliasRequest(value) {
  if (value === undefined || value === null) return null;
  requireValue(
    isRecord(value) &&
      deploymentIdPattern.test(value.toDeploymentId) &&
      jobStatuses.has(value.jobStatus) &&
      ["promote", "rollback"].includes(value.type) &&
      typeof value.requestedAt === "number" &&
      Number.isFinite(value.requestedAt),
    "Vercel returned malformed promotion status.",
  );
  return value;
}

/** Promote only the verified production deployment, then confirm its alias job. */
export async function promotePublicDemo(
  stagedUrl,
  expectedCommit,
  {
    token,
    projectId,
    teamId,
    fetchImpl = fetch,
    wait = delay,
    now = Date.now,
    timeoutMs = 300_000,
  } = {},
) {
  let promotionAttempted = false;
  let terminalFailure = false;
  try {
    let staged;
    try {
      staged = new URL(stagedUrl);
    } catch {
      throw new PromotionError("Expected an HTTPS Vercel deployment origin.");
    }
    requireValue(
      staged.protocol === "https:" &&
        !staged.username &&
        !staged.password &&
        !staged.port &&
        staged.pathname === "/" &&
        !staged.search &&
        !staged.hash &&
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(
          staged.hostname,
        ),
      "Expected an HTTPS Vercel deployment origin.",
    );
    requireValue(
      typeof expectedCommit === "string" &&
        /^[a-f0-9]{40}$/i.test(expectedCommit),
      "Expected a full 40-character Git SHA.",
    );
    requireValue(
      typeof token === "string" && token.length > 0 && !/\s/.test(token),
      "A nonempty VERCEL_TOKEN is required.",
    );
    requireValue(
      typeof projectId === "string" && projectIdPattern.test(projectId),
      "A valid VERCEL_PROJECT_ID is required.",
    );
    requireValue(
      typeof teamId === "string" && teamIdPattern.test(teamId),
      "A valid VERCEL_ORG_ID is required.",
    );
    requireValue(
      Number.isFinite(timeoutMs) && timeoutMs > 0,
      "A positive promotion timeout is required.",
    );
    const deadline = now() + timeoutMs;

    async function request(pathname, method = "GET") {
      const remaining = deadline - now();
      requireValue(
        remaining > 0,
        "Timed out waiting for promotion confirmation.",
      );
      const url = new URL(pathname, "https://api.vercel.com");
      url.searchParams.set("teamId", teamId);
      let response;
      if (method === "POST") promotionAttempted = true;
      try {
        response = await fetchImpl(url.href, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(Math.min(30_000, Math.ceil(remaining))),
        });
      } catch {
        throw new PromotionError("Vercel API request failed.");
      }
      requireValue(
        typeof response?.status === "number",
        "Vercel returned a malformed HTTP response.",
      );
      requireValue(
        (method === "POST" ? [201, 202] : [200]).includes(response.status),
        `Vercel API returned HTTP ${response.status}.`,
      );
      requireValue(
        !response.url || response.url === url.href,
        "Vercel API returned an unexpected response URL.",
      );
      if (method === "POST") return;
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new PromotionError("Vercel returned malformed JSON.");
      }
      requireValue(
        isRecord(payload),
        "Vercel returned a malformed response object.",
      );
      return payload;
    }

    const deployment = await request(`/v13/deployments/${staged.hostname}`);
    requireValue(
      deploymentIdPattern.test(deployment.id) &&
        deployment.url === staged.hostname &&
        deployment.readyState === "READY" &&
        deployment.target === "production",
      "The staged deployment is not a ready production deployment at the expected URL.",
    );
    requireValue(
      (deployment.projectId ?? deployment.project?.id) === projectId &&
        (deployment.projectId === undefined ||
          deployment.projectId === projectId) &&
        (deployment.project?.id === undefined ||
          deployment.project.id === projectId),
      "The staged deployment belongs to a different project.",
    );
    requireValue(
      deployment.meta?.githubCommitSha === expectedCommit.toLowerCase(),
      "The staged deployment commit does not match the expected commit.",
    );

    async function readProject() {
      const project = await request(
        `/v9/projects/${projectId}?rollbackInfo=true`,
      );
      requireValue(
        project.id === projectId && project.accountId === teamId,
        "Vercel did not return the expected project and account.",
      );
      return readAliasRequest(project.lastAliasRequest);
    }
    const previousRequest = await readProject();
    requireValue(
      !previousRequest ||
        !["pending", "in-progress"].includes(previousRequest.jobStatus),
      "The project already has a pending promotion or rollback.",
    );
    await request(
      `/v10/projects/${projectId}/promote/${deployment.id}`,
      "POST",
    );

    while (now() < deadline) {
      const current = await readProject();
      // An earlier successful job for the same deployment cannot confirm this
      // request. Wait for the API to publish the newly requested alias job.
      if (
        current?.toDeploymentId === deployment.id &&
        current.type === "promote" &&
        (!previousRequest || current.requestedAt > previousRequest.requestedAt)
      ) {
        if (current.jobStatus === "succeeded") {
          return {
            id: deployment.id,
            url: staged.origin,
            commit: expectedCommit.toLowerCase(),
          };
        }
        if (["failed", "skipped"].includes(current.jobStatus)) {
          terminalFailure = true;
          throw new PromotionError(
            `The promotion job ${current.jobStatus}; verify the public alias.`,
          );
        }
      }
      const remaining = deadline - now();
      if (remaining <= 0) break;
      await wait(Math.min(1_000, remaining));
    }
    throw new PromotionError("Timed out waiting for promotion confirmation.");
  } catch (error) {
    const message =
      error instanceof PromotionError
        ? error.message
        : "Promotion could not be verified.";
    throw new PromotionError(
      message +
        (promotionAttempted && !terminalFailure ? uncertainOutcome : ""),
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    requireValue(
      process.argv.length === 4,
      "Usage: node scripts/promote-public-demo.mjs <https-url> <40hex-sha>",
    );
    const result = await promotePublicDemo(process.argv[2], process.argv[3], {
      token: process.env.VERCEL_TOKEN,
      projectId: process.env.VERCEL_PROJECT_ID,
      teamId: process.env.VERCEL_ORG_ID,
    });
    console.log(
      `Confirmed public demo promotion ${result.id} at ${result.commit}.`,
    );
  } catch (error) {
    console.error(
      `Public demo promotion failed: ${error instanceof PromotionError ? error.message : "Promotion could not be verified."}`,
    );
    process.exitCode = 1;
  }
}
