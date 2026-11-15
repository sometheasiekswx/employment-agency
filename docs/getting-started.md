# Your first application

Use the [README setup](../README.md#run-locally) to start the local app with your own career workspace. This walkthrough needs no AI provider key. Your imported documents and saved decisions stay in that workspace. The public demo is separate: its new drafts live only in the current browser tab.

## 1. Choose your workspace

At first launch, check the displayed folder and choose **Use this workspace**. Use **Open Folder** to select an existing workspace or create a separate one in an empty folder or new Git repository. **Settings → Workspace files** shows the active path later. [Folder selection and platform requirements](workspace-folder-selection.md)

## 2. Add your master CV and review the facts

Open **Career profile → Import resume**. Supported files are PDF, DOCX, TXT, Markdown and TeX, up to 10 MB in the local app. A scanned PDF needs selectable text or OCR before import. Imported TeX is read as text; it is not compiled.

Leave **Use this file as my master resume** checked for your main CV and click **Import for review**. Choose **Review master changes**, inspect the proposed facts, exclude unwanted lines and confirm the remainder. **Source changes** shows the text differences. Review **Your details** and save any contact details the import did not extract.

To add supporting experience without replacing the master, uncheck **Use this file as my master resume**, or use **Add experience or a skill**. These facts need individual confirmation. Edit inaccurate text, category, employer association or dates before confirming it. Keep an uncertain employer association blank. Retire an irrelevant fact to exclude it from future drafts; previous application documents remain preserved.

The standard templates generate PDF and editable Word documents without LaTeX. The optional **trusted LaTeX master layout** in Settings requires a compiler and a compatible local template; leave it off for ordinary PDF or Word imports.

If you edit the master file later, return to **Review master changes**. Reconciliation preserves supplementary facts and previous application versions. It does not silently regenerate your applications.

## 3. Choose roles and locations

Open **Search preferences**. In **Create your first profile**, give it a name and enter target roles and locations in priority order. Separate locations with commas or new lines. Choose **Remote** or **Hybrid** under **Work arrangements**. Record only work rights and sponsorship details you can confirm, then click **Save profile**.

**Required matches** controls which preference conflicts block draft preparation. **Prepare drafts when eligibility or other checks need confirmation** allows unresolved checks on a draft that meets the other preparation requirements. Verify eligibility before applying. You can keep several profiles and choose the active one.

The location list in **Settings → Workspace files** organises application documents. The active **search profile** determines job matching.

## 4. Bring in roles

Choose the route that matches the information you have:

| Starting point | Action |
| --- | --- |
| A public careers page or several URLs | **Find new jobs**; supply HTTPS URLs, review source outcomes and any partial results. |
| A supported employer board or remote feed | Register it under **Live sources**, then select it in **Find new jobs**. Board identifiers are explained in [local discovery](running-locally.md#find-new-jobs). |
| One listing with JobPosting structured data | **Add opportunity → Import URL**. If the site cannot be imported, paste the advert manually. |
| Advert text, a blocked site or an unsupported listing | **Paste an advert or add details manually**. Preserve the source URL and leave unknown details unknown. |
| An external coding agent researching companies | Follow the [agent workflow and Codex gate](agents.md#enable-the-codex-job-research-gate), including the cooldown lookup before each search. |

The app searches supplied sources, not the whole web. Some sites require login, JavaScript or manual review. Optional browser rendering and Firecrawl are described in [local discovery](running-locally.md#find-new-jobs); routine imports and drafts do not require either.

Open **Opportunities → Jobs** to compare imported roles by hiring employer. Where a verified logo is available, it appears in the company header and opened role details. Review the active profile match, source dates and any missing information. If the company's research includes two reviewed highlights for this profile, Jobs shows their fit reasons. Choose **Apply later** to move a role to **To apply**, subject to employer confirmation and the available company allowance. You can still open pending roles and view history during a cooldown.

## 5. Prepare and review documents

Open a role and choose **Prepare application**. The CV opens in the role workspace. Review both the CV and cover letter, including your contact details, role, employer, factual claims and formatting. You can download PDFs or edit the available document version. [Document editing and validation](document-editor.md)

Preparing a new draft creates a version. **History** retains previous versions; a recorded submitted version remains immutable. Removing a role moves it to **Applications → Removed**, where you can restore it with its records.

## 6. Apply and record what happened

| Action | What it does |
| --- | --- |
| **Open application site** | Checks the employer, exact document version and available company slot, then opens the verified site for you. Complete that site's process yourself. |
| **I've applied** | Records your actual submission time, channel and confirmation evidence. Confirm whether you used the displayed documents. The role then appears in **Applications → Submitted**. |
| **Apply later** | Adds the role to **To apply**. Open the role from that list when ready to apply. |
| **Apply for me** | Starts a configured local agent and authorizes preparation and submission for the open role. Missing answers or access pause it for your help. See [optional setup and channel limits](apply-for-me.md). |
| **Copy agent instructions** | In **To apply**, copies a handoff for the whole pending queue. In **Jobs**, copies five-company research instructions for the active profile. |

An unresolved employer or submission history needs clarification before reserving a company slot. A manually added role may show an inline employer form: enter or select the verified hiring employer and choose **Confirm employer**. This continues the action you started: after **Open application site**, it reserves the slot and opens the site automatically, so you do not need to click Open application site again. Use the organisation actually hiring, which can differ from the recruiter; leave it unresolved if the advert does not identify it. If you did not submit, record that outcome instead of marking the role Submitted. If you are unsure whether a send succeeded, check the website or Sent folder before retrying. Pending supporting documents belong in the submitted role's follow-up.

A connected Codex/ChatGPT Gmail tool is separate from the app's Gmail connection. The app does not inherit its credentials. Telegram execution is currently unavailable; the ordinary website/self-apply path remains usable.

## 7. Back up and return later

Use **Settings → Export private workspace** and save the ZIP outside the public software repository. It contains personal career data, application versions and recovery files. Restore it into a new folder and grant any local provider permissions again. Before changing the installed build, verify the candidate against a restored copy. [Backup and restore commands](running-locally.md#back-up-without-upgrading) · [Upgrade checks](running-locally.md#existing-environments-and-upgrades)

Stop the app with Ctrl+C before running a CLI operation on the same workspace. Next time, run the same `--workspace ... serve` command from the README. You do not need to import your CV or initialize the folder again.
