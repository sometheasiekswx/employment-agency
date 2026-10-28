"""Read-only navigation of the same canonical files used by application cards."""
from html import escape
from urllib.parse import quote
from .packages import catalogue
from .workspaces import settings


def page(root):
    items = catalogue(root)
    groups = {}
    for key, (relative, data) in items.items():
        parts = relative.split('/')[1:]
        if len(parts) < 4:
            continue
        city, company, job = parts[:3]
        groups.setdefault(city, {}).setdefault(company, {}).setdefault(job, []).append((key, data, '/'.join(parts[3:])))
    output = ['<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Application history</title><link rel="stylesheet" href="/style.css"></head><body class="history-page"><a class="skip-link" href="#history-main">Skip to content</a><main id="history-main" tabindex="-1"><a href="/">← Applications and review</a><h1>Application history</h1><p>Preserved documents by city, company, role and date. Historical versions do not imply that a job is open or an application was submitted.</p>']
    priority = settings(root)['preferred_locations']
    for city in sorted(groups, key=lambda c: (priority.index(c) if c in priority else len(priority), c)):
        output.append('<section><h2>' + escape(city) + '</h2>')
        for company, jobs in sorted(groups[city].items()):
            count = sum(len(v) for v in jobs.values())
            output.append('<details><summary><span class="company-title">' + escape(company) + '</span><span class="history-meta">' + str(count) + ' versions</span></summary>')
            for job, versions in sorted(jobs.items()):
                output.append('<h3>' + escape(job) + '</h3>')
                for key, data, label in sorted(versions, key=lambda v: v[1].get('generated_at', ''), reverse=True):
                    output.append('<details><summary>' + escape(label) + (' — date needs confirmation' if data.get('date_uncertain') else '') + '</summary><p>' + escape(data.get('source', 'Unknown source')) + '</p><ul>')
                    for name in sorted(data['files']):
                        output.append('<li><a target="_blank" rel="noopener" href="/history/files/' + key + '/' + quote(name, safe='') + '">' + escape(name) + '</a></li>')
                    output.append('</ul><button data-history-adopt="' + key + '">Validate external edits as a new draft</button><p role="status"></p></details>')
            output.append('</details>')
        output.append('</section>')
    output.append('</main><script src="/ui/history.js" defer></script></body></html>')
    return ''.join(output).encode()
