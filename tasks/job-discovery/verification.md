# Job discovery verification

The initial candidate was verified on 14 November 2026 on macOS, Python 3.12.14 and Node 24.22.0. Browser checks used fictional workspaces and the public URL sample used a disposable workspace. This report records the initial sample and the Firecrawl release checks.

## Candidate checks

| Check | Result |
| --- | --- |
| Python regression suite | 271 passed for the release checks. Discovery checks cover the 25-second partial result state, the 90-second deadline, Stop, duplicate imports, verified employer names, cooldowns, retained source timestamps, browser boundaries, and provider failures. Timing scenarios use shortened fixture clocks. |
| Frontend | 373 tests passed. Lint, type checking, static export and npm audit also passed. |
| Browser | Local and hosted browser acceptance passed. The discovery check used the local API and page at desktop width and at 390 and 320 pixels. It verified Stop, a blocked result, an ordinary page and persisted jobs across reload. The protected agent API returned the same saved job ID. |
| Agent CLI | Two runs against a disposable workspace saved a live HubKore vacancy once and returned ordinary public page text on both runs. |
| Installable wheel | Installed from scratch outside the checkout. Structured extraction, ranking, committed job IDs, SQLite migration, backup restore and document integrity passed. The installed application queue also passed its browser check. |
| Compatibility | Hosted dependency bootstrap, static public preview, development proxy and controlled application workflows passed. GitHub CI on its OS matrix remains pending the published revision. |
| Firecrawl | The authenticated CLI and the app adapter both returned rendered quotes from the public JavaScript fixture. The app used the CLI sign-in with `FIRECRAWL_API_KEY` unset. Controlled tests cover opt-in, the two-request cap, access denials, direct-timeout recovery, and precedence for an explicit cloud API key. A separate delayed page returned partial content within the fallback budget. [JavaScript fixture](https://quotes.toscrape.com/js/) · [Delayed fixture](https://quotes.toscrape.com/js-delayed/) |

The candidate wheel uses the existing package version, `0.6.0`. Record its source commit and SHA-256 when installing it. The [package check](../../tests/check_wheel.py) verifies the wheel in an isolated environment.

## Live public sources

The first seven checks validate required fields across all imported feed records. A separate side-by-side check matched the title, listing link and source ID of one advert per feed against the original response. It also compared employer, date, location or description where the provider exposed those fields. The other tests verified specific text or the expected access restriction. The structured HubKore example matched the exact title, Apsara Energy Tech. Co., Ltd. as hiring employer, Phnom Penh, the published description and original URL. [Original HubKore vacancy](https://www.hubkore.com/careers/senior-fullstack-ai-agent-engineer)

One earlier Lever check timed out. It passed on repeat, including the final run below. The CamHR vacancy and BongThom index remained incomplete. Preliminary ABA Bank checks also returned incomplete content. The second JavaScript example rendered content fetched by its own page at runtime. The 25.6-second batch reflects wall time for all nine URLs to finish, including rendering and link-following.

| Check | Outcome | Method | Evidence |
| --- | --- | --- | --- |
| [Greenhouse board](https://boards-api.greenhouse.io/v1/boards/mongodb/jobs) | partial | feed | Verified: 150 postings with title, employer, original link and source ID |
| [Lever board](https://jobs.lever.co/truezerotech) | retrieved | feed | Verified: 32 postings with title, employer, original link and source ID |
| [SmartRecruiters board](https://careers.smartrecruiters.com/MangoByteTechnologyCoLtd) | retrieved | feed | Verified: 1 posting with title, employer, original link and source ID |
| [Ashby board](https://jobs.ashbyhq.com/linear) | retrieved | feed | Verified: 33 postings with title, employer, original link and source ID |
| [Workable board](https://apply.workable.com/hustler-marketing/) | retrieved | feed | Verified: 19 postings with title, employer, original link and source ID |
| [We Work Remotely RSS](https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss) | retrieved | feed | Verified: 123 postings with title, employer, original link and source ID |
| [Remotive API](https://remotive.com/api/remote-jobs?category=software-dev) | retrieved | feed | Verified: 16 postings with title, employer, original link and source ID |
| [JobNet search](https://www.jobnet.com.kh/job) | retrieved | http | Verified: Matched 'Jobs in Cambodia' |
| [JobNet landing](https://www.jobnet.com.kh/) | retrieved | http | Verified: Matched 'Jobs in Cambodia' |
| [Jobify vacancy](https://jobify.works/jobs/1289) | retrieved | http | Verified: Matched 'Business Analyst' |
| [Jobify start page](https://jobify.works/) | retrieved | http | Verified: Matched 'Jobify' |
| [CamHR landing](https://www.camhr.com/) | retrieved | http | Verified: Matched 'Job' |
| [CamHR vacancy](https://www.camhr.com/a/job/10642470) | partial | http | No additional content could be rendered |
| [BongThom Phnom Penh](https://www.bongthom.com/job_location-12.html) | partial | http | Source timed out |
| [Canadia Bank careers](https://www.canadiabank.com.kh/careers) | retrieved | http | Verified: Matched 'open positions' |
| [Canadia Bank vacancy](https://www.canadiabank.com.kh/careers/career-23) | retrieved | http | Verified: Matched 'Customer Service Officer' |
| [Vattanac Bank careers](https://careers.vattanacbank.com/) | retrieved | http | Verified: Matched 'Vacancies' |
| [HubKore careers](https://www.hubkore.com/careers) | retrieved | http | Verified: Matched 'Full-Stack' |
| [HubKore structured vacancy](https://www.hubkore.com/careers/senior-fullstack-ai-agent-engineer) | retrieved | http | Verified: 1 exact title/URL match with employer, location and description |
| [Allweb careers](https://www.allweb.com.kh/career) | blocked | — | Verified: Source robots.txt disallows automated access |
| [HTML reference page](https://docs.python.org/3/library/html.parser.html) | retrieved | http | Verified: Matched 'HTMLParser' |
| [HTTP specification](https://www.rfc-editor.org/rfc/rfc9110.html) | retrieved | http | Verified: Matched 'HTTP Semantics' |
| [Public domain registry](https://www.iana.org/domains/reserved) | retrieved | http | Verified: Matched 'Reserved Domains' |
| [GNU licence page](https://www.gnu.org/licenses/gpl-3.0.en.html) | retrieved | http | Verified: Matched 'GNU General Public License' |
| [W3C Recommendation](https://www.w3.org/TR/2023/REC-wot-architecture11-20231205/) | retrieved | http | Verified: Matched 'Web of Things' |
| [Mozilla about page](https://www.mozilla.org/en-US/about/) | retrieved | http | Verified: Matched 'Mozilla' |
| [Wikipedia article](https://en.wikipedia.org/wiki/Phnom_Penh) | retrieved | http | Verified: Matched 'Phnom Penh' |
| [Plain static website](https://example.com/) | retrieved | http | Verified: Matched 'Example Domain' |
| [Static book catalogue](https://books.toscrape.com/) | retrieved | http | Verified: Matched 'Books to Scrape' |
| [Static book detail](https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html) | retrieved | http | Verified: Matched 'A Light in the Attic' |
| [JavaScript quotes](https://quotes.toscrape.com/js/) | retrieved | browser | Verified: Matched 'Albert Einstein' |
| [JavaScript quotes AJAX](https://quotes.toscrape.com/scroll) | retrieved | browser | Verified: Matched 'Albert Einstein' |
| [Plain response example](https://httpbingo.org/html) | retrieved | http | Verified: Matched 'Herman Melville' |
| [Native-only search](https://www.linkedin.com/jobs/) | blocked | — | Verified: Use the site's native search or alerts and import the employer's listing |
| [Wing Bank careers](https://www.wingbank.com.kh/en/careers) | retrieved | http | Verified: Matched 'Job Close' |
| [Wing Bank vacancy](https://www.wingbank.com.kh/en/careers/senior-specialist-treasury-operation) | retrieved | http | Verified: Matched 'Senior Specialist, Treasury Operation' |

Checked 36 URLs across 28 sites. Verified content from 32 URLs and expected access restrictions on 2. Batch wall times in seconds: 7.5, 12.3, 3.5, 25.6.

To repeat the sample, install the [browser extra](../../docs/running-locally.md#find-new-jobs) in the app's Python environment, then run `PYTHONPATH=. python tests/check_live_discovery.py` in the shared code checkout. The script uses a temporary SQLite workspace and reports the current availability of the fixed public URLs.

## Release and recovery

Discovery adds no schema migration to the schema-5 base. The private workspace pins its installed build. Before an authorized upgrade, export the workspace and verify a restore to a disposable folder. Use the pinned prior wheel plus the verified export to recover in a separate folder if the upgrade fails. Search progress lives in the running app and can be started again after a restart. Imported vacancies and source check metadata persist in the workspace. [Local backup and upgrade guidance](../../docs/running-locally.md)
