---
status: accepted
---
# Keep discovery local with bounded public-page fallbacks

On 14 November 2026 the owner chose one discovery pipeline for the local Search page and agents. Use documented feeds and direct extraction before rendering a public page. Local Playwright and opt-in Firecrawl cover permitted pages that need a fallback. Firecrawl starts disabled, receives only the public page URL and is limited to two pages per search. This preserves coverage during a provider outage and avoids paying for routine refreshes. [Firecrawl billing](https://docs.firecrawl.dev/billing)

Show partial results and source outcomes while fetching, with an initial response goal of 25 seconds and an overall limit of 90 seconds. Let the user stop the run. Preserve the previous verified results when a source fails. Follow a bounded set of job links from a careers index or sitemap on the same site or to a recognised employer feed. Save structured vacancies through the workspace service and show readable pages and uncertain leads for review.
