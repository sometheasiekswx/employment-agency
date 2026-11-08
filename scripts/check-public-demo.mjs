import { createHash } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const routes = [
  "/",
  "/discover/",
  "/career/",
  "/search/",
  "/history/",
  "/settings/",
];
const assetPath = /^\/demo\/files\/[a-f0-9]+\.[a-z0-9]+$/;
const requiredDirectives = {
  "default-src": ["'self'"],
  "style-src": ["'self'"],
  "font-src": ["'self'"],
  "connect-src": ["'self'"],
  "img-src": ["'self'", "blob:", "data:"],
  "frame-src": ["'self'", "blob:"],
  "object-src": ["'none'"],
  "frame-ancestors": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
};

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readPolicy(response, pathname) {
  requireValue(
    response.headers.get("x-content-type-options")?.toLowerCase() === "nosniff",
    `${pathname}: missing X-Content-Type-Options: nosniff`,
  );
  const policy = response.headers.get("content-security-policy");
  requireValue(policy, `${pathname}: missing Content-Security-Policy`);
  const directives = new Map();
  for (const section of policy.split(";")) {
    if (!section.trim()) continue;
    const [name, ...values] = section.trim().split(/\s+/);
    requireValue(
      !directives.has(name),
      `${pathname}: duplicate CSP directive ${name}`,
    );
    directives.set(name, values);
  }
  requireValue(
    directives.size === Object.keys(requiredDirectives).length + 1,
    `${pathname}: unexpected CSP directives`,
  );
  for (const [name, expected] of Object.entries(requiredDirectives)) {
    const actual = directives.get(name) ?? [];
    requireValue(
      actual.length === expected.length &&
        expected.every((value) => actual.includes(value)),
      `${pathname}: unexpected CSP ${name}`,
    );
  }
  const scripts = directives.get("script-src") ?? [];
  requireValue(
    scripts.includes("'self'") &&
      scripts.length > 1 &&
      new Set(scripts).size === scripts.length &&
      scripts.every(
        (value) =>
          value === "'self'" || /^'sha256-[A-Za-z0-9+/]{43}='$/.test(value),
      ),
    `${pathname}: script-src must use self and exact SHA-256 hashes`,
  );
  return { policy, scripts: new Set(scripts) };
}

function checkInlineScripts(html, hashes, pathname) {
  requireValue(
    /<html\b/i.test(html) && /<body\b/i.test(html),
    `${pathname}: expected an HTML page`,
  );
  for (const [, source] of html.matchAll(
    /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    // Exported external scripts have empty bodies. Hash every nonempty body
    // so an attribute such as data-src cannot bypass the inline-script check.
    if (!source) continue;
    const hash = `'sha256-${createHash("sha256").update(source).digest("base64")}'`;
    requireValue(
      hashes.has(hash),
      `${pathname}: inline script is missing its exact CSP hash`,
    );
  }
}

function checkFixture(fixture, revision) {
  requireValue(
    fixture?.public_preview === true &&
      fixture.schema === 1 &&
      fixture.state?._workspace?.demo === true &&
      fixture.state?.identity?.name === "Alex Morgan" &&
      typeof fixture.state?.identity?.email === "string" &&
      /^[^\s@]+@example\.test$/.test(fixture.state.identity.email),
    "The public fixture must contain the marked fictional Alex Morgan profile",
  );
  requireValue(
    fixture.revision === revision,
    "The fixture revision does not match release.json",
  );
  requireValue(
    isRecord(fixture.files),
    "The public fixture must contain a document file map",
  );
  const files = Object.values(fixture.files);
  requireValue(
    files.length > 0 &&
      files.every((url) => typeof url === "string" && assetPath.test(url)),
    "The public fixture contains an unsafe document asset path",
  );
  requireValue(
    isRecord(fixture.documents),
    "The public fixture must contain document previews",
  );
  for (const documents of Object.values(fixture.documents)) {
    requireValue(
      isRecord(documents),
      "The public fixture contains invalid document previews",
    );
    for (const document of Object.values(documents)) {
      requireValue(
        isRecord(document) &&
          typeof document.url === "string" &&
          assetPath.test(document.url) &&
          files.includes(document.url),
        "The public fixture contains an unsafe document preview path",
      );
    }
  }
  const pdf = files.find((url) => url.endsWith(".pdf"));
  requireValue(pdf, "The public fixture has no sample PDF");
  return pdf;
}

/** Check the static release without executing page scripts or contacting providers. */
export async function verifyPublicDemo(
  base,
  expectedCommit,
  { fetchImpl = fetch, waitForAlias = false, sleep = delay } = {},
) {
  const origin = new URL(base);
  requireValue(
    origin.protocol === "https:" &&
      !origin.username &&
      !origin.password &&
      origin.pathname === "/" &&
      !origin.search &&
      !origin.hash,
    "Use an HTTPS deployment origin without a path, query or credentials",
  );
  requireValue(
    /^[a-f0-9]{40}$/i.test(expectedCommit),
    "Expected commit must be a full 40-character Git SHA",
  );

  let releasePolicy;
  async function request(pathname, contentType) {
    const response = await fetchImpl(new URL(pathname, origin).href, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    requireValue(
      response.status === 200,
      `${pathname}: expected HTTP 200, received ${response.status}`,
    );
    requireValue(
      !response.url || response.url === new URL(pathname, origin).href,
      `${pathname}: unexpected response URL`,
    );
    requireValue(
      response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase() === contentType,
      `${pathname}: expected Content-Type ${contentType}`,
    );
    const security = readPolicy(response, pathname);
    requireValue(
      releasePolicy === undefined || security.policy === releasePolicy,
      `${pathname}: inconsistent release CSP`,
    );
    return { response, policy: security.policy, hashes: security.scripts };
  }

  const attempts = waitForAlias ? 11 : 1;
  const expected = expectedCommit.toLowerCase();
  let release;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { response, policy } = await request(
      "/release.json",
      "application/json",
    );
    release = await response.json();
    if (release?.commit === expected) {
      releasePolicy = policy;
      break;
    }
    requireValue(
      attempt < attempts &&
        typeof release?.commit === "string" &&
        /^[a-f0-9]{40}$/.test(release.commit),
      "The deployed commit does not match the expected commit",
    );
    await sleep(3_000);
  }
  requireValue(
    typeof release.fixtureRevision === "string" &&
      /^[a-f0-9]{20}$/.test(release.fixtureRevision),
    "release.json must contain the fictional fixture revision",
  );
  const { response: fixtureResponse } = await request(
    "/demo/preview.json",
    "application/json",
  );
  const pdf = checkFixture(
    await fixtureResponse.json(),
    release.fixtureRevision,
  );

  for (const pathname of routes) {
    const { response, hashes } = await request(pathname, "text/html");
    checkInlineScripts(await response.text(), hashes, pathname);
  }
  const { response: pdfResponse } = await request(pdf, "application/pdf");
  const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
  requireValue(
    pdfBytes.subarray(0, 5).toString("ascii") === "%PDF-",
    `${pdf}: invalid PDF signature`,
  );

  return {
    commit: release.commit,
    fixtureRevision: release.fixtureRevision,
    routes: [...routes],
    pdf,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const waitForAlias = process.argv[4] === "--wait-for-alias";
    requireValue(
      process.argv.length === (waitForAlias ? 5 : 4),
      "Usage: node scripts/check-public-demo.mjs <https-url> <40hex-sha> [--wait-for-alias]",
    );
    const result = await verifyPublicDemo(process.argv[2], process.argv[3], {
      waitForAlias,
    });
    console.log(
      `Verified public demo ${result.commit} (${result.fixtureRevision}): ${result.routes.length} routes and sample PDF`,
    );
  } catch (error) {
    console.error(`Public demo verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
