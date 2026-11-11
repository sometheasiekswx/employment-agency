import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { stagePublicDemo } from "../scripts/stage-public-demo.mjs";

const commit = "a".repeat(40);
const revision = "b".repeat(20);
const projectId = "prj_jW5ss3iNVEOEBwi0fxJL7ymAFeG0";
const teamId = "team_QmjRFzULoHfOTipsjFByfxON";
const token = "test-token-never-print";
const pdf = "demo/files/1234abcd.pdf";
const bootstrap = "self.__next_f.push([0]);";
const hash = `'sha256-${createHash("sha256").update(bootstrap).digest("base64")}'`;
const policy = [
  "default-src 'self'",
  `script-src 'self' ${hash}`,
  "style-src 'self'",
  "font-src 'self'",
  "connect-src 'self' https://api.smartrecruiters.com",
  "img-src 'self' blob: data:",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

async function artifact(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "public-demo-stage-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const site = path.join(directory, "site");
  const fixture = {
    public_preview: true,
    schema: 1,
    revision,
    state: {
      _workspace: { demo: true },
      identity: { name: "Alex Morgan", email: "alex@example.test" },
    },
    files: { resume: `/${pdf}` },
    documents: { sample: { resume: { url: `/${pdf}` } } },
  };
  const config = {
    $schema: "https://openapi.vercel.sh/vercel.json",
    framework: null,
    buildCommand: "",
    installCommand: "",
    trailingSlash: true,
    headers: [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: policy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/release.json",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ],
  };
  async function save(file, content) {
    await mkdir(path.dirname(path.join(site, file)), { recursive: true });
    await writeFile(
      path.join(site, file),
      typeof content === "object" && !Buffer.isBuffer(content)
        ? JSON.stringify(content)
        : content,
    );
  }
  await save("release.json", { commit, fixtureRevision: revision });
  await save("demo/preview.json", fixture);
  await save("vercel.json", config);
  await save(
    pdf,
    Buffer.concat([
      Buffer.from("%PDF-1.7\n"),
      Buffer.from([0, 128, 255]),
      Buffer.from("\n%%EOF"),
    ]),
  );
  for (const route of [
    "",
    "discover/",
    "career/",
    "search/",
    "history/",
    "settings/",
  ]) {
    await save(
      `${route}index.html`,
      `<html><body><script>${bootstrap}</script></body></html>`,
    );
  }
  return { directory, site, fixture, config, save };
}

function server() {
  const project = {
    id: projectId,
    accountId: teamId,
    name: "employment-agency-demo",
  };
  const deployment = {
    id: "dpl_Test123",
    url: "employment-agency-demo-test.vercel.app",
    projectId,
    target: "production",
    meta: { githubCommitSha: commit },
    readyState: "READY",
  };
  const calls = [];
  const state = {
    project,
    created: { ...deployment, readyState: "QUEUED" },
    polls: [deployment],
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://api.vercel.com");
    assert.equal(parsed.searchParams.get("teamId"), teamId);
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    let body;
    if (parsed.pathname === `/v9/projects/${projectId}`) {
      assert.equal(parsed.searchParams.get("rollbackInfo"), "true");
      assert.equal(options.method, "GET");
      body = state.project;
    } else if (parsed.pathname === "/v13/deployments") {
      assert.equal(options.method, "POST");
      assert.equal(
        parsed.searchParams.get("skipAutoDetectionConfirmation"),
        "1",
      );
      body = state.created;
    } else {
      assert.equal(parsed.pathname, `/v13/deployments/${deployment.id}`);
      assert.equal(options.method, "GET");
      body = state.polls.length > 1 ? state.polls.shift() : state.polls[0];
    }
    return body instanceof Response ? body : Response.json(body);
  };
  return {
    state,
    calls,
    fetchImpl,
    options: { token, projectId, teamId, fetchImpl },
  };
}

function creates(mock) {
  return mock.calls.filter(({ options }) => options.method === "POST");
}

test("stages exact captured bytes and generated CSP once without assigning domains", async (t) => {
  const local = await artifact(t);
  await local.save("readme.txt", "Sample résumé\r\nExample documents\r\n");
  const mock = server();
  const result = await stagePublicDemo(local.site, commit, mock.options);
  assert.deepEqual(result, {
    id: "dpl_Test123",
    url: "https://employment-agency-demo-test.vercel.app",
  });
  assert.equal(mock.calls.length, 3);
  assert.equal(creates(mock).length, 1);
  const body = JSON.parse(creates(mock)[0].options.body);
  assert.equal(body.name, "employment-agency-demo");
  assert.equal(body.project, projectId);
  assert.equal(body.target, "production");
  assert.equal(body.version, 2);
  assert.equal(body.autoAssignCustomDomains, false);
  assert.equal(body.trailingSlash, true);
  assert.equal("alias" in body, false);
  assert.deepEqual(body.headers, local.config.headers);
  assert.deepEqual(body.projectSettings, {
    framework: null,
    buildCommand: "",
    installCommand: "",
    outputDirectory: ".",
    rootDirectory: null,
  });
  assert.deepEqual(body.meta, {
    githubCommitSha: commit,
    githubCommitRef: "main",
  });
  assert.equal(body.files.length, 11);
  assert.equal(
    body.files.find(({ file }) => file === "readme.txt").encoding,
    "utf-8",
  );
  assert.equal(body.files.find(({ file }) => file === pdf).encoding, "base64");
  for (const file of body.files) {
    assert.deepEqual(
      Buffer.from(file.data, file.encoding),
      await readFile(path.join(local.site, file.file)),
    );
  }
  assert.ok(body.files.some(({ file }) => file === "vercel.json"));
});

test("rejects invalid input before making requests", async (t) => {
  const local = await artifact(t);
  for (const change of [
    { token: undefined },
    { token: "unsafe\ntoken" },
    { projectId: "prj_private" },
    { teamId: "team_private" },
  ]) {
    const mock = server();
    await assert.rejects(
      stagePublicDemo(local.site, commit, { ...mock.options, ...change }),
      /TOKEN|dedicated public demo/,
    );
    assert.equal(mock.calls.length, 0);
  }
  const mock = server();
  await assert.rejects(
    stagePublicDemo(local.site, "main", mock.options),
    /40-character Git SHA/,
  );
  assert.equal(mock.calls.length, 0);
});

test("rejects commit, fictional fixture, revision and CSP changes before deployment", async (t) => {
  for (const change of [
    async (local) =>
      local.save("release.json", {
        commit: "c".repeat(40),
        fixtureRevision: revision,
      }),
    async (local) => {
      local.fixture.state.identity.name = "Real Candidate";
      await local.save("demo/preview.json", local.fixture);
    },
    async (local) => {
      local.fixture.state.identity.email = "alex@personal.example";
      await local.save("demo/preview.json", local.fixture);
    },
    async (local) => {
      local.fixture.public_preview = false;
      await local.save("demo/preview.json", local.fixture);
    },
    async (local) => {
      local.fixture.state._workspace.demo = false;
      await local.save("demo/preview.json", local.fixture);
    },
    async (local) => {
      local.fixture.revision = "c".repeat(20);
      await local.save("demo/preview.json", local.fixture);
    },
    async (local) => {
      local.config.headers[0].headers[0].value = policy.replace(
        hash,
        "'unsafe-inline'",
      );
      await local.save("vercel.json", local.config);
    },
    async (local) =>
      local.save(
        "career/index.html",
        "<html><body><script>changed()</script></body></html>",
      ),
  ]) {
    const local = await artifact(t);
    await change(local);
    const mock = server();
    await assert.rejects(
      stagePublicDemo(local.site, commit, mock.options),
      /commit|fictional|revision|script-src|CSP hash/,
    );
    assert.equal(mock.calls.length, 0);
  }
});

test("rejects executable routing configuration and unsafe or missing fixture paths", async (t) => {
  for (const extra of [
    { functions: {} },
    {
      rewrites: [{ source: "/(.*)", destination: "https://external.example" }],
    },
    { framework: "flask" },
  ]) {
    const local = await artifact(t);
    await local.save("vercel.json", { ...local.config, ...extra });
    const mock = server();
    await assert.rejects(
      stagePublicDemo(local.site, commit, mock.options),
      /static configuration/,
    );
    assert.equal(mock.calls.length, 0);
  }
  for (const unsafe of [
    "/demo/files/../private.pdf",
    "https://external.example/private.pdf",
    "/demo/files/abcd.pdf",
  ]) {
    const local = await artifact(t);
    local.fixture.files.extra = unsafe;
    await local.save("demo/preview.json", local.fixture);
    const mock = server();
    await assert.rejects(
      stagePublicDemo(local.site, commit, mock.options),
      /unsafe document|missing document/,
    );
    assert.equal(mock.calls.length, 0);
  }
});

test("rejects artifact symlinks including links outside the artifact", async (t) => {
  const local = await artifact(t);
  const outside = path.join(local.directory, "private.txt");
  await writeFile(outside, "private bytes");
  try {
    await symlink(outside, path.join(local.site, "linked.txt"));
  } catch (error) {
    if (
      process.platform === "win32" &&
      ["EPERM", "EACCES", "ENOTSUP"].includes(error.code)
    ) {
      t.skip(
        "Windows does not permit creating a symlink in this test environment",
      );
      return;
    }
    throw error;
  }
  const mock = server();
  await assert.rejects(
    stagePublicDemo(local.site, commit, mock.options),
    /symlink/,
  );
  assert.equal(mock.calls.length, 0);
});

test("rejects provider project mismatches and pending promotions before creating", async (t) => {
  const local = await artifact(t);
  for (const changes of [
    { id: "prj_private" },
    { accountId: "team_private" },
    { lastAliasRequest: { jobStatus: "pending" } },
    { lastAliasRequest: { jobStatus: "in-progress" } },
  ]) {
    const mock = server();
    Object.assign(mock.state.project, changes);
    await assert.rejects(
      stagePublicDemo(local.site, commit, mock.options),
      /project or team|promotion is still pending/,
    );
    assert.equal(creates(mock).length, 0);
  }
});

test("never retries a failed create and never exposes raw provider errors", async (t) => {
  const local = await artifact(t);
  const mock = server();
  mock.state.created = Response.json(
    { error: { message: token } },
    { status: 500 },
  );
  await assert.rejects(
    stagePublicDemo(local.site, commit, mock.options),
    (error) => {
      assert.match(error.message, /HTTP 500/);
      assert.match(error.message, /\(\d+ request bytes\)/);
      assert.equal(error.message.includes(token), false);
      return true;
    },
  );
  assert.equal(creates(mock).length, 1);
  assert.equal(mock.calls.length, 2);
  const network = server();
  await assert.rejects(
    stagePublicDemo(local.site, commit, {
      ...network.options,
      fetchImpl: async () => {
        throw new Error(token);
      },
    }),
    (error) => {
      assert.equal(error.message, "Vercel GET request failed");
      return true;
    },
  );
});

test("rejects failed, canceled or mismatched staged deployments after exactly one create", async (t) => {
  const local = await artifact(t);
  for (const changes of [
    { readyState: "ERROR" },
    { readyState: "CANCELED" },
    { projectId: "prj_private" },
    { target: "preview" },
    { meta: { githubCommitSha: "c".repeat(40) } },
    { url: "external.example" },
    { id: "dpl_Other" },
  ]) {
    const mock = server();
    Object.assign(mock.state.polls[0], changes);
    await assert.rejects(
      stagePublicDemo(local.site, commit, mock.options),
      /failed|canceled|identity|URL/,
    );
    assert.equal(creates(mock).length, 1);
  }
});

test("polls until ready and times out without creating another deployment", async (t) => {
  const local = await artifact(t);
  const mock = server();
  mock.state.polls.unshift({ ...mock.state.polls[0], readyState: "BUILDING" });
  let currentTime = 0;
  const timing = {
    now: () => currentTime,
    wait: async (milliseconds) => {
      currentTime += milliseconds;
    },
    timeoutMs: 3_000,
  };
  await stagePublicDemo(local.site, commit, { ...mock.options, ...timing });
  assert.equal(currentTime, 2_000);
  assert.equal(creates(mock).length, 1);
  const timeout = server();
  timeout.state.polls[0].readyState = "BUILDING";
  currentTime = 0;
  await assert.rejects(
    stagePublicDemo(local.site, commit, { ...timeout.options, ...timing }),
    /timed out/,
  );
  assert.equal(currentTime, 3_000);
  assert.equal(creates(timeout).length, 1);
});

test("CLI writes failures only to stderr without credentials", async (t) => {
  const local = await artifact(t);
  const script = fileURLToPath(
    new URL("../scripts/stage-public-demo.mjs", import.meta.url),
  );
  const result = spawnSync(process.execPath, [script, local.site, commit], {
    encoding: "utf8",
    env: {},
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Missing or invalid VERCEL_TOKEN/);
});
