import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { verifyPublicDemo } from "../scripts/check-public-demo.mjs";

const base = "https://demo.example.test";
const commit = "a".repeat(40);
const revision = "b".repeat(20);
const pdf = "/demo/files/1234567890abcdef12345678.pdf";
const bootstrap = "self.__next_f.push([0]);";
const scriptHash = `'sha256-${createHash("sha256").update(bootstrap).digest("base64")}'`;
const policy = [
  "default-src 'self'",
  `script-src 'self' ${scriptHash}`,
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

function releaseServer() {
  const fixture = {
    public_preview: true,
    schema: 1,
    revision,
    state: {
      _workspace: { demo: true },
      identity: { name: "Alex Morgan", email: "alex@example.test" },
    },
    files: { "application:sample:resume.pdf": pdf },
    documents: { sample: { resume: { base: "fictional sample", url: pdf } } },
  };
  const records = new Map();
  const headers = (type) => ({
    "content-type": type,
    "content-security-policy": policy,
    "x-content-type-options": "nosniff",
  });
  const add = (pathname, body, type) =>
    records.set(pathname, { body, headers: headers(type), status: 200 });
  add(
    "/release.json",
    { commit, fixtureRevision: revision },
    "application/json",
  );
  add("/demo/preview.json", fixture, "application/json");
  for (const pathname of [
    "/",
    "/discover/",
    "/career/",
    "/search/",
    "/history/",
    "/settings/",
  ]) {
    add(
      pathname,
      `<html><body><script>${bootstrap}</script></body></html>`,
      "text/html; charset=utf-8",
    );
  }
  add(pdf, "%PDF-1.7\nFictional sample document\n%%EOF", "application/pdf");
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const parsed = new URL(url);
    assert.equal(
      parsed.origin,
      base,
      "the verifier must stay on the release origin",
    );
    const record = records.get(parsed.pathname);
    assert.ok(record, `unexpected request to ${url}`);
    const body =
      typeof record.body === "string"
        ? record.body
        : JSON.stringify(record.body);
    return new Response(body, {
      status: record.status,
      headers: record.headers,
    });
  };
  return { fixture, records, calls, fetchImpl };
}

test("verifies release provenance, all routes and a fictional PDF with only bounded GETs", async () => {
  const server = releaseServer();
  const result = await verifyPublicDemo(base, commit, server);
  assert.deepEqual(result, {
    commit,
    fixtureRevision: revision,
    routes: [
      "/",
      "/discover/",
      "/career/",
      "/search/",
      "/history/",
      "/settings/",
    ],
    pdf,
  });
  assert.equal(server.calls.length, 9);
  assert.deepEqual(
    server.calls.map(({ url }) => new URL(url).pathname),
    ["/release.json", "/demo/preview.json", ...result.routes, pdf],
  );
  for (const { options } of server.calls) {
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test("rejects an unexpected deployed commit before reading fixture links", async () => {
  const server = releaseServer();
  await assert.rejects(
    verifyPublicDemo(base, "c".repeat(40), server),
    /deployed commit/,
  );
  assert.equal(server.calls.length, 1);
});

test("waits for the public alias to serve the expected commit and its CSP", async () => {
  const server = releaseServer();
  const marker = server.records.get("/release.json");
  marker.body.commit = "c".repeat(40);
  marker.headers["content-security-policy"] = policy.replace(
    scriptHash,
    `'sha256-${createHash("sha256").update("previous release").digest("base64")}'`,
  );
  const result = await verifyPublicDemo(base, commit, {
    fetchImpl: server.fetchImpl,
    waitForAlias: true,
    sleep: async () => {
      assert.equal(server.calls.length, 1);
      marker.body.commit = commit;
      marker.headers["content-security-policy"] = policy;
    },
  });
  assert.equal(result.commit, commit);
  assert.deepEqual(
    server.calls.slice(0, 3).map(({ url }) => new URL(url).pathname),
    ["/release.json", "/release.json", "/demo/preview.json"],
  );
});

test("bounds alias polling and keeps stale releases from passing", async () => {
  const server = releaseServer();
  const waits = [];
  await assert.rejects(
    verifyPublicDemo(base, "c".repeat(40), {
      fetchImpl: server.fetchImpl,
      waitForAlias: true,
      sleep: async (milliseconds) => waits.push(milliseconds),
    }),
    /deployed commit/,
  );
  assert.deepEqual(waits, Array(10).fill(3_000));
  assert.deepEqual(
    server.calls.map(({ url }) => new URL(url).pathname),
    Array(11).fill("/release.json"),
  );
});

test("rejects a missing or mismatched fixture revision", async (t) => {
  for (const value of [undefined, "c".repeat(20)]) {
    await t.test(String(value), async () => {
      const server = releaseServer();
      server.records.get("/release.json").body.fixtureRevision = value;
      await assert.rejects(
        verifyPublicDemo(base, commit, server),
        /fixture revision/,
      );
    });
  }
});

test("rejects non-fictional profile and false demo markers", async (t) => {
  const changes = [
    (fixture) => {
      fixture.public_preview = false;
    },
    (fixture) => {
      fixture.state._workspace.demo = false;
    },
    (fixture) => {
      fixture.state.identity.name = "Real Candidate";
    },
    (fixture) => {
      fixture.state.identity.email = "alex@personal.example";
    },
  ];
  for (const [index, change] of changes.entries()) {
    await t.test(String(index), async () => {
      const server = releaseServer();
      change(server.fixture);
      await assert.rejects(
        verifyPublicDemo(base, commit, server),
        /fictional Alex Morgan/,
      );
      assert.equal(server.calls.length, 2);
    });
  }
});

test("verifies the approved résumé PDF and rejects a mismatched public profile", async () => {
  const server = releaseServer();
  const master = "/demo/master-resume.pdf";
  const bytes = "%PDF-1.7\nPublic resume fixture\n%%EOF";
  server.fixture.state.identity = { name: "Demo Profile Owner" };
  server.fixture.demo_resume = {
    name: "Demo Profile Owner",
    text: "Demo Profile Owner\nEngineering portfolio",
    pdf: master,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  server.records.set(master, { ...server.records.get(pdf), body: bytes });
  await verifyPublicDemo(base, commit, server);
  assert.ok(server.calls.some(({ url }) => new URL(url).pathname === master));
  server.fixture.state.identity.name = "Alex Morgan";
  await assert.rejects(
    verifyPublicDemo(base, commit, server),
    /approved résumé owner/,
  );
});

test("rejects external, traversal and encoded document links without requesting them", async (t) => {
  for (const unsafe of [
    "https://provider.example/file.pdf",
    "//provider.example/file.pdf",
    "/demo/files/../private.pdf",
    "/demo/files/%2e%2e/private.pdf",
    `${pdf}?token=secret`,
  ]) {
    await t.test(unsafe, async () => {
      const server = releaseServer();
      server.fixture.files.extra = unsafe;
      await assert.rejects(
        verifyPublicDemo(base, commit, server),
        /unsafe document asset path/,
      );
      assert.equal(server.calls.length, 2);
    });
  }
});

test("rejects preview URLs outside the validated file map", async () => {
  const server = releaseServer();
  server.fixture.documents.sample.resume.url =
    "https://provider.example/document.pdf";
  await assert.rejects(
    verifyPublicDemo(base, commit, server),
    /unsafe document preview path/,
  );
  assert.equal(server.calls.length, 2);
});

test("requires both security headers on every checked resource", async (t) => {
  for (const pathname of [
    "/release.json",
    "/demo/preview.json",
    "/career/",
    pdf,
  ]) {
    for (const header of [
      "content-security-policy",
      "x-content-type-options",
    ]) {
      await t.test(`${pathname} ${header}`, async () => {
        const server = releaseServer();
        delete server.records.get(pathname).headers[header];
        await assert.rejects(
          verifyPublicDemo(base, commit, server),
          /missing .*Policy|missing X-Content-Type-Options/,
        );
      });
    }
  }
});

test("rejects unsafe or widened CSP sources and duplicate directives", async (t) => {
  for (const replacement of [
    policy.replace(scriptHash, "'unsafe-inline'"),
    policy.replace(scriptHash, "'unsafe-eval'"),
    policy.replace(scriptHash, "https://cdn.example"),
    policy.replace(
      "connect-src 'self' https://api.smartrecruiters.com",
      "connect-src *",
    ),
    `${policy}; script-src 'unsafe-inline'`,
  ]) {
    await t.test(replacement, async () => {
      const server = releaseServer();
      server.records.get("/release.json").headers["content-security-policy"] =
        replacement;
      await assert.rejects(
        verifyPublicDemo(base, commit, server),
        /CSP|script-src/,
      );
    });
  }
});

test("rejects an HTML bootstrap not covered by its exact CSP hash", async () => {
  const server = releaseServer();
  server.records.get("/discover/").body =
    "<html><body><script>alert('changed')</script></body></html>";
  await assert.rejects(
    verifyPublicDemo(base, commit, server),
    /missing its exact CSP hash/,
  );
});

test("does not mistake a data-src attribute for an external script", async () => {
  const server = releaseServer();
  server.records.get("/discover/").body =
    "<html><body><script data-src='sample'>alert('changed')</script></body></html>";
  await assert.rejects(
    verifyPublicDemo(base, commit, server),
    /missing its exact CSP hash/,
  );
});

test("rejects failed routes and content-type fallbacks", async (t) => {
  for (const change of [
    (record) => {
      record.status = 404;
    },
    (record) => {
      record.headers["content-type"] = "application/json";
    },
    (record) => {
      record.body = "not an HTML page";
    },
  ]) {
    await t.test(String(change), async () => {
      const server = releaseServer();
      change(server.records.get("/settings/"));
      await assert.rejects(
        verifyPublicDemo(base, commit, server),
        /expected HTTP 200|expected Content-Type|expected an HTML page/,
      );
    });
  }
});

test("rejects a PDF error page and incorrect PDF content type", async (t) => {
  for (const change of [
    (record) => {
      record.body = "<html>Missing document</html>";
    },
    (record) => {
      record.headers["content-type"] = "text/html";
    },
  ]) {
    await t.test(String(change), async () => {
      const server = releaseServer();
      change(server.records.get(pdf));
      await assert.rejects(
        verifyPublicDemo(base, commit, server),
        /PDF signature|Content-Type application\/pdf/,
      );
    });
  }
});

test("rejects invalid target inputs without making requests", async (t) => {
  for (const [url, sha] of [
    ["http://demo.example.test", commit],
    [`${base}/discover/`, commit],
    [`${base}?token=secret`, commit],
    ["https://user:password@demo.example.test", commit],
    [base, "main"],
  ]) {
    await t.test(url, async () => {
      const server = releaseServer();
      await assert.rejects(
        verifyPublicDemo(url, sha, server),
        /HTTPS deployment origin|40-character Git SHA/,
      );
      assert.equal(server.calls.length, 0);
    });
  }
});
