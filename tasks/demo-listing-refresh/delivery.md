# Public demo listing refresh — delivery record

15 November 2026. Implemented and verified locally on `codex/demo-listing-refresh`, based on `1049e0f0bbd41b0d4ae5a63e0dc4a29252136d9e`. This record captures the candidate before publication. The owner subsequently authorized committing and publishing it to the live demo. Changes are isolated from the original shared checkout and the private career workspace.

The owner confirmed the seven destination groups and reviewed snapshots with checked dates. [Accepted decision](../../docs/adr/0021-reviewed-public-showcase-listings.md) · [Implementation plan](plan.md) · [Catalog and provenance](../../employment_agency/demo_data/showcase_jobs.json)

## Result

The catalog contains 67 distinct official vacancies from 34 employers, all checked on 15 November 2026. Contentful appears in both London and Berlin. Every destination has five hiring companies; each has between one and four retained roles. The existing 14 sample jobs and seven sample applications remain, giving 81 total demo roles. Real postings keep their actual advertised locations, source links, requirements and unknown eligibility.

| Destination | Hiring companies | Reviewed jobs |
| --- | ---: | ---: |
| Singapore | 5 | 9 |
| Melbourne | 5 | 8 |
| New York | 5 | 12 |
| London | 5 | 11 |
| China | 5 | 8 |
| Berlin | 5 | 7 |
| Toronto | 5 | 12 |

Exactly two existing-system highlights are saved for each of the nine employers with more than two roles: Plaid, Ramp, Figma, Okta, Robinhood, Stripe, Deliveroo, Xero and Apple. All other reviewed roles remain available. The shared `company-research-complete` operation returned `ready: true` for the selected public profile, all 67 job IDs and all 34 employers, with no comparison blockers. Recommendations are research; no application choice or submission was made.

The static export now includes verified company identities, local logo assets and shared highlight projections. Reviewed postings remain stable between releases, including saved choices for older catalog entries. Private queue metadata is excluded so tab-local draft editing remains functional. No external job feed is fetched by visitors.

## Verification

| Check | Result |
| --- | --- |
| Frontend unit suite | 390 tests passed across 36 files |
| Type checking and lint | Passed |
| Public export and approved résumé tests | 7 passed, including destination grouping, local logos and current comparisons |
| Shared company tests | 57 initially passed; the remaining logo HTTP test passed after the required normal frontend build (58 covered) |
| Importer regression | Passed: failed re-verification cannot publish a stale logo with new evidence |
| Release/stage/promotion tests | 108 passed |
| Normal and approved-profile static builds | Passed; 316 static files prepared |
| Desktop and mobile browser suites | Both passed against the static site with the production CSP |
| Diff and privacy review | Passed; no private workspace data in catalog or sample fixture, including parsed documents |

Browser checks cover all seven destination counts, every company role count, exact two-pick ordering and reasons, remaining roles, nine decoded logos, 25 initials fallbacks, source links, saved choices, sample controls, tab drafts, document import/export and accessibility. The final browser receipt was local ignored output, now archived at `output/worktree-archive/employment-agency-demo-refresh/output/demo-listing-refresh/browser-verification.json`; it is not distributed with the repository. Earlier failure logs are retained as diagnosis evidence and are superseded by the receipt.

Local test logs and the full shared completion receipt are under `output/demo-listing-refresh/` (ignored build/research output). Full Linux/macOS/Windows CI, wheel/install checks and live deployment checks have not run for this uncommitted candidate. The existing publishing workflow must still pass those gates.

## Logo coverage and limits

All 34 hiring companies received a shared logo retrieval attempt with retained official-source evidence. Nine imports succeeded: MongoDB, Wise, Xero, Maincode, Culture Amp, SimplifyNext, OKX, Apple and AMD. Their hashes, source URLs, evidence and retrieval dates match the stored shared-operation records and their displayed assets.

The remaining 25 companies use initials. The shared importer rejected the assets for the reasons below; retrieved but unsupported candidates are not labelled verified. Xero’s accepted media wordmark is very narrow in the company tile, and the Wise/MongoDB wordmarks have modest contrast on the neutral tile. Alternate official Xero sources did not yield an eligible square mark.

| Company | Reason retained by shared logo operation | Official source attempted |
| --- | --- | --- |
| Plaid | The selected logo URL was not declared on the official page | [Source](https://plaid.com/) |
| Ramp | The branding source exceeds its download size limit | [Source](https://ramp.com/) |
| Figma | The branding source exceeds its download size limit | [Source](https://www.figma.com/) |
| Datadog | The selected logo URL was not declared on the official page | [Source](https://www.datadoghq.com/) |
| Anthropic | The selected logo URL was not declared on the official page | [Source](https://www.anthropic.com/) |
| Okta | No explicit matching logo was found on the official page | [Source](https://www.okta.com/newsroom/) |
| Robinhood | No explicit matching logo was found on the official page | [Source](https://robinhood.com/us/en/) |
| Stripe | The branding source exceeds its download size limit | [Source](https://stripe.com/au) |
| PagerDuty | The selected logo URL was not declared on the official page | [Source](https://www.pagerduty.com/) |
| Monzo | No explicit matching logo was found on the official page | [Source](https://monzo.com/careers) |
| Deliveroo | The selected logo URL was not declared on the official page | [Source](https://careers.deliveroo.co.uk/) |
| Contentful | Choose an official employer site for company branding | [Source](https://job-boards.greenhouse.io/contentful) |
| Trainline | The selected image is declared as another organization’s logo | [Source](https://www.thetrainline.com/) |
| HelloFresh | The branding source exceeds its download size limit | [Source](https://careers.hellofresh.com/global/en) |
| N26 | The selected logo URL was not declared on the official page | [Source](https://n26.com/en-eu/careers) |
| SumUp | The selected logo URL was not declared on the official page | [Source](https://www.sumup.com/careers/) |
| Delivery Hero | The source did not return a supported raster format | [Source](https://careers.deliveryhero.com/) |
| Kraken | The selected logo URL was not declared on the official page | [Source](https://kraken.tech/) |
| Easygo | The selected logo URL was not declared on the official page | [Source](https://www.easygo.io/careers) |
| PALO IT | The source did not return a supported raster format | [Source](https://www.palo-it.com/) |
| Encora | Choose an official employer site for company branding | [Source](https://job-boards.greenhouse.io/encora10) |
| Airwallex | Choose an official employer site for company branding | [Source](https://jobs.ashbyhq.com/airwallex) |
| NVIDIA | The selected logo URL was not declared on the official page | [Source](https://nvidianews.nvidia.com/multimedia/corporate/nvidia-logos) |
| EPAM Systems | The source did not return a supported raster format | [Source](https://careers.epam.com/en/vacancy/senior-front-end-developer-react-typescript-bltu5kc1ucsong60hgw_en) |
| Amazon | No explicit matching logo was found on the official page | [Source](https://press.aboutamazon.com/logos) |

## Reviewed listings

The stars identify the saved company highlights. The links below point to the original official postings. The dates describe this research snapshot; employer pages may subsequently close or change.

### Singapore

**SimplifyNext** — 2 roles · [Careers](https://www.simplifynext.com/career)

- [Full Stack Developer](https://job-boards.greenhouse.io/simplifynext/jobs/5236654007) — Singapore
- [Data Engineer](https://job-boards.greenhouse.io/simplifynext/jobs/5233120007) — Singapore

**PALO IT** — 2 roles · [Careers](https://www.palo-it.com/en/careers)

- [AI-Native Engineer (Software Engineering)](https://jobs.ashbyhq.com/palo-it/7042c585-bfc3-427b-9bee-21d5dc4de6d5) — Singapore
- [Senior AI-Native Engineer (Software Engineering)](https://jobs.ashbyhq.com/palo-it/56707745-9c94-4d7f-885b-c41dbc90099e) — Singapore

**OKX** — 1 role · [Careers](https://www.okx.com/join-us)

- [DevOps / Site Reliability Engineer](https://job-boards.greenhouse.io/okx/jobs/7767872003) — Singapore

**Encora** — 2 roles · [Careers](https://job-boards.greenhouse.io/encora10)

- [DevOps Engineer](https://job-boards.greenhouse.io/encora10/jobs/5187373007) — Singapore
- [React JS Developer](https://job-boards.greenhouse.io/encora10/jobs/5205356007) — Singapore

**Airwallex** — 2 roles · [Careers](https://careers.airwallex.com/)

- [Software Engineer, Developer Experience](https://jobs.ashbyhq.com/airwallex/3c5176fb-6eee-4bf4-8031-36f0528c71a3) — Singapore
- [Senior Software Engineer, Scale (Frontend)](https://jobs.ashbyhq.com/airwallex/a9c09c5d-ab0c-4692-a6c0-d1cdc0107a7c) — Singapore

### Melbourne

**Xero** — 3 roles · [Careers](https://jobs.ashbyhq.com/xero)

- [Senior Engineer - AI Platform](https://jobs.ashbyhq.com/xero/0c345d63-dcc1-4fa0-b521-a0fb6fff29ca) ★ — Melbourne or Sydney, Australia
- [Senior Engineer - Platform](https://jobs.ashbyhq.com/xero/65b39783-4a06-4bae-8dbe-48afb916886f) — Melbourne, Sydney or Brisbane, Australia
- [Search Engineer](https://jobs.ashbyhq.com/xero/9eef7111-d180-4e9e-a3df-f5f36f8b61f8) ★ — Melbourne, Sydney, Canberra or Brisbane, Australia

**Kraken** — 2 roles · [Careers](https://jobs.ashbyhq.com/krakentech)

- [Software Engineer I and II - Client Engineering - Remote within Australia](https://jobs.ashbyhq.com/krakentech/0cb355f4-cf92-4810-8794-979bbe5c9a68) — Melbourne, Australia; Engineer II also remote within Australia
- [Senior Analytics Engineer](https://jobs.ashbyhq.com/krakentech/b441f0f2-3d86-4a65-bd1f-07d0aad2a1ff) — Melbourne, Australia

**Maincode** — 1 role · [Careers](https://maincode.com/careers)

- [Software Engineer](https://jobs.ashbyhq.com/maincode/8a48f6bf-9a50-48b9-8c7f-699024011d66) — Melbourne, Australia

**Easygo** — 1 role · [Careers](https://www.easygo.io/careers)

- [Identity Engineer](https://job-boards.greenhouse.io/easygo/jobs/5274710007) — Melbourne, Australia

**Culture Amp** — 1 role · [Careers](https://www.cultureamp.com/company/careers)

- [People and Systems Analyst](https://job-boards.greenhouse.io/cultureamp/jobs/8326301) — Melbourne, Australia

### New York

**Plaid** — 3 roles · [Careers](https://plaid.com/careers/)

- [Software Engineer, Full Stack](https://jobs.ashbyhq.com/plaid/a9dc0810-546b-4773-9545-2862409e24b4) ★ — New York City Office
- [Senior Software Engineer, Full Stack](https://jobs.ashbyhq.com/plaid/24f357ee-b2fc-4f86-bab9-d10ecfb99003) ★ — New York City Office
- [Software Engineer, Backend](https://jobs.ashbyhq.com/plaid/7e10c0b5-a09a-4e07-aaa8-899a7f82a0c9) — New York City Office

**Ramp** — 4 roles · [Careers](https://ramp.com/careers)

- [Software Engineer, Frontend](https://jobs.ashbyhq.com/ramp/6511d68f-b65d-4499-962f-7e2f75eabe3f) ★ — New York, NY (HQ)
- [Software Engineer, Production Engineering](https://jobs.ashbyhq.com/ramp/be496b52-cfbf-494e-b862-61fb4a188b24) ★ — New York, NY (HQ)
- [Software Engineer, Fullstack, Spend Controls](https://jobs.ashbyhq.com/ramp/6e717b06-6613-42ad-a1ee-f852a305fa37) — New York, NY (HQ)
- [Software Engineer, Backend, Developer API](https://jobs.ashbyhq.com/ramp/42527ca9-03b9-499e-a5c4-18e4245af138) — New York, NY (HQ)

**Figma** — 3 roles · [Careers](https://www.figma.com/careers/)

- [Software Engineer - Full Stack](https://job-boards.greenhouse.io/figma/jobs/5691911004) ★ — San Francisco, CA • New York, NY • United States
- [Software Engineer - Growth & Monetization](https://job-boards.greenhouse.io/figma/jobs/5552560004) ★ — San Francisco, CA • New York, NY • United States
- [Software Engineer - Developer Experience](https://job-boards.greenhouse.io/figma/jobs/5790627004) — San Francisco, CA • New York, NY • United States

**Datadog** — 1 role · [Careers](https://careers.datadoghq.com/)

- [Senior Software Engineer](https://careers.datadoghq.com/detail/3851935/) — Boston, Massachusetts, USA; New York, New York, USA

**Anthropic** — 1 role · [Careers](https://www.anthropic.com/careers)

- [Front End Engineer, Marketing](https://job-boards.greenhouse.io/anthropic/jobs/5386971008) — San Francisco, CA | New York City, NY

### London

**Monzo** — 2 roles · [Careers](https://monzo.com/careers)

- [Backend Engineer III](https://job-boards.greenhouse.io/monzo/jobs/6635595) — Cardiff, London or Remote (UK)
- [Senior Backend Engineer](https://job-boards.greenhouse.io/monzo/jobs/6635837) — Cardiff, London or Remote (UK)

**Deliveroo** — 4 roles · [Careers](https://careers.deliveroo.co.uk/)

- [Software Engineer, Backend (BI Platform)](https://job-boards.greenhouse.io/deliveroo/jobs/8206463) ★ — London, United Kingdom
- [Senior Software Engineer (Full-Stack) - Home Page and Merchandising Platform](https://job-boards.greenhouse.io/deliveroo/jobs/8276280) ★ — London, United Kingdom
- [Software Engineer II (Backend) - Home Page & Merchandising Platform](https://job-boards.greenhouse.io/deliveroo/jobs/8266845) — London, United Kingdom
- [Software Engineer](https://job-boards.greenhouse.io/deliveroo/jobs/8206351) — London, United Kingdom

**Wise** — 2 roles · [Careers](https://wise.jobs/)

- [Software Engineer - Risk Control & Governance](https://jobs.smartrecruiters.com/Wise/744000160549671-software-engineer-risk-control-governance) — London, United Kingdom
- [Senior Data Engineer I - Global KYC & Onboarding](https://jobs.smartrecruiters.com/Wise/744000161530989-senior-data-engineer-i-global-kyc-onboarding) — London, United Kingdom

**Contentful** — 1 role · [Careers](https://job-boards.greenhouse.io/contentful)

- [Demo Software Engineer (f/m/d)](https://job-boards.greenhouse.io/contentful/jobs/8356206) — London, England, United Kingdom

**Trainline** — 2 roles · [Careers](https://www.trainlinegroup.com/careers/)

- [Platform Engineer](https://jobs.ashbyhq.com/trainline/8536b13b-5ff7-4551-a77d-88d8b4dd43f5) — London, United Kingdom
- [Senior Platform Engineer](https://jobs.ashbyhq.com/trainline/6e8ba16f-7cc4-41e7-9c63-0115509e07ae) — London, United Kingdom

### China

**Apple** — 3 roles · [Careers](https://jobs.apple.com/en-us/search?location=china-CHNC)

- [Store Apps Engineering DevOPs Engineer](https://jobs.apple.com/en-us/details/200676247-3715/store-apps-engineering-devops-engineer) ★ — Shanghai, China
- [Software Engineer - Cloud Services Engineering](https://jobs.apple.com/en-us/details/200685581-3715/software-engineer-cloud-services-engineering) ★ — Shanghai, China
- [Full-stack engineer - Apple Store Online, Rapid Application Development](https://jobs.apple.com/en-us/details/200679391-3715/full-stack-engineer-apple-store-online-rapid-application-development) — Shanghai, China

**NVIDIA** — 2 roles · [Careers](https://www.nvidia.com/en-us/about-nvidia/careers/)

- [Senior Software Development Engineer in Test, SDET - DGX Cloud](https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/China-Shanghai/Senior-Software-Development-Engineer-in-Test--SDET----DGX-Cloud_JR2029482) — Shanghai, China
- [Senior AI Infra Test Development Engineer, SDET](https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/China-Shanghai/Senior-AI-Infra-Test-Development-Engineer--SDET_JR2027720) — Shanghai, China

**EPAM Systems** — 1 role · [Careers](https://careers.epam.com/en/jobs)

- [Senior Front-end Developer (React, TypeScript)](https://careers.epam.com/en/vacancy/senior-front-end-developer-react-typescript-bltu5kc1ucsong60hgw_en) — Shanghai, China

**Amazon** — 1 role · [Careers](https://www.amazon.jobs/en/search?country%5B%5D=CHN)

- [API Support Engineer, Developer Support Engineering](https://www.amazon.jobs/en/jobs/10567071/api-support-engineer-developer-support-engineering) — Shanghai, China

**AMD** — 1 role · [Careers](https://careers.amd.com/careers-home/jobs)

- [Senior Agentic AI Engineer](https://careers.amd.com/careers-home/jobs/97180) — Beijing, China

### Berlin

**Contentful** — 1 role · [Careers](https://job-boards.greenhouse.io/contentful)

- [Senior Software Engineer - Personalization (f/m/d)](https://job-boards.greenhouse.io/contentful/jobs/8221365) — Berlin, Germany

**HelloFresh** — 1 role · [Careers](https://careers.hellofresh.com/global/en)

- [Senior Backend Engineer - Marketing Automation (all genders)](https://careers.hellofresh.com/global/en/job/8280899?gh_jid=8280899) — Berlin, Berlin, Germany

**N26** — 2 roles · [Careers](https://n26.com/en-eu/careers)

- [Site Reliability Engineer - Data Platform](https://n26.com/en-eu/careers/positions/8378357?gh_jid=8378357) — Barcelona, Berlin
- [Senior Site Reliability Engineer - Connectivity](https://n26.com/en-eu/careers/positions/8219953?gh_jid=8219953) — Berlin, Barcelona

**SumUp** — 2 roles · [Careers](https://www.sumup.com/careers/)

- [Data Platform Engineer (Mid-Level)](https://sumup.com/careers/positions/8364212002?gh_jid=8364212002) — Berlin, Germany
- [Senior Fullstack Engineer - Localization](https://sumup.com/careers/positions/8773687002?gh_jid=8773687002) — Berlin, Germany

**Delivery Hero** — 1 role · [Careers](https://careers.deliveryhero.com/)

- [Senior Software Engineer, Go - (Global Recommendations and Ranking, Consumer)](https://jobs.smartrecruiters.com/DeliveryHero/744000159818991-senior-software-engineer-go-global-recommendations-and-ranking-consumer-) — Berlin, Germany

### Toronto

**MongoDB** — 2 roles · [Careers](https://www.mongodb.com/company/careers)

- [Senior Software Engineer, Deployments](https://www.mongodb.com/careers/jobs/7727913) — Toronto
- [Associate Technical Services Engineer](https://www.mongodb.com/careers/jobs/8234520) — Toronto

**Okta** — 3 roles · [Careers](https://www.okta.com/company/careers/)

- [Senior Software Engineer, Fullstack](https://www.okta.com/company/careers/rd/senior-software-engineer-fullstack-8186804/) ★ — Toronto, Ontario, Canada
- [Software Engineer II, Platform Infrastructure - Control](https://www.okta.com/company/careers/rd/software-engineer-ii-platform-infrastructure-control-8333990/) ★ — Toronto, Ontario, Canada
- [Senior Software Engineer - UI Platform](https://www.okta.com/company/careers/rd/senior-software-engineer-ui-platform-8021682/) — Toronto, Ontario, Canada

**Robinhood** — 3 roles · [Careers](https://careers.robinhood.com/)

- [Senior Software Developer, Developer Experience (DevX)](https://job-boards.greenhouse.io/robinhood/jobs/8083818) ★ — Toronto, Canada
- [Software Developer, Data Engineering](https://job-boards.greenhouse.io/robinhood/jobs/5616144) ★ — Toronto, Canada
- [Software Engineer, Web3 Backend](https://job-boards.greenhouse.io/robinhood/jobs/8258307) — Toronto, Canada

**Stripe** — 3 roles · [Careers](https://stripe.com/careers/search)

- [Full Stack Engineer, Link](https://stripe.com/careers/listing/full-stack-engineer-link/6447175) ★ — Toronto
- [Backend / API Engineer, Radar](https://stripe.com/careers/listing/backend-api-engineer-radar/8301379) ★ — Toronto
- [Software Engineer, Metronome Infrastructure](https://stripe.com/careers/listing/software-engineer-metronome-infrastructure/8231439) — Toronto, Vancouver, Canada-Remote

**PagerDuty** — 1 role · [Careers](https://careers.pagerduty.com/)

- [Senior Security Engineer - Cloud Security](https://job-boards.greenhouse.io/pagerduty/jobs/6211202004) — Toronto

## Delivery and recovery

Local preview: <http://127.0.0.1:8789/discover/>. The server uses production security headers. The site is built from this worktree and the previously approved public résumé; the approved input files remain in ignored local output.

Publishing targets the existing Vercel public demo via the repository’s `main` workflow. The owner authorized the commit and publication on 15 November 2026. This does not upgrade a private workspace. The pre-release live marker was `1049e0f0bbd41b0d4ae5a63e0dc4a29252136d9e` with fixture revision `0f0893ca8319c095ac27`. The final workflow and live marker are recorded in the release receipt under ignored `output/demo-listing-refresh/`.

Follow the existing [deployment and recovery runbook](../../docs/public-demo-deployment.md). Before promotion, a failed candidate leaves the live alias unchanged. If post-promotion verification identifies a regression, promote the prior known-good Vercel deployment and verify its release marker and critical routes. This static change has no private database migration.
