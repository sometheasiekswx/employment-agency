# Apply For Me — local preview

This feature is in the source working tree, not the published 0.6 release. It runs locally on macOS. The hosted pilot cannot execute these operations. No employer application was sent during development.

## What works

Open Applications → **Apply For Me** for an intact application version. Use its job-specific résumé or select **Tailor a new version with Codex**. Codex receives the confirmed facts and job description only after the displayed consent; the existing validator rejects invented fact IDs. It creates a new version, preserving the original.

Every application requires this listing's custom résumé **and cover letter** from the same preserved version. Gmail attaches both PDFs automatically; enter the recipient, subject and message. No Cc/Bcc recipients are added. For LinkedIn, use an exact `https://www.linkedin.com/jobs/view/JOB_ID/` URL and the dedicated visible Chrome session. Complete signup/sign-in, verification, consents and unknown answers yourself. Preparation can upload both custom documents after the explicit disclosure confirmation; the final send/submit requires a second, exact review. If the form has no identifiable cover-letter upload, preparation pauses instead of silently omitting it. Attempts prepared before this requirement must be cancelled and prepared again.

The review shows the résumé PDF and hash, destination, sending identity or site review, and answers. **Send application** or **Submit application** executes once. The private journal links job ID, immutable application version, document path/hash, payload fingerprint, approval time and receipt. Submitted records remain distinct from an employer accepting your application.

A changed résumé, job, evidence, account or form requires another review. An ambiguous send remains **outcome unknown** and blocks retries for that job. Verify Gmail Sent or the site's confirmation and record the evidence before resolving it. Cancellation does not recall a message already being sent. Submission details remain available on the Submitted queue. A manual Submitted record without an automatic receipt is labelled accordingly.

## Install the optional local connections

Keep your existing pinned installation and private workspace unchanged while evaluating the preview. Build the source in a separate environment, using a disposable workspace first:

```sh
cd /path/to/employment-agency
python3 -m venv .venv-apply
npm --prefix frontend ci --ignore-scripts
npm --prefix frontend run build
.venv-apply/bin/python -m pip install '.[apply]'
.venv-apply/bin/python -m employment_agency apply-doctor
.venv-apply/bin/python -m employment_agency --workspace /path/to/new-disposable-workspace serve
```

Build the frontend before installing a wheel/source distribution if the checkout has no exported assets yet; see the normal contributor instructions. Google Chrome and a ChatGPT-signed-in Codex CLI must be installed separately for the corresponding connections. Codex selection consumes that account’s existing usage allowance; the preview rejects API-key sign-in and does not enable a separate paid API service. The normal app does not require the optional connections. `apply-doctor` reports dependency/sign-in presence, not live mail/site success. This feature does not install a recurring background task or schedule applications.

## Connect Gmail

Create a Google Cloud **Desktop app** OAuth client, enable the Gmail API, configure the consent screen/test user where required, and download the client JSON outside the career workspace. Google app publishing/verification requirements depend on your OAuth deployment. Choose **Connect Gmail** in the application dialog and select that file, or run:

```sh
.venv-apply/bin/python -m employment_agency connect-gmail /absolute/path/to/google-desktop-client.json
```

The system browser asks for Gmail sending and basic verified Google-email identity permissions. The access/refresh token and client configuration are stored through the macOS Keychain backend, not a plaintext fallback. Nothing is written into a career workspace, public repository or export. The app does not request mailbox reading; uncertain outcomes require your own Sent-folder check. A Gmail message identifier establishes provider acceptance, not recipient delivery.

Disconnect this app's local credentials:

```sh
.venv-apply/bin/python -m employment_agency disconnect-gmail
```

You can also revoke the grant in your Google account. Never paste tokens, client secrets or cookies into an issue/chat. A configured Gmail connector in Codex/ChatGPT is separate from this app's connection; the app cannot inherit this chat's tools or OAuth permissions.

## LinkedIn limitations

The adapter is experimental and verified against controlled Easy Apply-like forms, **not a live authenticated LinkedIn application**. It uses ordinary visible browser controls and supported labels/steps, not private endpoints or anti-detection techniques. LinkedIn prohibits unauthorized automation and may restrict it; a visible browser does not remove that restriction. There is no approved LinkedIn talent API integration established for this app.

Unknown forms, external redirects, denied access, verification and ambiguous document selection pause for assistance. Upload controls must identify a résumé/CV or cover letter; unsupported controls are not guessed. The adapter verifies both browser-file SHA-256 values when uploading, checks the final filenames/selections, compares the complete captured form review before clicking Submit, and waits for a site confirmation. It does not claim that LinkedIn or an employer verified the local hashes. A real-form feasibility check with an explicitly selected listing and user-managed session is still needed before relying on it.

The dedicated browser profile is under the machine's application configuration directory (`apply/browser`), outside portable workspace data. Workspaces never carry browser sessions. Close/cancel the active workflow before switching workspace. A restart does not replay a send; interrupted execution becomes unknown, and browser work must be resumed and reviewed again.

## Verification

With the optional dependencies installed, run all controlled connection, browser-adapter and interface checks together:

```sh
.venv/bin/python tests/run_apply_checks.py
```

Use `.venv-apply/bin/python` instead if you installed the preview in the separate environment above. The frontend dependencies and Chrome must also be present. The runner creates and removes disposable workspaces automatically.

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

The fixture refuses to use a real workspace and records MIME attachments without sending mail. Evidence is written under `output/playwright/apply/`. Existing full regression, frontend and installed-wheel checks remain required.

See [implementation evidence](../tasks/apply-for-me/verification.md) for the observed results and remaining live-integration gates.
