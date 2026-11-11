import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

const names = Array.from(
  { length: 4 },
  (_, index) => `PUBLIC_DEMO_RESUME_${index + 1}`,
);
const contact = /mailto:|tel:|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+\d[\d ().-]{7,}\d/i;

function validate(record, pdf) {
  if (
    !record ||
    typeof record.name !== "string" ||
    !record.name.trim() ||
    typeof record.text !== "string" ||
    !record.text.includes(record.name) ||
    record.text.length > 40_000 ||
    contact.test(record.text) ||
    !pdf.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
    record.sha256 !== createHash("sha256").update(pdf).digest("hex")
  ) {
    throw new Error(
      "The public résumé needs a valid redacted text and matching PDF.",
    );
  }
  return {
    resume: { name: record.name, text: record.text, sha256: record.sha256 },
    pdf,
  };
}

export async function readShowcaseResume(directory) {
  const [raw, pdf] = await Promise.all([
    readFile(path.join(directory, "resume.json"), "utf8"),
    readFile(path.join(directory, "resume.pdf")),
  ]);
  return validate(JSON.parse(raw), pdf);
}

async function pack(directory) {
  const { resume, pdf } = await readShowcaseResume(directory);
  const payload = gzipSync(
    JSON.stringify({ ...resume, pdf: pdf.toString("base64") }),
  ).toString("base64");
  const chunkSize = Math.ceil(payload.length / names.length);
  if (chunkSize > 47_000)
    throw new Error("The redacted PDF is too large for the release inputs.");
  const output = path.join(directory, "release-inputs");
  await mkdir(output, { mode: 0o700 });
  await Promise.all(
    names.map((name, index) =>
      writeFile(
        path.join(output, name),
        payload.slice(index * chunkSize, (index + 1) * chunkSize),
        { mode: 0o600, flag: "wx" },
      ),
    ),
  );
  console.log("Prepared four public résumé release inputs.");
}

async function materialize() {
  const parts = names.map((name) => process.env[name]?.trim() || "");
  if (
    parts.some(
      (part) => !part || part.length > 47_000 || !/^[a-z0-9+/=]+$/i.test(part),
    )
  )
    throw new Error("Supply all four public résumé release inputs.");
  let decoded;
  try {
    decoded = JSON.parse(
      gunzipSync(Buffer.from(parts.join(""), "base64"), {
        maxOutputLength: 300_000,
      }).toString("utf8"),
    );
  } catch {
    throw new Error(
      "The public résumé release inputs do not form a valid bundle.",
    );
  }
  const { resume, pdf } = validate(
    decoded,
    Buffer.from(decoded.pdf || "", "base64"),
  );
  const directory = await mkdtemp(
    path.join(process.env.RUNNER_TEMP, "ea-public-resume-"),
  );
  await Promise.all([
    writeFile(path.join(directory, "resume.json"), JSON.stringify(resume), {
      mode: 0o600,
    }),
    writeFile(path.join(directory, "resume.pdf"), pdf, { mode: 0o600 }),
  ]);
  await appendFile(
    process.env.GITHUB_ENV,
    `EA_PUBLIC_DEMO_RESUME_DIR=${directory}\n`,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  if (process.argv[2] === "--materialize") await materialize();
  else if (process.argv[2]) await pack(process.argv[2]);
  else throw new Error("Provide a redacted résumé directory or --materialize.");
}
