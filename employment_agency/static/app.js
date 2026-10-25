"use strict";
let state,
  token,
  tab = "career",
  selectedProfile = "",
  ranking = null;
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const safeUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.href : "#";
  } catch {
    return "#";
  }
};
const field = (label, name, value = "", type = "text") =>
  `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}"></label>`;
const area = (label, name, value = "") =>
  `<label>${esc(label)}<textarea name="${name}">${esc(value)}</textarea></label>`;
const check = (label, name, value = false) =>
  `<label class="check"><input type="checkbox" name="${name}" ${value ? "checked" : ""}>${esc(label)}</label>`;
const select = (label, name, values, current = "") =>
  `<label>${esc(label)}<select name="${name}">${values.map(([v, l]) => `<option value="${esc(v)}" ${v === current ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
const button = (label, action, id = "", cls = "secondary") =>
  `<button class="${cls}" data-action="${action}" data-id="${esc(id)}">${label}</button>`;
const list = (s) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
function notice(message, error = false) {
  $("#notice").textContent = message;
  $("#notice").className = error ? "error" : "";
}
async function refresh() {
  const r = await fetch("/api/state");
  if (!r.ok) throw Error("Cannot load workspace");
  const d = await r.json();
  state = d.state;
  token = d.token;
  if (!selectedProfile && state.profiles.length)
    selectedProfile = state.profiles[0].id;
}
async function api(action, args) {
  const r = await fetch("/api/" + action, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Workspace-Token": token },
    body: JSON.stringify(args),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Operation failed");
  return d.result;
}
function career() {
  const i = state.identity;
  return `<div class="grid"><section><h2>Your details</h2><form data-form="identity">${field("Name", "name", i.name)}${field("Email", "email", i.email, "email")}${field("Phone", "phone", i.phone)}${field("Current location / relocation statement", "location", i.location)}${field("Languages", "languages", i.languages)}<div class="actions"><button>Save details</button></div></form></section><section><h2>Build your career evidence</h2><p>Import your master resume, then review each extracted statement. You can add experience that never made it onto your resume.</p><form data-form="import"><label>Resume file<input name="file" type="file" accept=".pdf,.docx,.tex,.txt,.md" required></label><small>Up to 10 MB. Text-based PDFs; scanned files need OCR text. Imported TeX is never executed.</small><div class="actions"><button>Import for review</button></div></form><details><summary>Add experience or a skill</summary>${factForm()}</details></section></div><section><h2>Career facts <span class="pill">${state.facts.filter((f) => f.confirmed && !f.retired && !f.conflict).length} confirmed</span></h2><p class="muted">Only confirmed, conflict-free facts are used. Editing resets confirmation. Use the same conflict key for competing versions of a single claim, such as an employment end date.</p>${
    state.facts
      .filter((f) => !f.retired)
      .map(
        (f) =>
          `<div class="fact"><span class="pill">${f.conflict ? "Conflict — resolve before use" : f.confirmed ? "Confirmed" : "Needs your confirmation"}</span><p>${esc(f.text)}</p><small>${esc([f.association, f.dates, f.source?.name].filter(Boolean).join(" · "))}</small><div class="actions">${!f.confirmed && !f.conflict ? button("Confirm", "confirm", f.id) : ""}${button("Retire", "retire", f.id)}</div><details><summary>Edit fact</summary>${factForm(f)}</details></div>`,
      )
      .join("") ||
    '<p class="empty">No career facts yet. Import a resume or add your first experience above.</p>'
  }</section>`;
}
function factForm(f = {}) {
  return `<form data-form="fact"><input type="hidden" name="id" value="${esc(f.id || "")}">${area("Statement", "text", f.text)}${field("Category (experience, skill, education…)", "category", f.category || "experience")}${field("Employer or project — leave blank if unknown", "association", f.association)}${field("Dates", "dates", f.dates)}${field("Conflict key — optional", "claim_key", f.claim_key)}<div class="actions"><button>Save for confirmation</button></div></form>`;
}
function profileForm(p = {}) {
  return `<form data-form="profile"><input type="hidden" name="id" value="${esc(p.id || "")}">${field("Profile name", "name", p.name)}${field("Roles, comma separated", "roles", (p.roles || []).join(", "))}${field("Locations, highest priority first", "locations", (p.locations || []).join(", "))}${field("Seniority levels", "seniority", (p.seniority || []).join(", "))}${field("Work arrangements", "arrangements", (p.arrangements || []).join(", "))}${field("Hard filter categories: roles, locations, seniority, arrangements", "hard", (p.hard || ["roles", "locations"]).join(", "))}${field("Exclude employers, industries or keywords", "exclude", (p.exclude || []).join(", "))}${field("Confirmed work rights (context for your review)", "work_rights", (p.work_rights || []).join(", "))}${check("Require employer sponsorship", "needs_sponsorship", p.needs_sponsorship)}<div class="grid">${field("Private minimum gross base", "minimum", p.minimum || 0, "number")}${field("Currency", "currency", p.currency || "USD")}</div>${select(
    "Pay period",
    "period",
    [
      ["month", "Monthly"],
      ["year", "Annual"],
      ["hour", "Hourly"],
    ],
    p.period || "month",
  )}${select(
    "Document style",
    "template",
    [
      ["navy", "Navy"],
      ["plain", "Plain"],
    ],
    p.template || "navy",
  )}${check("Include stretch roles with missing evidence", "include_stretch", p.include_stretch)}${check("Prepare drafts when eligibility or other checks need confirmation", "include_unknown", p.include_unknown)}<button>Save profile</button></form>`;
}
function jobForm() {
  return `<form data-form="job">${field("Job title", "title")}${field("Employer", "employer")}${field("Exact location", "location")}${field("Source URL", "url", "", "url")}${field("Recruiter email — if the advert requests email", "email", "", "email")}${area("Paste the job advert", "description")}${area("Requirements — one per line, review extracted requirements yourself", "requirements")}${field("Closing date — if stated", "closes", "", "date")}${field("Seniority — if stated", "seniority")}${select(
    "Work arrangement",
    "work_arrangement",
    [
      ["unknown", "Unknown"],
      ["onsite", "Onsite"],
      ["hybrid", "Hybrid"],
      ["remote", "Remote"],
    ],
  )}${select("Your eligibility for this specific job", "eligibility", [
    ["unknown", "Needs confirmation"],
    ["confirmed", "Confirmed"],
    ["conflict", "Confirmed conflict"],
  ])}${select("Sponsorship", "sponsorship", [
    ["unknown", "Unknown"],
    ["yes", "Available"],
    ["no", "Unavailable"],
  ])}${select("Prior application", "prior_application", [
    ["none", "None recorded"],
    ["submitted", "Already submitted"],
    ["rejected", "Previously rejected"],
  ])}${select("Availability", "availability", [
    ["unverified", "Not verified"],
    ["retrieved", "I checked the live vacancy"],
    ["closed", "Closed"],
  ])}<details><summary>Salary evidence and expectation</summary>${field("Advertised minimum", "salary_min", 0, "number")}${field("Advertised maximum", "salary_max", 0, "number")}${field("Currency", "salary_currency", "USD")}${select(
    "Pay period",
    "salary_period",
    [
      ["month", "Monthly"],
      ["year", "Annual"],
      ["hour", "Hourly"],
    ],
  )}${select("Pay basis", "salary_basis", [
    ["unknown", "Unknown"],
    ["gross_base", "Gross base"],
  ])}${field("Proposed expectation", "expectation_target")}${area("Reason and evidence", "expectation_basis")}${field("Salary source URL", "expectation_source")}${select(
    "Confidence",
    "expectation_confidence",
    [
      ["low", "Low"],
      ["medium", "Medium"],
      ["high", "High"],
    ],
  )}</details><div class="actions"><button>Save job</button></div></form>`;
}
function search() {
  const p = state.profiles.find((p) => p.id === selectedProfile);
  return `<div class="grid"><section><h2>Search profiles</h2>${select(
    "Active profile",
    "active_profile",
    state.profiles.map((p) => [p.id, p.name]),
    selectedProfile,
  )}<details><summary>Create another profile</summary>${profileForm()}</details>${p ? `<details><summary>Edit ${esc(p.name)}</summary>${profileForm(p)}</details>` : "<p>Start by saving your first search profile.</p>"}</section><section><h2>Live sources</h2><p>Search configured employer boards. Coverage is limited to these boards and jobs imported below; use your coding agent for broader research.</p><form data-form="source">${select(
    "Adapter",
    "kind",
    [
      ["greenhouse", "Greenhouse"],
      ["lever", "Lever"],
    ],
  )}${field("Employer board identifier", "board")}<button>Add source</button></form>${state.sources.map((s) => `<p>${esc(s.kind + ": " + s.board)} <span class="pill">${esc(s.status)}</span> ${button("Refresh", "discover", s.id)}<br><small>${esc(s.checked_at || "Not checked")} ${esc(s.error || "")}</small></p>`).join("")}</section></div><section><h2>Add an opportunity</h2><form data-form="url">${field("Job URL with JobPosting structured data", "url", "", "url")}<button>Import URL</button></form><details><summary>Paste an advert or add details manually</summary>${jobForm()}</details></section><section><h2>Find your best matches</h2><p>Evidence and constraints guide the ordering. Related words do not prove that a requirement is met.</p><div class="actions">${button("Rank saved jobs", "rank", "", "")}${button("Start a run", "show-run", "", "")}</div><div id="run-form" hidden>${runForm()}</div><details><summary>Saved jobs (${state.jobs.length})</summary>${state.jobs.map((j) => `<p>${esc(j.title)} · ${esc(j.employer)} ${button("Edit details", "edit-job", j.id)}</p>`).join("")}</details>${ranking ? ranking.map(({ job: j, match: m }) => `<article><h3>${esc(j.title)} · ${esc(j.employer)}</h3><p>${esc(j.location)} <span class="pill">${m.eligible_for_preparation ? "Can prepare for review" : "Not in automatic batch"}</span></p><p class="error">${esc(m.hard_conflicts.join("; "))}</p><p class="warning">${esc(m.unknowns.join("; "))}</p><p>${esc(m.gaps.length ? "Missing evidence: " + m.gaps.join("; ") : "")}</p><details><summary>Requirement evidence and job details</summary><pre>${esc(JSON.stringify({ requirements: m.evidence, preferences: m.preferences, salary: j.salary, expectation: m.salary_expectation, description: j.description }, null, 2))}</pre></details><a href="${esc(safeUrl(j.url))}" target="_blank" rel="noopener noreferrer">Original listing</a><div class="actions">${button("Prepare a new local version", "local-package", j.id)}${button("Download agent handoff", "handoff", j.id)}</div><details><summary>Import agent fact selection</summary><form data-form="agent-package"><input type="hidden" name="job_id" value="${esc(j.id)}">${area("JSON response containing fact_ids", "selection")}<button>Prepare from selected facts</button></form></details></article>`).join("") : '<p class="empty">Choose a search profile and rank your saved jobs.</p>'}</section><section><h2>Runs</h2><div id="runs">${runs()}</div></section>`;
}
function runForm() {
  return `<form data-form="run">${field("Maximum applications", "count", 5, "number")}${check("Refresh configured live sources first", "discover", true)}${select(
    "Preparation mode",
    "mode",
    [
      ["local", "Local fact-based templates — no AI cost"],
      ["openai", "OpenAI fact selection — paid API"],
    ],
  )}<details><summary>OpenAI run configuration</summary><p>Grant consent in Settings and set OPENAI_API_KEY in the launcher environment. Enter current model pricing. Reservations are conservative estimates based on your rates, not a provider billing guarantee; also set provider-side limits.</p>${field("Model ID", "model")}${field("Input USD per million tokens", "input_per_million", 0, "number")}${field("Output USD per million tokens", "output_per_million", 0, "number")}${field("Maximum run budget USD", "budget", 0, "number")}${check("I checked the rates and approve this run budget", "approve_budget")}</details><button>Start bounded run</button></form>`;
}
function runs() {
  return (
    state.runs
      .map(
        (r) =>
          `<p><strong>${esc(r.profile.name)}</strong> · ${esc(r.status)} · ${r.packages.length}/${r.count} packages<br><small>${esc(r.note || "")} Reserved: $${r.reserved.toFixed(4)}</small></p>${r.errors.length ? `<pre class="error">${esc(JSON.stringify(r.errors, null, 2))}</pre>` : ""}<div class="actions">${r.status === "running" ? button("Cancel after current operation", "cancel", r.id) : ["paused", "failed", "cancelled"].includes(r.status) ? button("Resume", "resume", r.id) : ""}</div>`,
      )
      .join("") || "<p>No runs yet.</p>"
  );
}
function applications() {
  return `<section><h2>Your application packages</h2><p>Each package is an immutable version. Review both PDFs, then download an email draft or open the employer page. Marking submitted records your own action; it does not send anything.</p></section>${
    state.applications
      .map((a) => {
        const job = state.jobs.find((j) => j.id === a.job_id) || {};
        return `<article><h2>${esc(a.title)}</h2><p>${esc(a.employer)} <span class="pill">${esc(a.status)}</span> <small>${esc(a.created_at)}</small></p><div class="actions">${["resume.pdf", "cover-letter.pdf", "resume.docx", "cover-letter.docx", "resume.tex", "cover-letter.tex", "application.eml", "evidence.json"].map((f) => `<a class="button" href="/files/${a.id}/${f}" download>${esc({ "resume.pdf": "Resume PDF", "cover-letter.pdf": "Cover letter PDF", "resume.docx": "Edit resume (Word)", "cover-letter.docx": "Edit cover letter (Word)", "resume.tex": "Resume LaTeX", "cover-letter.tex": "Cover letter LaTeX", "application.eml": "Email draft", "evidence.json": "Source evidence" }[f] || f)}</a>`).join("")}</div><p><a href="${esc(safeUrl(job.url))}" target="_blank" rel="noopener noreferrer">Open application listing</a></p><form data-form="review"><input type="hidden" name="id" value="${a.id}">${area("Comments", "comment")}${select(
          "Review decision",
          "status",
          a.status === "submitted"
            ? [["submitted", "Submitted — record preserved"]]
            : [
                ["draft", "Draft"],
                ["reviewed", "Reviewed"],
                ["rejected", "Rejected"],
                ["submitted", "I manually submitted this reviewed version"],
              ],
          a.status,
        )}<button>Save decision</button></form>${a.comments.map((c) => `<p><small>${esc(c.at)} · ${esc(c.status)}</small><br>${esc(c.text)}</p>`).join("")}</article>`;
      })
      .join("") || "<p>No applications yet.</p>"
  }`;
}
function settings() {
  return `<div class="grid"><section><h2>AI disclosure consent</h2><p>Granting consent allows <strong>confirmed career facts and job descriptions</strong> to be shared with the selected provider for <strong>selecting application facts</strong>. Contact details and salary minimums are not included by this integration. An agent running on your computer may independently access other files you authorize.</p>${["agent", "openai"].map((provider) => `<h3>${provider === "agent" ? "Connected coding agent" : "OpenAI API"}</h3><p>${state.consents[provider] ? "Consent granted" : "No consent granted"}</p><div class="actions">${button("Grant consent", "grant", provider)}${button("Revoke", "revoke", provider)}</div>`).join("")}<p class="muted">Revocation prevents future app-controlled requests; it cannot recall previously disclosed data. API keys are read only from OPENAI_API_KEY, never from this UI.</p></section><section><h2>Recovery and upgrades</h2><p>Download an export before upgrades. It includes your private facts and applications, so store it privately. Credentials and consent grants are excluded. Restore to a new workspace using the CLI; existing files are never overwritten.</p>${button("Export private workspace", "export", "", "")}<pre>employment-agency restore backup.zip NEW_FOLDER</pre><p class="muted">Keep your installed release pinned. Runs snapshot before starting. Exporting to the same computer is not an off-device backup.</p></section></div>`;
}
function render() {
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) =>
      b.setAttribute("aria-current", String(b.dataset.tab === tab)),
    );
  $("#content").innerHTML = { career, search, applications, settings }[tab]();
}
function download(name, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.addEventListener("change", (e) => {
  if (e.target.name === "active_profile") {
    selectedProfile = e.target.value;
    ranking = null;
    render();
  }
});
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.tab) {
    tab = b.dataset.tab;
    notice("");
    render();
    return;
  }
  if (!b.dataset.action) return;
  e.preventDefault();
  b.disabled = true;
  try {
    const action = b.dataset.action,
      id = b.dataset.id;
    if (action === "edit-job") {
      const job = state.jobs.find((j) => j.id === id);
      const form = document.querySelector("form[data-form=job]");
      form.closest("details").open = true;
      for (const [key, value] of Object.entries(job)) {
        const input = form.elements.namedItem(key);
        if (input)
          input.value = key === "requirements" ? value.join("\n") : value;
      }
      for (const [key, value] of Object.entries(job.salary || {})) {
        const input = form.elements.namedItem("salary_" + key);
        if (input) input.value = value;
      }
      for (const [key, value] of Object.entries(job.expectation || {})) {
        const input = form.elements.namedItem("expectation_" + key);
        if (input) input.value = value;
      }
      let input = form.elements.namedItem("id");
      if (!input) {
        input = document.createElement("input");
        input.type = "hidden";
        input.name = "id";
        form.append(input);
      }
      input.value = id;
      form.scrollIntoView({ block: "start" });
      return;
    }
    if (action === "show-run") {
      $("#run-form").hidden = false;
      return;
    }
    if (action === "local-package") {
      if (!selectedProfile) throw Error("Choose a search profile first");
      await api("local-package", { job_id: id, profile_id: selectedProfile });
    } else if (action === "rank") {
      if (!selectedProfile) throw Error("Save a search profile first");
      ranking = await api("rank", { profile_id: selectedProfile });
    } else if (action === "handoff") {
      download("agent-handoff.json", await api("handoff", { job_id: id }));
      notice(
        "Handoff downloaded. Share it only with the agent you consented to use.",
      );
      return;
    } else if (action === "grant" || action === "revoke") {
      await api("consent", {
        provider: id,
        grant: action === "grant",
        purpose: "select_application_facts",
        categories: ["confirmed_facts", "job_description"],
      });
    } else if (action === "export") {
      const r = await api("export", {});
      location.href = "/exports/" + r.file;
      notice("Export ready. It contains private data.");
      return;
    } else {
      const r = await api(action, { id });
      if (r?.error) throw Error(r.error);
    }
    await refresh();
    render();
    notice("Saved.");
  } catch (err) {
    notice(err.message, true);
  } finally {
    b.disabled = false;
  }
});
document.addEventListener("submit", async (e) => {
  const f = e.target;
  if (!f.dataset.form) return;
  e.preventDefault();
  const b = f.querySelector("button");
  b.disabled = true;
  try {
    const action = f.dataset.form,
      a = Object.fromEntries(new FormData(f));
    f.querySelectorAll("input[type=checkbox]").forEach(
      (x) => (a[x.name] = x.checked),
    );
    if (action === "import") {
      const file = a.file;
      if (!file || file.size > 10 * 1024 * 1024)
        throw Error("Choose a file up to 10 MB");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 8192)
        bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
      a.name = file.name;
      a.data = btoa(bin);
      delete a.file;
    }
    if (action === "profile") {
      for (const key of [
        "roles",
        "locations",
        "seniority",
        "arrangements",
        "hard",
        "exclude",
        "work_rights",
      ])
        a[key] = list(a[key]);
      a.minimum = Number(a.minimum);
    }
    if (action === "job") {
      a.requirements = a.requirements
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      a.salary = {
        min: Number(a.salary_min),
        max: Number(a.salary_max),
        currency: a.salary_currency,
        period: a.salary_period,
        basis: a.salary_basis,
      };
      a.expectation = {
        target: a.expectation_target,
        basis: a.expectation_basis,
        source: a.expectation_source,
        confidence: a.expectation_confidence,
      };
    }
    if (action === "run" || action === "agent-package") {
      if (!selectedProfile) throw Error("Save a profile first");
      a.profile_id = selectedProfile;
    }
    if (action === "agent-package") a.selection = JSON.parse(a.selection);
    const result = await api(action, a);
    if (action === "profile") selectedProfile = result.id;
    await refresh();
    render();
    notice(
      action === "import"
        ? `${result.candidates} candidate facts imported; review before confirming.${result.truncated ? " Import truncated at 500 candidates." : ""}`
        : "Saved.",
    );
  } catch (err) {
    notice(err.message, true);
  } finally {
    b.disabled = false;
  }
});
refresh()
  .then(render)
  .catch((e) => notice(e.message, true));
setInterval(async () => {
  if (state?.runs.some((r) => r.status === "running")) {
    try {
      await refresh();
      if ($("#runs")) $("#runs").innerHTML = runs();
    } catch (e) {
      notice(e.message, true);
    }
  }
}, 2000);
