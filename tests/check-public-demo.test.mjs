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
  "connect-src 'self'",
  "img-src 'self' blob: data:",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");
const previousHash = `'sha256-${createHash("sha256").update("previous release").digest("base64")}'`;
const previousPolicy = policy.replace(scriptHash, previousHash);

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
      typeof record.body === "string" || Buffer.isBuffer(record.body)
        ? record.body
        : JSON.stringify(record.body);
    return new Response(body, {
      status: record.status,
      headers: record.headers,
    });
  };
  return { fixture, records, calls, fetchImpl };
}

function addLogo(
  server,
  png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
) {
  const sha256 = createHash("sha256").update(png).digest("hex");
  const url = `/demo/company-logos/${sha256}.png`;
  server.fixture.current_catalog_only = true;
  server.fixture.company_logos ??= {};
  server.fixture.company_logos[sha256] = url;
  server.fixture.state.jobs ??= [];
  server.fixture.state.jobs.push({ company: { logo_url: url } });
  server.records.set(url, {
    body: png,
    status: 200,
    headers: {
      ...server.records.get(pdf).headers,
      "content-type": "image/png",
    },
  });
  return { png, url };
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

test("verifies every current logo asset and rejects missing or edited marks", async () => {
  const server = releaseServer();
  const { png, url } = addLogo(server);
  assert.equal((await verifyPublicDemo(base, commit, server)).logos, 1);
  server.records.get(url).body = Buffer.concat([png, Buffer.from("edited")]);
  await assert.rejects(verifyPublicDemo(base, commit, server), /invalid public logo bytes/);
  delete server.fixture.state.jobs[0].company.logo_url;
  await assert.rejects(verifyPublicDemo(base, commit, server), /verified local company logo/);
});

test("waits for the public alias to serve the expected commit and its CSP", async () => {
  const server = releaseServer();
  const marker = server.records.get("/release.json");
  marker.body.commit = "c".repeat(40);
  marker.headers["content-security-policy"] = previousPolicy;
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

test("retries a temporary logo CSP mismatch after the new commit is already live", async () => {
  const server = releaseServer();
  const { url } = addLogo(server);
  server.records.get(url).headers["content-security-policy"] = previousPolicy;
  const waits = [];
  const result = await verifyPublicDemo(base, commit, {
    fetchImpl: server.fetchImpl,
    waitForAlias: true,
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
      // A fresh marker policy must be used for the entire next attempt.
      for (const record of server.records.values()) {
        record.headers["content-security-policy"] = policy.replace(
          scriptHash,
          `${scriptHash} ${previousHash}`,
        );
      }
    },
  });
  assert.equal(result.commit, commit);
  assert.equal(result.logos, 1);
  assert.deepEqual(waits, [3_000]);
  assert.deepEqual(
    server.calls.slice(0, 6).map(({ url }) => new URL(url).pathname),
    [
      "/release.json",
      "/demo/preview.json",
      url,
      "/release.json",
      "/demo/preview.json",
      url,
    ],
  );
  assert.deepEqual(
    server.calls.slice(6).map(({ url }) => new URL(url).pathname),
    [...result.routes, pdf],
  );
});

test("restarts full alias verification after a temporary fixture, route or PDF CSP mismatch", async (t) => {
  for (const pathname of ["/demo/preview.json", "/career/", pdf]) {
    await t.test(pathname, async () => {
      const server = releaseServer();
      const record = server.records.get(pathname);
      record.headers["content-security-policy"] = previousPolicy;
      const waits = [];
      const result = await verifyPublicDemo(base, commit, {
        fetchImpl: server.fetchImpl,
        waitForAlias: true,
        sleep: async (milliseconds) => {
          waits.push(milliseconds);
          record.headers["content-security-policy"] = policy;
        },
      });
      const complete = [
        "/release.json",
        "/demo/preview.json",
        ...result.routes,
        pdf,
      ];
      assert.deepEqual(waits, [3_000]);
      assert.deepEqual(
        server.calls.map(({ url }) => new URL(url).pathname),
        [...complete.slice(0, complete.indexOf(pathname) + 1), ...complete],
      );
    });
  }
});

test("shares the alias retry limit between stale commits and persistent CSP mismatches", async (t) => {
  for (const staleAttempts of [0, 2]) {
    await t.test(`${staleAttempts} initial stale commits`, async () => {
      const server = releaseServer();
      const marker = server.records.get("/release.json");
      marker.body.commit = staleAttempts ? "c".repeat(40) : commit;
      server.records.get("/demo/preview.json").headers[
        "content-security-policy"
      ] = previousPolicy;
      const waits = [];
      await assert.rejects(
        verifyPublicDemo(base, commit, {
          fetchImpl: server.fetchImpl,
          waitForAlias: true,
          sleep: async (milliseconds) => {
            waits.push(milliseconds);
            if (waits.length >= staleAttempts) marker.body.commit = commit;
          },
        }),
        /\/demo\/preview.json: inconsistent release CSP/,
      );
      assert.deepEqual(waits, Array(10).fill(3_000));
      const paths = server.calls.map(({ url }) => new URL(url).pathname);
      assert.equal(
        paths.filter((pathname) => pathname === "/release.json").length,
        11,
      );
      assert.equal(
        paths.filter((pathname) => pathname === "/demo/preview.json").length,
        11 - staleAttempts,
      );
    });
  }
});

test("keeps staging strict instead of retrying an inconsistent CSP", async () => {
  const server = releaseServer();
  server.records.get("/demo/preview.json").headers["content-security-policy"] =
    previousPolicy;
  await assert.rejects(
    verifyPublicDemo(base, commit, {
      fetchImpl: server.fetchImpl,
      sleep: async () => assert.fail("staged releases must not retry"),
    }),
    /inconsistent release CSP/,
  );
  assert.equal(server.calls.length, 2);
});

test("does not accept a different commit after a CSP retry", async () => {
  const server = releaseServer();
  server.records.get("/demo/preview.json").headers["content-security-policy"] =
    previousPolicy;
  let waits = 0;
  await assert.rejects(
    verifyPublicDemo(base, commit, {
      fetchImpl: server.fetchImpl,
      waitForAlias: true,
      sleep: async () => {
        waits++;
        server.records.get("/demo/preview.json").headers[
          "content-security-policy"
        ] = policy;
        server.records.get("/release.json").body.commit = "c".repeat(40);
      },
    }),
    /deployed commit/,
  );
  assert.equal(waits, 10);
  assert.equal(server.calls.length, 12);
});

test("alias retries do not mask validation or transport failures", async (t) => {
  const cases = [
    [
      "unsafe inline",
      "/demo/preview.json",
      (record) => {
        record.headers["content-security-policy"] = policy.replace(
          scriptHash,
          "'unsafe-inline'",
        );
      },
      /script-src/,
    ],
    [
      "unsafe eval",
      "/career/",
      (record) => {
        record.headers["content-security-policy"] = policy.replace(
          scriptHash,
          "'unsafe-eval'",
        );
      },
      /script-src/,
    ],
    [
      "widened sources",
      pdf,
      (record) => {
        record.headers["content-security-policy"] = policy.replace(
          "connect-src 'self'",
          "connect-src *",
        );
      },
      /CSP connect-src/,
    ],
    [
      "duplicate directive",
      "/release.json",
      (record) => {
        record.headers["content-security-policy"] +=
          "; script-src 'unsafe-inline'";
      },
      /duplicate CSP/,
    ],
    [
      "missing CSP",
      "/demo/preview.json",
      (record) => {
        delete record.headers["content-security-policy"];
      },
      /missing Content-Security-Policy/,
    ],
    [
      "missing nosniff",
      pdf,
      (record) => {
        delete record.headers["x-content-type-options"];
      },
      /missing X-Content-Type-Options/,
    ],
    [
      "invalid commit",
      "/release.json",
      (record) => {
        record.body.commit = "main";
      },
      /deployed commit/,
    ],
    [
      "malformed JSON",
      "/release.json",
      (record) => {
        record.body = "{";
      },
      SyntaxError,
    ],
    [
      "wrong revision",
      "/demo/preview.json",
      (record) => {
        record.body.revision = "c".repeat(20);
      },
      /fixture revision/,
    ],
    [
      "missing route",
      "/career/",
      (record) => {
        record.status = 404;
      },
      /expected HTTP 200/,
    ],
    [
      "wrong type",
      pdf,
      (record) => {
        record.headers["content-type"] = "text/html";
      },
      /expected Content-Type/,
    ],
    [
      "unhashed script",
      "/career/",
      (record) => {
        record.body =
          "<html><body><script>alert('changed')</script></body></html>";
      },
      /exact CSP hash/,
    ],
    [
      "corrupt PDF",
      pdf,
      (record) => {
        record.body = "not a PDF";
      },
      /invalid PDF signature/,
    ],
  ];
  for (const [name, pathname, change, expectedError] of cases) {
    await t.test(name, async () => {
      const server = releaseServer();
      change(server.records.get(pathname));
      await assert.rejects(
        verifyPublicDemo(base, commit, {
          fetchImpl: server.fetchImpl,
          waitForAlias: true,
          sleep: async () => assert.fail("validation failures must not retry"),
        }),
        expectedError,
      );
      assert.equal(
        server.calls.filter(
          ({ url }) => new URL(url).pathname === "/release.json",
        ).length,
        1,
      );
    });
  }
  await t.test("transport error with propagation-like text", async () => {
    const failure = new Error("/demo/preview.json: inconsistent release CSP");
    await assert.rejects(
      verifyPublicDemo(base, commit, {
        fetchImpl: async () => {
          throw failure;
        },
        waitForAlias: true,
        sleep: async () => assert.fail("transport failures must not retry"),
      }),
      (error) => error === failure,
    );
  });
});

test("drains concurrent logo reads and preserves fatal failures over CSP mismatches", async () => {
  const server = releaseServer();
  const first = addLogo(server);
  const second = addLogo(
    server,
    Buffer.concat([first.png, Buffer.from("second")]),
  );
  server.records.get(first.url).headers["content-security-policy"] =
    previousPolicy;
  server.records.get(second.url).body = Buffer.from("corrupt");
  let secondCompleted = false;
  await assert.rejects(
    verifyPublicDemo(base, commit, {
      fetchImpl: async (url, options) => {
        if (new URL(url).pathname === second.url) {
          await new Promise((resolve) => setImmediate(resolve));
          secondCompleted = true;
        }
        return server.fetchImpl(url, options);
      },
      waitForAlias: true,
      sleep: async () =>
        assert.fail("a concurrent validation failure must not retry"),
    }),
    /invalid public logo bytes/,
  );
  assert.equal(secondCompleted, true);
  assert.equal(server.calls.length, 4);
});

test("still checks logo integrity after a CSP mismatch recovers", async () => {
  const server = releaseServer();
  const { url } = addLogo(server);
  const logo = server.records.get(url);
  logo.headers["content-security-policy"] = previousPolicy;
  let waits = 0;
  await assert.rejects(
    verifyPublicDemo(base, commit, {
      fetchImpl: server.fetchImpl,
      waitForAlias: true,
      sleep: async () => {
        waits++;
        logo.headers["content-security-policy"] = policy;
        logo.body = Buffer.from("corrupt");
      },
    }),
    /invalid public logo bytes/,
  );
  assert.equal(waits, 1);
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

test("verifies the approved résumé PDF in the profile and sample applications", async () => {
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
  const samplePdf =
    "/demo/files/" + server.fixture.demo_resume.sha256.slice(0, 24) + ".pdf";
  server.fixture.state.applications = [{ id: "sample" }];
  server.fixture.files["application:sample:resume.pdf"] = samplePdf;
  server.fixture.documents.sample.resume.url = samplePdf;
  server.records.set(master, { ...server.records.get(pdf), body: bytes });
  server.records.set(samplePdf, { ...server.records.get(pdf), body: bytes });
  await verifyPublicDemo(base, commit, server);
  assert.ok(server.calls.some(({ url }) => new URL(url).pathname === master));
  server.records.get(samplePdf).body = server.records.get(pdf).body;
  await assert.rejects(verifyPublicDemo(base, commit, server), /sample CV PDF/);
  server.records.get(samplePdf).body = bytes;
  server.fixture.files["history:sample:AlexMorgan-CV.pdf"] = samplePdf;
  await assert.rejects(
    verifyPublicDemo(base, commit, server),
    /fictional candidate/,
  );
  delete server.fixture.files["history:sample:AlexMorgan-CV.pdf"];
  server.fixture.files["application:sample:resume.pdf"] = pdf;
  server.fixture.documents.sample.resume.url = pdf;
  await assert.rejects(
    verifyPublicDemo(base, commit, server),
    /must use the approved résumé PDF/,
  );
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
      "connect-src 'self'",
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
