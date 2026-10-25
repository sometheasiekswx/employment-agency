# Employment Agency

![Application review with fictional example data](docs/preview.png)

A local-first career workspace that turns confirmed experience into job-specific applications you review and submit yourself.

Import your resume, add the experience it leaves out, save search preferences, and prepare a bounded batch of applications. Every match shows its evidence and gaps. Every document uses confirmed facts. Your workspace stays separate from this software repository.

## Start locally

Requires Python 3.11+ and a modern browser. No API key is needed for local matching and document generation.

```sh
git clone https://github.com/sometheasiekswx/employment-agency.git
cd employment-agency
python3 -m venv .venv
.venv/bin/python -m pip install .
.venv/bin/employment-agency serve
```

Windows PowerShell:

```powershell
py -3 -m venv .venv
.venv\Scripts\python -m pip install .
.venv\Scripts\employment-agency serve
```

Open **http://127.0.0.1:8766**. The default workspace is `~/.employment-agency/workspace`, outside the checkout. For another private workspace:

```sh
employment-agency --workspace /path/to/private-workspace serve --port 8766
```

The server only binds to loopback. Do not reverse-proxy it onto a public network. Keep the launcher running while using the UI.

## From experience to applications

1. **Career:** import PDF, DOCX, LaTeX or text. Edit extracted statements, add employer/project and date context where known, then confirm. Add supplemental experience through the same form. Retire contradictory facts; conflicting claim keys prevent use.
2. **Search:** save multiple role/location/seniority/salary profiles. Locations are ordered by priority. Distinguish hard filters from preferences. Choose explicitly whether to include stretch roles and uncertain eligibility.
3. **Discovery:** configure Greenhouse or Lever employer boards, import a structured job URL, paste an advert, or use a connected coding agent. Public-board identifiers come from the employer's board URL. There is no universal web/job-board search in the local adapter; agent handoff supports broader research.
4. **Rank:** inspect requirement evidence, unknown work rights and salary information. Lexical matching is explainable but is not a qualification assessment. Review each requirement; no ATS-pass promise.
5. **Prepare:** run locally without an AI service, or enable OpenAI fact selection. Runs are bounded, resumable and cancellable between operations. Weak matches do not pad the batch, and existing packages are not automatically duplicated. Use a match’s “Prepare a new local version” action for deliberate regeneration. Shorten long facts or select fewer if the two-page resume/one-page letter limit is exceeded.
6. **Review:** inspect PDF and editable DOCX, record comments/rejections, download an EML draft with the exact PDFs, or open the employer listing. Sending and submission are always yours. Record a manual submission only after reviewing the version.

## AI is optional

Local mode selects relevant facts and produces structured templates. It is intentionally conservative: it assembles confirmed statements rather than inventing persuasive claims. Agent mode exports a scoped handoff; an agent returns ordered fact IDs through the same validator. See [the agent contract](docs/agents.md).

OpenAI mode uses the Responses API to select fact IDs. Grant consent in Settings for `confirmed_facts` and `job_description`, then set `OPENAI_API_KEY` in the launcher environment. Enter a model and current input/output prices and approve each run budget. No key is stored in workspace data. Paid requests are not used by tests. Budget reservations are conservative calculations using **your supplied rates**, not a provider billing guarantee; also configure account-side limits. Failed/uncertain requests retain their reservation and are not automatically retried.

The app omits contact details and private salary minimums from AI payloads. A coding agent independently given access to your files has its own access/consent boundary. Local-first does not mean cloud AI runs offline.

## Documents and limitations

- Navy and plain styles; editable DOCX and text-based PDF resumes and cover letters.
- Safe generated LaTeX sources for optional local compilation; imported TeX is never executed. TeX compilation needs your own LaTeX installation (`latexmk -pdf -no-shell-escape resume.tex` in a separate copy of the package).
- PDF fonts currently support Latin-script application text. Unsupported text fails validation instead of silently shipping missing characters. Scanned PDFs need externally supplied OCR text. Arbitrary source layouts are not reproduced.
- Matching is lexical and relies on job metadata. Missing sponsorship, salary, seniority or location data remains unknown. There is no automated immigration/legal advice or universal salary benchmark.
- Listings can close after retrieval. The UI marks stale/unknown evidence and exposes source failures. Recheck before applying.
- EML handling varies by mail client: open/import the draft and inspect its attachments. The app has no send endpoint.

## Recovery and pinned upgrades

```sh
employment-agency --workspace /path/to/private-workspace export backup.zip
employment-agency restore backup.zip /path/to/new-restored-workspace
```

Exports include private data, exclude credentials and clear consent on restore. Existing restore destinations are rejected. A run snapshots the workspace before work starts. Keep an off-device copy yourself; local snapshots alone are not off-device backups.

Pin an installed version or Git commit. Export before upgrading, test a restored copy with the new version, then explicitly switch. Version 0.1 uses schema 1 and rejects unknown schemas without changing data. No automatic updates or background schedules.

## Development

```sh
python -m unittest discover -s tests -v
node --check employment_agency/static/app.js
```

Browser acceptance: start an empty disposable workspace, install/use Playwright separately, then `PLAYWRIGHT_PATH=/path/to/playwright TEST_URL=http://127.0.0.1:8766 node tests/browser.cjs`. The test uses fictional data and changes that workspace. See [verification](docs/verification.md), [security](SECURITY.md) and [dependency notes](docs/dependencies.md).

MIT for original code. This repository includes no personal resumes, mailbox exports or private application history.
