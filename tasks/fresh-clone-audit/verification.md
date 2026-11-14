# Fresh-clone audit evidence

Date: 14 November 2026 (Australia/Melbourne). Fresh GitHub baseline: `5745b56d1c0f1f16800608d91af92bbbab447faa`. Candidate changes are local; these results do not describe a deployed update. [Plan](plan.md) · [Task status](todo.md) · [Findings and fixes](findings.md)

## Review method and acceptance rounds

- Three GPT-6.1 Sol agents independently tested first-user setup, gate enforcement and the broader feature contracts. They used separate clones, fictional identities, loopback services and isolated workspaces/configuration.
- The first walkthrough reproduced misleading first-workspace, master-import and profile states despite the baseline suites passing. Failing regression checks established the master-status and newline-location causes before fixes. Gate tests reproduced missing ordinary shell classifications and unrelated hook matcher mutation. CLI tests reproduced EOF/terminal input problems.
- The owner chose a separate personal workspace as the main README path and local macOS/Windows/Linux scope, with development and hosted/connected execution documented separately. [ADR 0017](../../docs/adr/0017-personal-workspace-first-onboarding.md)
- A new fourth GPT-6.1 Sol agent, without the initial findings or implementation discussion, cloned GitHub again and overlaid only the candidate source diff/new files. It followed the revised README and first-application guide. This is a fresh-clone candidate check, not a claim that GitHub already contains these edits.
- Round two verified installation with spaces/apostrophes, custom API port, gate setup/diagnostic, master review and individual fact selection, contact entry, ordered multiline locations, matching versus Browse, exact saved-role deep link, CV/cover letter, agent queue, and intercepted self-apply handoff. An initial import scroll concern was disproved by clean desktop/mobile focus checks. Small remaining button/backup-link/continuation wording gaps were corrected.
- Self-apply evidence was explicitly synthetic. The reviewer intercepted the app's real redirect, checked the destination, and served local fixture HTML. Recording a synthetic user report and restoring it verifies the app's record boundary, not acceptance by a real employer.

## Environment

Executed on macOS. Fresh source setup used Python 3.15.2 and Node 24.22.0; broader contract/integration checks used an isolated Python 3.13 environment with optional application dependencies. Chrome and Playwright's WebKit were available. The repository's locked Playwright library/harness was used; no missing global browser skill was installed. The actual gate dispatcher check used Codex `0.167.0-alpha.4.1` with local synthetic model/MCP services and no credentials or model credits.

The temporary audit copies and raw logs are outside the public source tree under `/tmp/employment-agency-audit-20261114-6h3wSB/`. Reports summarise durable evidence; temporary paths are not a backup guarantee.

## Commands and outcomes

Commands run from a fresh source checkout/candidate unless noted. `python` below means the isolated environment's interpreter. The README's install commands were also executed literally, substituting only isolated workspace/config paths and ports.

| Criterion/check | Command or method | Outcome |
| --- | --- | --- |
| Fresh installation/start/stop | README `venv`, `npm ci --ignore-scripts`, build, `pip install .`, `init`, `serve`; separate development startup and Ctrl+C | Passed in initial and second-user clones. Real private workspace was not opened for testing. |
| Dependency audit | `npm --prefix frontend audit --audit-level=moderate` | Candidate passed with zero reported vulnerabilities; dependency lock unchanged. |
| Type/lint/build | `npm --prefix frontend run typecheck`, `run lint`, `run build` | Passed on candidate; final text-only build checked separately. |
| Frontend regressions | `npm --prefix frontend test` | 368 tests passed across 32 files. Final job-link test checks canonical route and exact role/profile/query rather than a brittle trailing slash. |
| Python contracts | `python -m unittest discover -s tests -v` | 339 tests passed with optional dependencies installed. Earlier base-only environment reported explicit optional-dependency skips; not used to claim those integrations passed. |
| Deployment scripts | `node --test tests/check-public-demo.test.mjs tests/stage-public-demo.test.mjs tests/promote-public-demo.test.mjs` | 108 candidate tests passed. No deployment performed. |
| Local/hosted browser workflows | `python tests/run_browser_checks.py`, plus focused isolated reruns for changed selectors | All 27 workflows passed across the main run and isolated final-fixture rerun after updating a stale master label. Renamed setup/master/profile labels required matching test selectors; behavior assertions were retained. The final copy-only build also passed the focused application journey. |
| Wheel distribution | `python -m pip wheel --no-deps . --wheel-dir ...`; `python tests/check_wheel.py --browser ...whl` | Final candidate wheel passed packaged CLI/routes/queues/documents, exact submitted bytes and recovery after the last UI copy edit. |
| Optional applications | `python tests/run_apply_checks.py` | Passed 33 focused agent contracts and controlled browser/connection/UI fixtures. No real Gmail send or employer upload. |
| Live development | `python tests/check_development.py`; `python tests/check_private_development.py` | Candidate passed real Next proxy/Fast Refresh, Caddy/private gateway, Python reload and shutdown. The private harness prints its corrected evidence banner. |
| Hosted install ordering | `python tests/check_hosted_install.py` | Candidate pre-frontend dependency bootstrap passed. |
| Static public preview | `npm --prefix frontend run build:preview`; `python tests/run_public_preview_checks.py` | Final candidate static build and both preview browser checks passed. |
| Gate response/setup | `python -m unittest discover -s tests -p test_codex_job_research_gate.py -v` | 11 focused tests passed: HTTP failure/redirect/malformed schema/path mismatch/timeouts, follow-ups, recovery, matcher coverage, preservation and diagnostic. |
| Actual Codex dispatch | `python3 tests/check_codex_research_gate.py` | Eight cases passed: shell, MCP search, MCP browser and nested code-mode calls each denied on 503 with no downstream dispatch, then dispatched on 200. Exactly fresh lookup calls; native hosted WebSearch absent. |
| No-input CLI | `python -m unittest discover -s tests -p test_cli.py -v` | Four subprocess cases passed, including actual Unix PTY, EOF, valid pipe/file, UTF-8, malformed JSON and unchanged identity after missing mutation input. |
| Source/docs consistency | Relative file and heading links; `git diff --check`; source comparison before integration | No broken edited-document links or whitespace errors; no concurrent-content conflicts at integration preflight. |

## Feature coverage and practical limits

| Feature | Demonstrated evidence | Limits |
| --- | --- | --- |
| Workspace initialization/switching | Fresh browser flow, folder fixture, tokens/stale-tab protections, CLI/dev lifecycle | Native OS folder chooser is simulated in the workflow suite. |
| Master and supplemental CV evidence | PDF/DOCX/TeX/MD/TXT imports, invalid/scan handling, selected-fact acceptance, conflicts, format replacement and submitted-byte preservation | Arbitrary templates, all scanners and Office app behavior are not exhaustively verified. |
| Profiles/locations and ranking | Priority order, newline paste regression, work models, known mismatches, uncertainty, salary and matching contracts | No live employer eligibility or user work-rights claim established. |
| Discovery/source management | Structured/manual imports, adapters, partial/failing/cancelled sources, cooldown preflight, retained results | Fixtures verify behavior; no claim of exhaustive real job-source coverage or paid provider availability. |
| Companies and allowance | Aliases/history/requisitions, remaining slots, cooldown, first-time priority, reservations and outcome recording | Submissions made outside recorded app/agent context cannot be observed automatically. |
| Application documents/history | CV, cover letter, editable files, preserved versions, editor, removal/restore and history integrity | Real employer acceptance is outside this check. |
| Self-apply | Exact version/context, company confirmation, checked local redirect, recorded synthetic outcome, Submitted view, immutable restore | No live upload or submission. |
| Connected agent | Runtime readiness, scoped authorization, queues, stop/resume/failure/receipt fixtures and channel ordering | No real signed-in model execution or Gmail OAuth/send. Telegram connection remains unavailable as documented. |
| Settings/recovery/security | Themes, consent, exports/restores, SQLite/snapshot recovery, origin/token/path protections | Production hosted identity/storage and live Tailscale access untested. |
| Responsive/accessibility | Chrome and WebKit emulation, 320/390/768/1024/1440 coverage across harnesses, keyboard/focus, Axe, reduced motion, 200% text | No physical phone or screen-reader user session. |
| Codex gate | Actual installed dispatch and subprocess failure checks, config preservation, diagnostic | Trust UI and built-in browser not directly exercised. Hooks are not an OS network sandbox; unsupported/hosted transports and invocation failures remain documented boundaries. |

## Not run and external limitations

Native Windows/Linux execution was not available in this macOS audit. Their instructions and existing CI matrix were inspected; this does not mean the changed candidate passed remote CI. Hosted production, real OAuth/provider credentials, physical iPhone, paid services and employer submissions were not exercised. None is silently counted as passed. There is no claim that all possible users, documents and websites are free of confusion.

## Final repeat and integration

The second independent reviewer closed with **no remaining reproduced first-user setup or usage confusion in the verified paths** after the last documentation corrections. Desktop/mobile focus, exact saved-role navigation, selective facts, local handoff, fictional Submitted evidence and backup restoration all passed. Its disposable app sessions were stopped.

Final typecheck/lint/build, the affected employer-confirmation browser journey, installed-wheel browser verification and static preview build/browser checks all passed. The complete candidate evidence comprises 339 Python tests, 368 frontend tests, 108 deployment-script tests and all 27 browser workflow invocations. The browser run stopped at one outdated test label after 22 workflows; the corrected remaining fixtures passed. This is accurately reported as combined runs rather than one uninterrupted green command. A separate smoke helper's reused first-launch fixture was corrected to isolated fixtures; no product failure was hidden.

Integrated 43 intentional source, test and documentation files into the shared software checkout after checking each target against the fresh-clone baseline; no concurrent-content conflicts occurred. Existing unrelated local work was preserved. Candidate/source contents matched byte-for-byte after integration. The 11 gate tests also passed from the actual shared checkout. This did not commit, push, deploy or upgrade the owner's installed private workspace.

Durable reproduction commands are above and the optional real-dispatch fixture is checked in under `tests/check_codex_research_gate.py`. The audit's original reports and full raw logs remain in the temporary audit directory. Meaningful caveats are in the coverage table; the absence of findings in this bounded review is not a universal usability guarantee.
