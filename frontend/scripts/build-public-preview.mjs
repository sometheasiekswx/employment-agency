import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readShowcaseResume } from "../../scripts/showcase-resume.mjs";

const frontend = fileURLToPath(new URL("../", import.meta.url));
const root = path.dirname(frontend);
const destination = path.join(root, "output/public-preview/site");
const generatedTypes = path.join(frontend, "next-env.d.ts");
const originalTypes = await readFile(generatedTypes);
const commit =
  process.env.GITHUB_SHA ||
  spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).stdout?.trim();
if (!/^[a-f0-9]{40}$/.test(commit || "")) {
  throw new Error("A public build requires its exact source commit.");
}
const fixture = JSON.parse(
  await readFile(path.join(frontend, "public/demo/preview.json"), "utf8"),
);
if (
  fixture.public_preview !== true ||
  fixture.state?._workspace?.demo !== true ||
  fixture.state?.identity?.name !== "Alex Morgan" ||
  !fixture.state?.identity?.email?.endsWith("@example.test")
) {
  throw new Error(
    "Refusing a public build without the marked fictional fixture.",
  );
}

// Keep the normal Python package and the user's development types unchanged.
try {
  const result = spawnSync(
    process.execPath,
    [path.join(frontend, "node_modules/next/dist/bin/next"), "build"],
    {
      cwd: frontend,
      stdio: "inherit",
      env: { ...process.env, NEXT_PUBLIC_EA_PUBLIC_PREVIEW: "1" },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Public preview build failed.");
} finally {
  await writeFile(generatedTypes, originalTypes);
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
// For output: "export", Next uses a custom distDir as the export destination.
await cp(path.join(frontend, ".next-public-preview"), destination, {
  recursive: true,
});
const demo = path.join(destination, "demo");
const fixturePath = path.join(demo, "preview.json");
let exportedFixture = JSON.parse(await readFile(fixturePath, "utf8"));
if (
  exportedFixture.public_preview !== true ||
  exportedFixture.revision !== fixture.revision
) {
  throw new Error(
    "The exported site does not contain the current fictional snapshot.",
  );
}
if (process.env.EA_PUBLIC_DEMO_RESUME_DIR) {
  const { resume, pdf } = await readShowcaseResume(
    process.env.EA_PUBLIC_DEMO_RESUME_DIR,
  );
  const publication = spawnSync(
    process.env.EA_PUBLIC_DEMO_PYTHON || "python3",
    [
      "-m",
      "employment_agency.public_preview",
      "--publish-resume",
      "--output",
      demo,
    ],
    {
      cwd: root,
      input: JSON.stringify({ resume, pdf: pdf.toString("base64") }),
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (publication.error || publication.status !== 0)
    throw new Error(
      "Could not build the public profile and sample documents from the approved résumé.",
    );
  exportedFixture = JSON.parse(await readFile(fixturePath, "utf8"));
}
for (const url of Object.values(exportedFixture.files)) {
  if (
    typeof url !== "string" ||
    !/^\/demo\/files\/[a-f0-9]+\.[a-z0-9]+$/.test(url)
  ) {
    throw new Error("Unexpected public document asset path.");
  }
  await readFile(path.join(destination, url));
}

async function filesIn(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesIn(path.join(directory, entry.name), name)));
    } else if (entry.isFile()) {
      files.push(name);
    } else {
      throw new Error(`Unexpected non-file in static output: ${name}`);
    }
  }
  return files.sort();
}

// Next bootstrap scripts use exact hashes, as in the Python server's CSP.
const hashes = new Set();
for (const name of await filesIn(destination)) {
  if (!name.endsWith(".html")) continue;
  const html = await readFile(path.join(destination, name), "utf8");
  for (const [, attributes, source] of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
  )) {
    if (!/\bsrc\s*=/i.test(attributes)) {
      hashes.add(
        `'sha256-${createHash("sha256").update(source).digest("base64")}'`,
      );
    }
  }
}
const csp = [
  "default-src 'self'",
  `script-src 'self' ${[...hashes].sort().join(" ")}`,
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

await writeFile(
  path.join(destination, "vercel.json"),
  JSON.stringify(
    {
      $schema: "https://openapi.vercel.sh/vercel.json",
      framework: null,
      buildCommand: "",
      installCommand: "",
      trailingSlash: true,
      headers: [
        {
          source: "/(.*)",
          headers: [
            { key: "Content-Security-Policy", value: csp },
            { key: "X-Content-Type-Options", value: "nosniff" },
            {
              key: "Referrer-Policy",
              value: "strict-origin-when-cross-origin",
            },
          ],
        },
        {
          source: "/release.json",
          headers: [{ key: "Cache-Control", value: "no-cache" }],
        },
      ],
    },
    null,
    2,
  ) + "\n",
);

await writeFile(
  path.join(destination, "release.json"),
  JSON.stringify(
    { commit, fixtureRevision: exportedFixture.revision },
    null,
    2,
  ) + "\n",
);

const manifest = [];
for (const file of await filesIn(destination)) {
  const data = await readFile(path.join(destination, file));
  manifest.push({
    file,
    size: data.length,
    sha: createHash("sha1").update(data).digest("hex"),
  });
}
await writeFile(
  path.join(root, "output/public-preview/deployment-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(`Prepared ${manifest.length} static files in ${destination}`);
