import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promotePublicDemo } from "../scripts/promote-public-demo.mjs";

const stagedUrl = "https://public-demo-abc123.vercel.app";
const commit = "a".repeat(40);
const projectId = "prj_FictionalDemo";
const teamId = "team_FictionalTeam";
const deploymentId = "dpl_FictionalDeployment";
const token = "never-log-this-fictional-token";
const job = (jobStatus, extras = {}) => ({
  toDeploymentId: deploymentId,
  type: "promote",
  requestedAt: 100,
  jobStatus,
  ...extras,
});

function apiServer({ statuses = [job("succeeded")], postStatus = 201 } = {}) {
  const deployment = {
    id: deploymentId,
    url: new URL(stagedUrl).hostname,
    readyState: "READY",
    target: "production",
    projectId,
    meta: { githubCommitSha: commit },
  };
  const project = { id: projectId, accountId: teamId, lastAliasRequest: null };
  const calls = [];
  const waits = [];
  let elapsed = 0;
  let promoted = false;
  let pollIndex = 0;
  const options = {
    token,
    projectId,
    teamId,
    timeoutMs: 3_000,
    now: () => elapsed,
    wait: async (ms) => {
      waits.push(ms);
      elapsed += ms;
    },
    fetchImpl: async (url, request) => {
      calls.push({ url, request });
      const parsed = new URL(url);
      assert.equal(parsed.origin, "https://api.vercel.com");
      assert.equal(parsed.searchParams.get("teamId"), teamId);
      assert.equal(request.headers.Authorization, `Bearer ${token}`);
      assert.equal(request.redirect, "error");
      assert.ok(request.signal instanceof AbortSignal);
      if (parsed.pathname === `/v13/deployments/${deployment.url}`) {
        assert.equal(request.method, "GET");
        return Response.json(deployment);
      }
      if (parsed.pathname === `/v9/projects/${projectId}`) {
        assert.equal(parsed.searchParams.get("rollbackInfo"), "true");
        assert.equal(request.method, "GET");
        const current = promoted
          ? statuses[Math.min(pollIndex++, statuses.length - 1)]
          : project.lastAliasRequest;
        return Response.json({ ...project, lastAliasRequest: current });
      }
      assert.equal(
        parsed.pathname,
        `/v10/projects/${projectId}/promote/${deploymentId}`,
      );
      assert.equal(request.method, "POST");
      assert.equal(request.body, undefined);
      promoted = true;
      return new Response(null, { status: postStatus });
    },
  };
  return { deployment, project, calls, waits, options };
}

function posts(server) {
  return server.calls.filter(({ request }) => request.method === "POST");
}

test("promotes a verified production deployment with a single bodyless POST", async () => {
  const server = apiServer();
  assert.deepEqual(await promotePublicDemo(stagedUrl, commit, server.options), {
    id: deploymentId,
    url: stagedUrl,
    commit,
  });
  assert.equal(server.calls.length, 4);
  assert.equal(posts(server).length, 1);
  assert.deepEqual(server.waits, []);
});

test("accepts an asynchronous 202 and polls pending jobs until succeeded", async () => {
  const server = apiServer({
    postStatus: 202,
    statuses: [job("pending"), job("in-progress"), job("succeeded")],
  });
  await promotePublicDemo(stagedUrl, commit, server.options);
  assert.deepEqual(server.waits, [1_000, 1_000]);
  assert.equal(posts(server).length, 1);
});

test("supports deployment project.id metadata", async () => {
  const server = apiServer();
  delete server.deployment.projectId;
  server.deployment.project = { id: projectId };
  await promotePublicDemo(stagedUrl, commit, server.options);
  assert.equal(posts(server).length, 1);
});

test("rejects wrong deployment project, commit, URL, state and target before promotion", async (t) => {
  const cases = [
    [
      "project",
      (deployment) => {
        deployment.projectId = "prj_OtherProject";
      },
    ],
    [
      "conflicting project",
      (deployment) => {
        deployment.project = { id: "prj_OtherProject" };
      },
    ],
    [
      "commit",
      (deployment) => {
        deployment.meta.githubCommitSha = "b".repeat(40);
      },
    ],
    [
      "URL",
      (deployment) => {
        deployment.url = "different.vercel.app";
      },
    ],
    [
      "state",
      (deployment) => {
        deployment.readyState = "BUILDING";
      },
    ],
    [
      "target",
      (deployment) => {
        deployment.target = null;
      },
    ],
    [
      "id",
      (deployment) => {
        deployment.id = "not-a-deployment-id";
      },
    ],
  ];
  for (const [name, change] of cases) {
    await t.test(name, async () => {
      const server = apiServer();
      change(server.deployment);
      const fetch = server.options.fetchImpl;
      // Keep the mocked lookup route fixed when its returned URL is incorrect.
      server.options.fetchImpl = (url, request) =>
        url.includes("/v13/deployments/")
          ? Response.json(server.deployment)
          : fetch(url, request);
      await assert.rejects(
        promotePublicDemo(stagedUrl, commit, server.options),
        /staged deployment/,
      );
      assert.equal(posts(server).length, 0);
    });
  }
});

test("rejects a wrong project account and pending promotion before POST", async (t) => {
  for (const [name, change] of [
    [
      "project",
      (project) => {
        project.id = "prj_OtherProject";
      },
    ],
    [
      "account",
      (project) => {
        project.accountId = "team_OtherTeam";
      },
    ],
    [
      "pending",
      (project) => {
        project.lastAliasRequest = job("pending");
      },
    ],
    [
      "in-progress",
      (project) => {
        project.lastAliasRequest = job("in-progress");
      },
    ],
  ]) {
    await t.test(name, async () => {
      const server = apiServer();
      change(server.project);
      await assert.rejects(
        promotePublicDemo(stagedUrl, commit, server.options),
        /expected project and account|pending promotion/,
      );
      assert.equal(posts(server).length, 0);
    });
  }
});

test("fails on failed or skipped jobs without repeating or cancelling the request", async (t) => {
  for (const state of ["failed", "skipped"]) {
    await t.test(state, async () => {
      const server = apiServer({ statuses: [job(state)] });
      await assert.rejects(
        promotePublicDemo(stagedUrl, commit, server.options),
        (error) => {
          assert.match(error.message, new RegExp(`promotion job ${state}`));
          assert.match(error.message, /verify the public alias/);
          assert.doesNotMatch(error.message, /may still complete/);
          return true;
        },
      );
      assert.equal(posts(server).length, 1);
      assert.ok(
        server.calls.every(({ request }) =>
          ["GET", "POST"].includes(request.method),
        ),
      );
    });
  }
});

test("times out with an uncertain outcome and exactly one POST", async () => {
  const server = apiServer({ statuses: [job("pending")] });
  await assert.rejects(
    promotePublicDemo(stagedUrl, commit, server.options),
    (error) => {
      assert.match(error.message, /Timed out/);
      assert.match(error.message, /uncertain and may still complete/);
      assert.match(error.message, /No cancellation was requested/);
      return true;
    },
  );
  assert.equal(posts(server).length, 1);
  assert.deepEqual(server.waits, [1_000, 1_000, 1_000]);
});

test("does not accept a different deployment, rollback, or stale success as confirmation", async () => {
  const old = job("succeeded", { requestedAt: 50 });
  const server = apiServer({
    statuses: [
      job("succeeded", { toDeploymentId: "dpl_OtherDeployment" }),
      job("succeeded", { type: "rollback" }),
      old,
      job("succeeded"),
    ],
  });
  server.project.lastAliasRequest = old;
  server.options.timeoutMs = 5_000;
  await promotePublicDemo(stagedUrl, commit, server.options);
  assert.deepEqual(server.waits, [1_000, 1_000, 1_000]);
  assert.equal(posts(server).length, 1);
});

test("rejects malformed API response objects and alias status", async (t) => {
  for (const [name, response] of [
    ["null payload", Response.json(null)],
    ["array payload", Response.json([])],
  ]) {
    await t.test(name, async () => {
      const server = apiServer();
      server.options.fetchImpl = async () => response;
      await assert.rejects(
        promotePublicDemo(stagedUrl, commit, server.options),
        /malformed/,
      );
      assert.equal(posts(server).length, 0);
    });
  }
  for (const malformed of [
    {},
    job("unknown"),
    job("pending", { requestedAt: "100" }),
  ]) {
    await t.test(JSON.stringify(malformed), async () => {
      const server = apiServer();
      server.project.lastAliasRequest = malformed;
      await assert.rejects(
        promotePublicDemo(stagedUrl, commit, server.options),
        /malformed promotion status/,
      );
      assert.equal(posts(server).length, 0);
    });
  }
});

test("never exposes API bodies or transport errors containing credentials", async (t) => {
  for (const [name, message, fail] of [
    [
      "HTTP",
      "Vercel API returned HTTP 403.",
      async () =>
        new Response(`private API response ${token}`, { status: 403 }),
    ],
    [
      "transport",
      "Vercel API request failed.",
      async () => {
        throw new Error(`transport ${token}`);
      },
    ],
    [
      "JSON parsing",
      "Vercel returned malformed JSON.",
      async () => new Response(`bad JSON ${token}`),
    ],
  ]) {
    await t.test(name, async () => {
      const server = apiServer();
      server.options.fetchImpl = async (url, request) => {
        server.calls.push({ url, request });
        return fail();
      };
      await assert.rejects(
        promotePublicDemo(stagedUrl, commit, server.options),
        {
          message,
        },
      );
      assert.deepEqual(
        server.calls.map(({ request }) => request.method),
        ["GET"],
      );
    });
  }
});

test("does not retry POST after an ambiguous network failure", async () => {
  const server = apiServer();
  const fetch = server.options.fetchImpl;
  server.options.fetchImpl = async (url, request) => {
    const response = await fetch(url, request);
    if (request.method === "POST") throw new Error(`lost response ${token}`);
    return response;
  };
  await assert.rejects(
    promotePublicDemo(stagedUrl, commit, server.options),
    (error) => {
      assert.match(error.message, /outcome is uncertain/);
      assert.ok(!error.message.includes(token));
      return true;
    },
  );
  assert.equal(posts(server).length, 1);
});

test("rejects unexpected promotion HTTP results without retrying", async (t) => {
  for (const postStatus of [200, 500]) {
    await t.test(String(postStatus), async () => {
      const server = apiServer({ postStatus });
      await assert.rejects(
        promotePublicDemo(stagedUrl, commit, server.options),
        new RegExp(`HTTP ${postStatus}`),
      );
      assert.equal(posts(server).length, 1);
      assert.equal(server.calls.length, 3);
    });
  }
});

test("revalidates project ownership while polling after promotion", async () => {
  const server = apiServer();
  const fetch = server.options.fetchImpl;
  server.options.fetchImpl = async (url, request) => {
    const response = await fetch(url, request);
    if (request.method === "POST")
      server.project.accountId = "team_OtherAccount";
    return response;
  };
  await assert.rejects(
    promotePublicDemo(stagedUrl, commit, server.options),
    /expected project and account/,
  );
  assert.equal(posts(server).length, 1);
});

test("validates origins, SHA and credentials without making requests", async (t) => {
  for (const [name, url, sha, overrides] of [
    ["HTTP", stagedUrl.replace("https:", "http:"), commit, {}],
    ["external host", "https://provider.example", commit, {}],
    ["lookalike host", "https://demo.vercel.app.provider.example", commit, {}],
    ["path", `${stagedUrl}/discover/`, commit, {}],
    ["query", `${stagedUrl}?token=private`, commit, {}],
    ["user info", "https://user:secret@demo.vercel.app", commit, {}],
    ["SHA", stagedUrl, "main", {}],
    ["token", stagedUrl, commit, { token: "" }],
    ["project", stagedUrl, commit, { projectId: "other/project" }],
    ["team", stagedUrl, commit, { teamId: "other/team" }],
  ]) {
    await t.test(name, async () => {
      const server = apiServer();
      await assert.rejects(
        promotePublicDemo(url, sha, { ...server.options, ...overrides }),
      );
      assert.equal(server.calls.length, 0);
    });
  }
});

test("CLI errors use environment credentials without printing their values", () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL("../scripts/promote-public-demo.mjs", import.meta.url),
      ),
      stagedUrl,
      commit,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        VERCEL_TOKEN: token,
        VERCEL_PROJECT_ID: "invalid",
        VERCEL_ORG_ID: teamId,
      },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /valid VERCEL_PROJECT_ID/);
  assert.equal(result.stdout, "");
  assert.ok(!result.stderr.includes(token));
});
