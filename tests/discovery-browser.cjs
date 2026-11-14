"use strict";

// Exercise a real shared frontend and local server against delayed source fixtures.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { chromium } = require("../frontend/node_modules/playwright");

const root = path.resolve(__dirname, "..");
const fixture = String.raw`
from pathlib import Path
import signal
from tempfile import TemporaryDirectory
from time import sleep
from employment_agency.discovery_fetch import Fetch
from employment_agency.server import server
from employment_agency.service import Service
from employment_agency.sources import normalized, SourceError
from employment_agency.store import Workspace
from employment_agency.workspaces import configure

def page(self, url, **kwargs):
    if "limited.example.test" in url:
        raise SourceError("Source returned HTTP 403", status=403)
    if "slow.example.test" in url:
        sleep(2.8)
    if "article.example.test" in url:
        return "http", {"title": "Ordinary Public Page", "text": "Readable fixture text",
                        "url": url, "links": [], "jobs": []}
    title = "Slow Engineer" if "slow.example.test" in url else "Fast Engineer"
    job = normalized(title, "Fixture Employer", "Phnom Penh", "Build Python services.",
                     url, "fixture", posted_at="2026-11-13")
    return "http", {"url": url, "title": title, "text": job["description"], "links": [], "jobs": [job]}

Fetch.page = page
with TemporaryDirectory() as directory:
    workspace = Workspace(Path(directory) / "workspace", sqlite=True)
    configure(workspace.path, {"setup_complete": True})
    service = Service(workspace)
    service.action("profile", {"name": "Browser profile", "roles": ["Engineer"]})
    instance = server(service, 0)
    def stop(*_):
        raise SystemExit
    signal.signal(signal.SIGTERM, stop)
    try:
        print(instance.server_port, flush=True)
        instance.serve_forever()
    finally:
        instance.server_close()
`;

async function run() {
  const child = spawn(process.env.TEST_PYTHON || path.join(root, ".venv/bin/python"),
    ["-u", "-c", fixture], { cwd: root, stdio: ["ignore", "pipe", "inherit"] });
  let browser;
  try {
    const [line] = await Promise.race([
      once(child.stdout, "data"),
      once(child, "exit").then(() => { throw new Error("Discovery fixture server exited"); }),
    ]);
    const port = Number(String(line).trim());
    assert.ok(port > 0);
    const origin = "http://127.0.0.1:" + port;
    browser = await chromium.launch({ channel: "chrome" });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin + "/search/");
    const heading = page.getByRole("heading", { name: "Find new jobs" });
    await heading.waitFor();
    await page.getByRole("textbox", { name: "Public URLs (one per line)" }).fill(
      "https://fast.example.test/job/python\nhttps://slow.example.test/job/python\n"
      + "https://article.example.test/public\nhttps://limited.example.test/job",
    );
    await page.getByRole("button", { name: "Find jobs", exact: true }).click();
    await page.getByRole("link", { name: "Fast Engineer", exact: true }).waitFor();
    assert.ok(await page.getByRole("button", { name: "Stop search" }).isVisible());
    await page.getByRole("button", { name: "Stop search" }).click();
    await page.getByText(/Search stopped ·/).waitFor();
    await page.getByText("Source checks (some incomplete)", { exact: true }).click();
    await page.getByText("Blocked", { exact: true }).waitFor();
    await page.getByText(/Retrieved pages/).click();
    await page.getByText("Ordinary Public Page", { exact: true }).click();
    await page.getByText("Readable fixture text", { exact: true }).waitFor();
    await heading.scrollIntoViewIfNeeded();
    const output = path.join(root, "output", "playwright", "discovery");
    await fs.mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, "desktop.png") });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await heading.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 390) await page.screenshot({ path: path.join(output, "mobile.png") });
    }
    await page.reload();
    await page.getByText(/Search stopped ·/).waitFor();
    const response = await page.request.get(origin + "/api/state");
    const body = await response.json();
    assert.deepEqual(body.state.jobs.map(job => job.title), ["Fast Engineer"]);
    assert.deepEqual(body.state.applications, []);
    const api = await page.request.post(origin + "/api/discovery-status", {
      data: {},
      headers: { Origin: origin, "X-Workspace-Token": body.token },
    });
    assert.equal(api.status(), 200);
    const { result } = await api.json();
    assert.deepEqual(result.sources[0].job_ids, [body.state.jobs[0].id]);
    assert.deepEqual(errors, []);
    console.log("PASS: discovery shows partial results, stop, blocked sources, public page text and prior results after a reload at desktop and mobile widths");
  } finally {
    await browser?.close();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, "exit");
    }
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
