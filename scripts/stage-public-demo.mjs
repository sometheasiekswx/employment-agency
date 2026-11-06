import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPublicDemo } from "./check-public-demo.mjs";

const publicProject = "prj_jW5ss3iNVEOEBwi0fxJL7ymAFeG0";
const publicTeam = "team_QmjRFzULoHfOTipsjFByfxON";
const api = "https://api.vercel.com";

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function parseJson(data, label) {
  try {
    return JSON.parse(data.toString("utf8"));
  } catch {
    throw new Error(`Invalid ${label} JSON`);
  }
}

async function readArtifact(site) {
  const root = path.resolve(site);
  requireValue(
    (await lstat(root)).isDirectory() && !(await lstat(root)).isSymbolicLink(),
    "The public artifact must be a directory without symlinks",
  );
  const canonicalRoot = await realpath(root);
  const files = new Map();
  async function walk(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      requireValue(
        !entry.name.startsWith(".") && !/[\\/:\x00-\x1f]/.test(entry.name),
        "The public artifact contains an unsafe path",
      );
      const filename = path.join(directory, entry.name);
      const relative = path.posix.join(prefix, entry.name);
      const stat = await lstat(filename);
      requireValue(
        !stat.isSymbolicLink(),
        "The public artifact contains a symlink",
      );
      const canonical = await realpath(filename);
      const within = path.relative(canonicalRoot, canonical);
      requireValue(
        within !== ".." &&
          !within.startsWith(`..${path.sep}`) &&
          !path.isAbsolute(within),
        "The public artifact contains a path escape",
      );
      if (stat.isDirectory()) {
        await walk(filename, relative);
      } else {
        requireValue(stat.isFile(), "The public artifact contains a non-file");
        const handle = await open(
          filename,
          constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
        );
        try {
          requireValue(
            (await handle.stat()).isFile(),
            "The public artifact contains a non-file",
          );
          files.set(relative, await handle.readFile());
        } finally {
          await handle.close();
        }
      }
    }
  }
  await walk(canonicalRoot);
  return new Map(
    [...files].sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function validateArtifact(files, expectedCommit) {
  const config = parseJson(files.get("vercel.json"), "static configuration");
  const keys = [
    "$schema",
    "framework",
    "buildCommand",
    "installCommand",
    "trailingSlash",
    "headers",
  ];
  requireValue(
    config &&
      Object.keys(config).every((key) => keys.includes(key)) &&
      config.framework === null &&
      config.buildCommand === "" &&
      config.installCommand === "" &&
      config.trailingSlash === true,
    "The artifact must use the generated static configuration without functions or rewrites",
  );
  requireValue(
    Array.isArray(config.headers) &&
      config.headers.length === 2 &&
      config.headers[0].source === "/(.*)" &&
      config.headers[1].source === "/release.json" &&
      config.headers.every(
        (rule) =>
          Object.keys(rule).length === 2 &&
          Array.isArray(rule.headers) &&
          rule.headers.every(
            (header) =>
              Object.keys(header).length === 2 &&
              typeof header.key === "string" &&
              typeof header.value === "string" &&
              !/[\r\n]/.test(header.key + header.value),
          ),
      ),
    "The artifact must use the generated security header rules",
  );
  requireValue(
    config.headers[0].headers.length === 3 &&
      config.headers[0].headers.map(({ key }) => key).join(",") ===
        "Content-Security-Policy,X-Content-Type-Options,Referrer-Policy" &&
      config.headers[0].headers[2].value ===
        "strict-origin-when-cross-origin" &&
      JSON.stringify(config.headers[1].headers) ===
        JSON.stringify([{ key: "Cache-Control", value: "no-cache" }]),
    "The artifact must use the generated security headers",
  );
  // Reuse the release verifier against the captured bytes. No page executes and
  // no network request is made while validating the artifact.
  await verifyPublicDemo("https://artifact.example.test", expectedCommit, {
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname;
      const filename = pathname.endsWith("/")
        ? `${pathname}index.html`
        : pathname;
      const bytes = files.get(filename.slice(1));
      const headers = Object.fromEntries(
        config.headers[0].headers.map(({ key, value }) => [key, value]),
      );
      headers["Content-Type"] = pathname.endsWith(".json")
        ? "application/json"
        : pathname.endsWith(".pdf")
          ? "application/pdf"
          : "text/html";
      return new Response(bytes ?? null, {
        status: bytes ? 200 : 404,
        headers,
      });
    },
  });
  const fixture = parseJson(files.get("demo/preview.json"), "public fixture");
  requireValue(
    Object.values(fixture.files).every((url) => files.has(url.slice(1))),
    "The public fixture references a missing document asset",
  );
  return config;
}

function deploymentIdentity(deployment, projectId, expectedCommit) {
  requireValue(
    deployment?.projectId === projectId &&
      deployment.target === "production" &&
      deployment.meta?.githubCommitSha === expectedCommit &&
      /^dpl_[A-Za-z0-9]+$/.test(deployment.id ?? ""),
    "Unexpected staged deployment identity or commit",
  );
  requireValue(
    typeof deployment.url === "string" &&
      /^(?:https:\/\/)?[a-z0-9-]+\.vercel\.app$/.test(deployment.url),
    "Unexpected staged deployment URL",
  );
  return {
    id: deployment.id,
    url: new URL(`https://${deployment.url.replace(/^https:\/\//, "")}`).origin,
  };
}

/** Stage only the checked fictional static artifact; never move production domains. */
export async function stagePublicDemo(
  site,
  expectedCommit,
  {
    token,
    projectId,
    teamId,
    fetchImpl = fetch,
    wait = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
    now = Date.now,
    timeoutMs = 300_000,
  } = {},
) {
  requireValue(
    typeof token === "string" && token.length > 0 && !/\s/.test(token),
    "Missing or invalid VERCEL_TOKEN",
  );
  requireValue(
    projectId === publicProject && teamId === publicTeam,
    "Use only the dedicated public demo project and team",
  );
  requireValue(
    typeof expectedCommit === "string" && /^[a-f0-9]{40}$/.test(expectedCommit),
    "Expected commit must be a full lowercase 40-character Git SHA",
  );
  requireValue(
    typeof site === "string" && site.length > 0,
    "A public artifact directory is required",
  );
  requireValue(
    Number.isFinite(timeoutMs) && timeoutMs > 0,
    "The staging timeout must be positive",
  );
  const files = await readArtifact(site);
  const config = await validateArtifact(files, expectedCommit);
  const deadline = now() + timeoutMs;
  function remaining() {
    const milliseconds = deadline - now();
    requireValue(milliseconds > 0, "Vercel staging timed out");
    return milliseconds;
  }
  async function request(endpoint, method = "GET", body) {
    const url = new URL(endpoint, api);
    url.searchParams.set("teamId", teamId);
    let response;
    try {
      response = await fetchImpl(url.href, {
        method,
        redirect: "error",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        signal: AbortSignal.timeout(Math.max(1, Math.min(20_000, remaining()))),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      remaining();
      throw new Error(`Vercel ${method} request failed`);
    }
    requireValue(
      response.ok,
      `Vercel ${method} request failed with HTTP ${response.status}`,
    );
    try {
      return await response.json();
    } catch {
      throw new Error("Vercel returned invalid JSON");
    }
  }
  const project = await request(`/v9/projects/${projectId}`);
  requireValue(
    project?.id === projectId &&
      project.accountId === teamId &&
      /^[a-z0-9-]+$/.test(project.name ?? ""),
    "Unexpected Vercel project or team",
  );
  requireValue(
    !["pending", "in-progress"].includes(project.lastAliasRequest?.jobStatus),
    "A previous Vercel promotion is still pending",
  );
  // Match the official CLI's deployment payload without its owner lookup or
  // unscoped file-upload calls. A create request is never automatically retried.
  const created = await request(
    "/v13/deployments?skipAutoDetectionConfirmation=1",
    "POST",
    {
      name: project.name,
      project: projectId,
      target: "production",
      version: 2,
      autoAssignCustomDomains: false,
      projectSettings: {
        framework: null,
        buildCommand: "",
        installCommand: "",
        outputDirectory: ".",
        rootDirectory: null,
      },
      headers: config.headers,
      trailingSlash: config.trailingSlash,
      meta: { githubCommitSha: expectedCommit, githubCommitRef: "main" },
      files: [...files].map(([file, data]) => ({
        file,
        data: data.toString("base64"),
        encoding: "base64",
      })),
    },
  );
  const identity = deploymentIdentity(created, projectId, expectedCommit);
  while (true) {
    const deployment = await request(`/v13/deployments/${identity.id}`);
    const current = deploymentIdentity(deployment, projectId, expectedCommit);
    requireValue(
      current.id === identity.id && current.url === identity.url,
      "The staged deployment identity changed",
    );
    if (deployment.readyState === "READY") return identity;
    requireValue(
      !["ERROR", "CANCELED"].includes(deployment.readyState),
      `Vercel deployment ${deployment.readyState === "CANCELED" ? "was canceled" : "failed"}`,
    );
    requireValue(
      ["QUEUED", "INITIALIZING", "ANALYZING", "BUILDING", "DEPLOYING"].includes(
        deployment.readyState,
      ),
      "Unexpected Vercel deployment state",
    );
    await wait(Math.min(2_000, remaining()));
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    requireValue(
      process.argv.length === 4,
      "Usage: node scripts/stage-public-demo.mjs <site-directory> <40hex-sha>",
    );
    const deployment = await stagePublicDemo(process.argv[2], process.argv[3], {
      token: process.env.VERCEL_TOKEN,
      projectId: process.env.VERCEL_PROJECT_ID,
      teamId: process.env.VERCEL_ORG_ID,
    });
    console.log(deployment.url);
  } catch (error) {
    console.error(`Public demo staging failed: ${error.message}`);
    process.exitCode = 1;
  }
}
