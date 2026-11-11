"""Refresh the static demo's fallback metadata from published employer postings."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html import unescape
import json
from pathlib import Path
import re
from urllib.parse import urlencode
from urllib.request import urlopen


SNAPSHOT = Path(__file__).resolve().parents[1] / 'employment_agency/demo_data/showcase_jobs.json'
TOPICS = (
    'Python', 'Java', 'JavaScript', 'TypeScript', 'React', 'SQL', 'AWS', 'Azure',
    'Kubernetes', 'Docker', 'CI/CD', 'API', 'BIM', 'project management',
    'data centre', 'cybersecurity', 'networking', 'data analysis',
)


def fetch(url):
    with urlopen(url, timeout=12) as response:
        body = response.read(2_000_001)
    if len(body) > 2_000_000:
        raise ValueError('Employer response is too large')
    return json.loads(body)


def select_jobs(source, checked_at):
    board, country = source['board'], source['country']
    endpoint = f'https://api.smartrecruiters.com/v1/companies/{board}/postings'
    params = {'country': country, 'limit': min(25, source['count'] * 5)}
    if source['city']:
        params['city'] = source['city']
    if source['query']:
        params['q'] = source['query']
    jobs = []
    for posting in fetch(f'{endpoint}?{urlencode(params)}')['content']:
        location = posting['location']
        title = ' '.join(posting['name'].split())
        if (location.get('country') != country
                or source['city'] and location.get('city', '').casefold() != source['city'].casefold()
                or re.match(r'^\[?(?:expression of interest|relocate to|talent pool)', title, re.I)):
            continue
        if not re.fullmatch(r'\d{6,20}', posting['id']):
            continue
        identity = posting['uuid'].replace('-', '').lower()
        if not re.fullmatch('[a-f0-9]{32}', identity):
            continue
        detail = fetch(f'{endpoint}/{posting["id"]}')
        if detail.get('active') is not True or detail.get('uuid') != posting['uuid']:
            continue
        full_location = location.get('fullLocation') or location.get('city') or source['destination']
        if source['destination'].casefold() not in full_location.casefold():
            full_location = f'{full_location}, {source["destination"]}'
        qualifications = detail.get('jobAd', {}).get('sections', {}).get('qualifications', {}).get('text', '')
        text = unescape(re.sub(r'<[^>]+>', ' ', qualifications))
        topics = [topic for topic in TOPICS if re.search(r'(?<!\w)' + re.escape(topic) + r'(?!\w)', text, re.I)]
        jobs.append({
            'id': identity, 'source': f'smartrecruiters:{board}:{country}',
            'title': title, 'employer': source['employer'], 'location': full_location,
            'url': f'https://jobs.smartrecruiters.com/{board}/{posting["id"]}',
            'careers_url': f'https://careers.smartrecruiters.com/{board}',
            'description': f'{title} at {source["employer"]} in {full_location}. See the original advert for the full role and current requirements.',
            'requirements': topics, 'checked_at': checked_at,
            'posted_at': posting.get('releasedDate', '')[:10],
            'availability': 'Employer snapshot',
            'work_arrangement': 'Remote' if location.get('remote') is True else 'Hybrid' if location.get('hybrid') is True else '',
        })
        if len(jobs) == source['count']:
            return jobs
    raise ValueError(f'{board} did not return {source["count"]} current postings in {source["destination"]}')


def main():
    data = json.loads(SNAPSHOT.read_text(encoding='utf-8'))
    checked_at = datetime.now(timezone.utc).isoformat()
    with ThreadPoolExecutor(max_workers=6) as pool:
        groups = list(pool.map(lambda source: select_jobs(source, checked_at), data['sources']))
    jobs = [job for group in groups for job in group]
    if len({job['id'] for job in jobs}) != len(jobs):
        raise ValueError('Employer sources returned duplicate postings')
    data['jobs'] = jobs
    updated = SNAPSHOT.with_suffix('.json.tmp')
    updated.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    updated.replace(SNAPSHOT)
    print(f'Checked {len(jobs)} public listings in {len({s["destination"] for s in data["sources"]})} destinations.')


if __name__ == '__main__':
    main()
