# Connected applications

The connected application agent runs in the local SQLite app. The role workspace shows **Apply for me** when it detects a ChatGPT-signed-in Codex runtime and an available channel for that role. **Apply later** adds a role to **To apply**. You can open it there to apply yourself, select roles to start together, or copy the selected roles’ context to an external agent. Saving and copying leave submission authority with the user.

## Starting and returning to a run

Starting authorizes preparing, disclosing the required information and documents, and submitting for the selected roles. The local app verifies the hiring employer, live company allowance, destination and selected version. It prepares a version from confirmed facts if one is needed. The runtime uses the existing ChatGPT usage allowance for GPT‑6.1 Sol at Max and receives the selected role title, employer and channel types. The local app retains control of the destination, contact information, exact document bytes and submission evidence.

Role instructions determine the allowed channels. Otherwise, the agent tries the verified website, then Telegram, then recruitment email. A confirmed outcome finishes the run. A verified unavailable channel can advance to the next available channel. Sign-in, verification, unsupported forms and missing answers appear as **Needs your help**. Any unresolved outcome after possible disclosure requires checking the channel before further attempts.

You can close the tab while the local app and computer are running. Open the role or To apply to check progress, answer a question or choose **Stop**. A Stop request interrupts pending work. If a send was already underway, wait for the returned outcome and reconcile it where required. After a restart, the app offers **Resume** only at a checkpoint known to precede disclosure. Start authority expires after 24 hours and belongs to the originating workspace and path. A restored copy retains the audit trail and needs a new start. The app records verified channel evidence first and links it to the submitted version. If the second step fails, **Record receipt** completes the local record using the existing evidence.

## Channel support

- Website uses isolated Chrome to inspect bounded, same-endpoint HTML forms reached over verified public HTTPS. It supports labelled fields and exact CV and cover-letter uploads through compatible forms. Sites that require JavaScript, login, verification, a separate vacancy selector or another submission endpoint need the user to continue on the site.
- Telegram requires a scoped personal connection. The current runtime reports that connection as unavailable. Controlled tests prove channel order, recipient checks, exact attachments and receipt handling through a recording adapter.
- Email uses the app’s Gmail connection with the verified sender, recipient and both application PDFs. A Gmail message identifier establishes provider acceptance. Recipient delivery and employer acceptance are separate outcomes.

For self-apply, choose **Open application site** from the CV and use **I've applied** to record the actual time, channel and evidence after returning. The listing link remains available separately. When a manual record was entered by mistake, **Correct submission record…** preserves its original snapshot and creates a recovered draft with the same verified documents.

## Install the optional local connections

Keep your existing installation available while testing the new version. Build the source in a separate environment, using a disposable workspace first:

```sh
cd /path/to/employment-agency
python3 -m venv .venv-apply
npm --prefix frontend ci --ignore-scripts
npm --prefix frontend run build
.venv-apply/bin/python -m pip install '.[apply]'
.venv-apply/bin/python -m employment_agency apply-doctor
.venv-apply/bin/python -m employment_agency --workspace /path/to/new-disposable-workspace init
.venv-apply/bin/python -m employment_agency --workspace /path/to/new-disposable-workspace serve
```

Build the frontend before installing a wheel/source distribution if the checkout has no exported assets yet. Google Chrome and Codex CLI are separate local dependencies. The isolated worker uses the CLI’s existing file-based ChatGPT login. It supports Codex build `0.167.0-alpha.4.1`, whose experimental tool interface the fixture verified. Other builds stay unavailable until their tool boundary is verified. `apply-doctor` reports dependency and sign-in presence. The role’s capability check also verifies the isolated protocol and local channel readiness. [Contributor instructions](../CONTRIBUTING.md)

## If the agent is unavailable

A prepared CV and **Open application site** remain usable without a connected agent. To diagnose agent setup, use `apply-doctor` with the same Python that starts the app:

| Report or message | Next step |
| --- | --- |
| Missing Playwright, keyring or Google OAuth library | Install `.[apply]` in that Python environment, as above. |
| Missing Chrome | Install Google Chrome locally; browser automation needs it. |
| Missing, unsupported or unsigned-in Codex | Install/use the documented supported CLI build and sign in through Codex. The app does not install or sign in for you. |
| Verify a destination for this role | Check the role's official application URL, employer identity and any instructions; this is role data, separate from runtime setup. |
| Telegram connection unavailable | Use the verified website or available email channel, or continue manually. Telegram execution is not implemented. |
| Gmail not connected or secure storage unavailable | Follow the connection instructions below. Current secure credential storage supports macOS Keychain; do not work around it by storing tokens in the workspace. |
| Needs your help after a possible send | Check the destination or Sent folder and reconcile the outcome before retrying. |

The available channel list is verified per role. A dependency diagnostic alone does not prove a particular employer form is supported.

## Connect Gmail

Create a Google Cloud **Desktop app** OAuth client, enable the Gmail API, configure the consent screen and any test users, and download the client JSON outside the career workspace. Connect the app using that file.

```sh
.venv-apply/bin/python -m employment_agency connect-gmail /absolute/path/to/google-desktop-client.json
```

The system browser asks for Gmail sending and basic verified Google-email identity permissions. The access/refresh token and client configuration are stored through the macOS Keychain backend, not a plaintext fallback. Nothing is written into a career workspace, public repository or export. The app does not request mailbox reading; uncertain outcomes require your own Sent-folder check. A Gmail message identifier establishes provider acceptance, not recipient delivery.

Disconnect this app's local credentials:

```sh
.venv-apply/bin/python -m employment_agency disconnect-gmail
```

You can also revoke the grant in your Google account. Never paste tokens, client secrets or cookies into an issue/chat. A configured Gmail connector in Codex/ChatGPT is separate from this app's connection; the app cannot inherit this chat's tools or OAuth permissions.

## Previous application attempts

Previous Gmail and LinkedIn attempts remain in the role’s **Activity**. Their original `apply-*` operations retain explicit fingerprint approval for the final send and the previous uncertain-outcome reconciliation rules. Older browser sessions use the machine’s application configuration directory at `apply/browser`. The connected journey uses its own start authorization. [Authorization decision](adr/0016-authorize-role-submission-when-starting-agent.md)

## Verification

With the optional dependencies installed, run all controlled connection, browser-adapter and interface checks together:

```sh
.venv/bin/python tests/run_apply_checks.py
```

Use `.venv-apply/bin/python` instead if you installed the optional connections in the separate environment above. The frontend dependencies and Chrome must also be present. The runner creates and removes disposable workspaces automatically.

```sh
.venv/bin/python -m unittest discover -s tests -p test_application_delivery.py -v
.venv/bin/python tests/check_apply_browser.py
```

The first uses recording transports. The second drives actual Chrome against a loopback-only form fixture and checks custom résumé bytes, wrong/stored attachment rejection, changed answers, approval and receipts. It never contacts LinkedIn.

For the complete interface fixture, start this in one terminal:

```sh
.venv/bin/python tests/serve_apply_fixture.py --port 8780
```

Then:

```sh
TEST_URL=http://127.0.0.1:8780 node tests/apply-browser.cjs
```

The fixture creates fictional versions, records MIME bytes and checks receipts in the role’s Activity. To exercise the connected protocol, channels and authorization separately, use the focused verification commands.

```sh
.venv-apply/bin/python -m unittest discover -s tests -p 'test_agent_*.py' -v
.venv-apply/bin/python tests/check_connected_agent.py
```

The second command uses the installed signed-in Codex runtime and Chrome against a disposable loopback form. It consumes the existing ChatGPT allowance for two fictional turns, verifies the restricted tool registry, records the exact documents and tests Stop. All application traffic stays in the fixture. [Connected journey evidence](../tasks/application-journey/verification.md)
