"""Maintainer-only refresh of public job metadata; never used at app startup."""
import json
from pathlib import Path
import re
import urllib.request
from html import unescape
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
CHECKED = datetime.now(timezone.utc).isoformat()
KEYWORDS = ['Python', 'Java', 'Go', 'React', 'TypeScript', 'SQL', 'AWS', 'Kubernetes', 'Docker', 'distributed systems', 'APIs', 'testing', 'databases']

def fetch(url):
    with urllib.request.urlopen(url, timeout=25) as response:
        raw = response.read(10 * 1024 * 1024 + 1)
    if len(raw) > 10 * 1024 * 1024:
        raise ValueError('Board response too large')
    return json.loads(raw)

jobs = []
for board, employer in [('mongodb', 'MongoDB'), ('datadog', 'Datadog')]:
    url = f'https://boards-api.greenhouse.io/v1/boards/{board}/jobs'
    for listing in fetch(url)['jobs']:
        title, location = listing['title'].strip(), listing['location']['name']
        if not ('software engineer' in title.lower() and 'intern' not in title.lower()):
            continue
        if not any(city in location.lower() for city in ['new york', 'new jersey', 'princeton', 'toronto', 'boston', 'san francisco']):
            continue
        detail = fetch(f'{url}/{listing["id"]}')
        text = unescape(re.sub('<[^>]+>', ' ', unescape(detail.get('content', ''))))
        keywords = [k for k in KEYWORDS if re.search(r'\b' + re.escape(k) + r'\b', text, re.I)]
        jobs.append({'city': {3851935: 'Boston', 8189170: 'San Francisco'}.get(listing['id'], ''), 'title': title, 'employer': employer, 'location': location,
                     'url': listing['absolute_url'], 'source': url, 'checked_at': CHECKED,
                     'posted_at': detail.get('first_published', ''), 'availability': 'retrieved',
                     'eligibility': 'unknown', 'requirements': keywords[:5],
                     'description': f'{title} at {employer}. Offices listed: {location}. Technical topics in the employer posting: {", ".join(keywords)}. Consult the source for the full scope and current requirements.'})
output = {'notice': 'Real employer-board snapshots; availability can change. No employer endorsement. Candidate and decisions are fictional.', 'checked_at': CHECKED, 'jobs': jobs}
(ROOT / 'employment_agency/demo_data/jobs.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(f'Saved {len(jobs)} verified job metadata snapshots')
