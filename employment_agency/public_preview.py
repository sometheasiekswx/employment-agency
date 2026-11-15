"""Build the public snapshot through shared application services.

The offline export uses a fictional profile and the reviewed employer listings.
The release build can replace the profile and sample documents from an approved
redacted résumé. Neither build opens a private workspace.
"""
from pathlib import Path
import argparse
import base64
from collections import Counter
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile

from .demo import DemoWorkspace
from .service import Service
from . import documents, history, matching, packages, summaries
from .store import digest, encode
from .workspaces import configure
from . import public_catalog


SAMPLE_LOCATIONS = ('Singapore', 'Melbourne', 'Berlin', 'Toronto')
SHOWCASE_LOCATIONS = ('Singapore', 'Melbourne', 'New York', 'London', 'China', 'Berlin', 'Toronto')
PUBLIC_MASTER_PATH = 'demo/master-resume.pdf'
SAMPLE_NOTICE = 'No application was sent.'
ACTIVITY_MIX = {'jobs': 70, 'saved': 10, 'active': 8, 'submitted': 7, 'removed': 5}


def publish_resume_profile(state, resume):
    """Use only statements visible in the approved redacted master."""
    lines = [line.strip() for line in resume['text'].splitlines()]

    def section(start, end):
        try:
            first = lines.index(start) + 1
            return ' '.join(lines[first:lines.index(end, first)]).strip()
        except ValueError:
            return ''

    summary = section('Profile', 'Professional Experience')
    skills = section('Key Skills', 'Education and Recognition')
    skills = re.sub(r'\b(?:T\s*echnical|Management):\s*', ',', skills)
    entries = [('summary', summary)]
    entries.extend(('skill', item.strip()) for item in skills.split(','))
    facts = []
    for category, text in dict.fromkeys(entries):
        if not text:
            continue
        identifier = hashlib.sha256(f'{category}:{text}'.encode()).hexdigest()[:32]
        facts.append({'id': identifier, 'text': text, 'category': category,
                      'confirmed': True, 'source': {'name': 'Public master résumé'}})
    state['identity'] = {'name': resume['name']}
    state['facts'] = facts
    state['_workspace'].update(
        path='public-showcase', label='Public demo', master=PUBLIC_MASTER_PATH,
    )
    state['_master'] = {'path': PUBLIC_MASTER_PATH, 'exists': True, 'changed': False}
    skills_by_key = matching.skills_by_key(facts)
    for job in state['jobs']:
        job['matched_skill_evidence'] = matching.skill_evidence(job.get('requirements'), skills_by_key)
    rankings = {profile['id']: matching.ranked(state['jobs'], profile, facts)
                for profile in state['profiles']}
    return {'state': state, 'rankings': rankings}


def seed_profile(service, locations):
    service.action('identity', {'name': 'Alex Morgan', 'email': 'alex@example.test',
                               'location': 'Melbourne, Australia · Fictional sample profile', 'languages': 'English'})
    for skill in ('Python', 'AWS', 'Terraform', 'PostgreSQL', 'React', 'TypeScript', 'CI/CD'):
        fact = service.action('fact', {'text': f'Used {skill} to build and maintain software services.',
                                      'category': 'experience', 'association': 'Example Labs (fictional)',
                                      'dates': '2022–2026'})
        service.action('confirm', {'id': fact['id']})
    return service.action('profile', {'name': 'Cloud & software', 'roles': ['Engineer'],
        'locations': list(locations), 'hard': ['locations'],
        'include_unknown': True, 'include_stretch': True, 'template': 'plain'})


def seed(service, locations=SAMPLE_LOCATIONS):
    profile = seed_profile(service, locations)
    rows = [
        ('Cloud Software Engineer', 'Emberlane Systems', 'Singapore', 'Hybrid', 'SGD', 100000, 130000, ['Python', 'AWS', 'Terraform', 'Kubernetes']),
        ('Backend Engineer', 'Bayform Labs', 'Singapore', 'On-site', 'SGD', 90000, 120000, ['Python', 'PostgreSQL', 'APIs']),
        ('Platform Engineer', 'Fernbridge Digital', 'Melbourne', 'Hybrid', 'AUD', 115000, 145000, ['AWS', 'Terraform', 'CI/CD', 'Kubernetes']),
        ('Full Stack Engineer', 'Paperwell Studio', 'Melbourne', 'Remote', 'AUD', 105000, 135000, ['React', 'TypeScript', 'PostgreSQL']),
        ('DevOps Engineer', 'Northglass Works', 'Berlin', 'Hybrid', 'EUR', 70000, 90000, ['AWS', 'Terraform', 'CI/CD']),
        ('Backend Software Engineer', 'Cedarlight Software', 'Toronto', 'Hybrid', 'CAD', 110000, 140000, ['Python', 'PostgreSQL', 'AWS']),
    ]
    jobs = []
    for index, (title, company, city, arrangement, currency, low, high, requirements) in enumerate(rows):
        job = service.action('job', {'title': title, 'employer': company, 'location': city,
            'description': f'Fictional concept listing. Build and maintain software services with {", ".join(requirements)}. Work with a small engineering team.',
            'requirements': requirements, 'work_arrangement': arrangement, 'eligibility': 'unknown',
            'availability': 'illustrative example', 'sponsorship': 'unknown',
            'posted_at': '2026-11-01', 'checked_at': '2026-11-05T00:00:00Z',
            'url': f'https://example.test/concept/role-{index + 1}',
            'salary': {'currency': currency, 'period': 'year', 'basis': 'gross_base', 'min': low, 'max': high}})
        jobs.append(job)
        if service.w.database:
            service.action('company-map', {'job_id': job['id'], 'name': company, 'confirmed': True})
    for index in (0, 2, 5):
        app = service.action('local-package', {'profile_id': profile['id'], 'job_id': jobs[index]['id']})
        if index == 0:
            service.action('review', {'id': app['id'], 'status': 'reviewed', 'comment': 'Fictional review. Check eligibility before applying.'})
        if index == 5:
            service.action('review', {'id': app['id'], 'status': 'submitted', 'comment': 'Fictional submission record for UI verification. No employer was contacted.'})
    service.action('save-job', {'id': jobs[4]['id'], 'saved': True})
    return profile


def sample_activity(catalog, preparable):
    """Spread repeatable sample choices across companies while keeping reviewed picks."""
    total = len(catalog['jobs'])
    exact = {stage: total * weight for stage, weight in ACTIVITY_MIX.items()}
    targets = {stage: value // 100 for stage, value in exact.items()}
    remainders = sorted(targets, key=lambda stage: -(exact[stage] % 100))
    for stage in remainders[:total - sum(targets.values())]:
        targets[stage] += 1
    roles = {item['job_id']: company['name'] for company in catalog['companies']
             for item in company['listings']}
    additions = catalog.get('new_employers_by_destination')
    sample_employers = {company for names in additions.values() for company in names} if additions else set(roles.values())
    picks = {pick['job_id'] for company in catalog['companies'] for pick in company.get('picks', [])}
    company_sizes = Counter(roles.values())
    ordered = sorted(roles, key=lambda job_id: digest(f'public-activity:{job_id}'.encode()))
    choices = {}
    slot_usage = Counter()
    consumed = Counter()
    assigned = Counter()
    for stage in ('submitted', 'removed', 'active', 'saved'):
        count = 0
        changes_inventory = stage in ('removed', 'submitted')
        candidates = sorted(ordered, key=lambda job_id: (
            changes_inventory and company_sizes[roles[job_id]] - consumed[roles[job_id]] == 3,
            slot_usage[roles[job_id]],
        ))
        for job_id in candidates:
            if count == targets[stage]:
                break
            company = roles[job_id]
            if job_id in picks or job_id in choices or (stage != 'removed' and slot_usage[company] >= 2):
                continue
            # Existing browser choices at retained employers take precedence over
            # sample decisions that would hide a role from the visitor's queue.
            if stage != 'saved' and company not in sample_employers:
                continue
            if assigned[company] >= company_sizes[company] - 1:
                continue
            if stage in ('submitted', 'active') and job_id not in preparable:
                continue
            if stage == 'submitted' and consumed[company]:
                continue
            choices[job_id] = stage
            assigned[company] += 1
            count += 1
            if stage != 'removed':
                slot_usage[company] += 1
            if changes_inventory:
                consumed[company] += 1
    jobs = [job_id for job_id in ordered if job_id not in choices]
    return choices, set(jobs[:len(jobs) // 2])


def seed_showcase(service, listing_data):
    profile = seed_profile(service, SHOWCASE_LOCATIONS)
    # Publication revalidates the comparisons against the approved public résumé.
    terms = sorted({term for company in listing_data['companies']
                    for pick in company.get('picks', []) for term in pick['fact_terms']})
    for term in terms:
        fact = service.action('fact', {'text': term, 'category': 'skill'})
        service.action('confirm', {'id': fact['id']})
    for job in listing_data['jobs']:
        service.action('job', job)
    public_catalog.restore_companies(service, listing_data)
    state = service.w.read()
    preparable = {job['id'] for job in state['jobs']
                  if matching.match(job, profile, state['facts'])['eligible_for_preparation']}
    choices, previously_seen = sample_activity(listing_data, preparable)
    for job_id, status in choices.items():
        if status == 'saved':
            service.action('save-job', {'id': job_id, 'saved': True})
        elif status == 'removed':
            removal = {'id': job_id, 'removal_id': digest(f'public-removal:{job_id}'.encode())[:32]}
            service.action('remove-job', removal)
            service.action('job-removal-reason', {**removal, 'comment': 'Sample decision. Focus on other roles.'})
        else:
            app = service.action('local-package', {'profile_id': profile['id'], 'job_id': job_id})
            if status == 'submitted':
                service.action('review', {
                    'id': app['id'], 'status': 'submitted',
                    'comment': f'Sample submission. {SAMPLE_NOTICE}',
                })
    public_catalog.save_reviews(service, listing_data, profile['id'])
    return choices, previously_seen


def _write_asset(stage, files, key, path):
    body = path.read_bytes()
    name = hashlib.sha256(body).hexdigest()[:24] + path.suffix.lower()
    destination = stage / 'files' / name
    destination.parent.mkdir(exist_ok=True)
    destination.write_bytes(body)
    files[key] = '/demo/files/' + name
    return files[key]


def _export_documents(stage, workspace, applications):
    files, previews = {}, {}
    for app in applications:
        key = f'application:{app["id"]}'
        for role in app['documents']:
            path = packages.path_for(workspace, app, role)
            _write_asset(stage, files, f'{key}:{role}', path)
        previews[app['id']] = {
            stem: {'base': app['manifest_hash'], 'url': files[f'{key}:{stem}.pdf']}
            for stem in ('resume', 'cover-letter')
        }
    versions = history.versions(workspace)
    for version in versions:
        for name in version['files']:
            path = history.verified_file(workspace, version['id'], name)
            _write_asset(stage, files, f'history:{version["id"]}:{name}', path)
    return {'files': files, 'documents': previews, 'history': versions}


def _write_bundle(stage, bundle):
    bundle.pop('revision', None)
    serialized = json.dumps(bundle, ensure_ascii=False, sort_keys=True)
    bundle['revision'] = hashlib.sha256(serialized.encode()).hexdigest()[:20]
    (stage / 'preview.json').write_text(
        json.dumps(bundle, ensure_ascii=False, indent=2) + '\n', encoding='utf-8',
    )


def _check_owned_export(destination):
    if not destination.exists():
        return
    try:
        old = json.loads((destination / 'preview.json').read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise ValueError('Refusing to replace a directory without a public-preview manifest') from error
    if old.get('public_preview') is not True or old.get('schema') != 1:
        raise ValueError('Refusing to replace an unrelated directory')
    allowed = {'preview.json'}
    for url in old.get('files', {}).values():
        if not isinstance(url, str) or not url.startswith('/demo/files/'):
            raise ValueError('Invalid previous public-preview asset')
        allowed.add(url.removeprefix('/demo/'))
    for sha256, url in old.get('company_logos', {}).items():
        if not re.fullmatch(r'[a-f0-9]{64}', sha256) or url != f'/demo/company-logos/{sha256}.png':
            raise ValueError('Invalid previous company logo asset')
        allowed.add(url.removeprefix('/demo/'))
    if old.get('demo_resume', {}).get('pdf') == '/' + PUBLIC_MASTER_PATH:
        allowed.add(Path(PUBLIC_MASTER_PATH).name)
    actual = {path.relative_to(destination).as_posix() for path in destination.rglob('*') if path.is_file()}
    if actual - allowed:
        raise ValueError('The export directory contains unrelated files; no data changed')


def publish_resume_bundle(destination, resume, pdf):
    """Replace the exported profile and all sample files using reviewed inputs."""
    destination = Path(destination)
    _check_owned_export(destination)
    bundle = json.loads((destination / 'preview.json').read_text(encoding='utf-8'))
    if bundle.get('current_catalog_only') is not True:
        raise ValueError('Regenerate the public fixture from the current reviewed catalog')
    if digest(pdf) != resume['sha256']:
        raise ValueError('The approved résumé PDF does not match its checksum')
    state = bundle['state']
    bundle.update(publish_resume_profile(state, resume))
    catalog = public_catalog.load_catalog()
    if bundle.get('catalog_revision') and bundle['catalog_revision'] != digest(encode(catalog)):
        raise ValueError('The public catalog changed; regenerate the fixture before publishing')
    admitted = public_catalog.admitted_catalog(catalog)
    if {job['id'] for job in admitted['jobs']} != {job['id'] for job in state['jobs']}:
        raise ValueError('The public fixture listing membership changed; regenerate before publishing')
    public_catalog.republish_reviews(state, admitted, resume['sha256'])
    identity = state['identity']
    name = identity['name']
    facts = state['facts']
    summary = next((fact['text'] for fact in facts if fact['category'] == 'summary'), '')
    jobs = {job['id']: job for job in state['jobs']}
    generated = {version['id']: version['generated_at'] for version in bundle['history']}
    workspace_settings = state['_workspace']
    headings = {'Profile', 'Professional Experience', 'Key Skills', 'Education and Recognition'}
    resume_blocks = [
        ('title' if line == name else 'heading' if line in headings else 'text', line)
        for line in map(str.strip, resume['text'].splitlines()) if line and not line.isdecimal()
    ]
    with tempfile.TemporaryDirectory(prefix='ea-public-documents-') as temporary:
        root = Path(temporary).resolve()
        package = root / 'package'
        stage = root / 'export'
        workspace = root / 'workspace'
        for path in (package, stage, workspace):
            path.mkdir()
        for sha256, url in bundle.get('company_logos', {}).items():
            relative = url.removeprefix('/demo/')
            body = (destination / relative).read_bytes()
            if digest(body) != sha256 or not public_catalog.company_logo_assets.normalized_png(body):
                raise ValueError('A public company logo failed verification')
            (stage / relative).parent.mkdir(exist_ok=True)
            (stage / relative).write_bytes(body)
        config = configure(workspace, {
            key: workspace_settings[key]
            for key in ('timezone', 'preferred_locations', 'resume_pages', 'cover_letter_pages')
        })
        documents.render_blocks(
            package, 'resume', resume_blocks, config['resume_pages'], 'plain', approved_pdf=pdf,
        )
        for app in state['applications']:
            job = jobs[app['job_id']]
            target = f'{job["title"]} at {job["employer"]}'
            label = 'Sample submission' if app['status'] == 'submitted' else 'Sample application'
            if app['status'] == 'submitted':
                for comment in app['comments']:
                    if comment['status'] == 'submitted':
                        comment['text'] = f'{label}. {SAMPLE_NOTICE}'
            letter = [
                ('title', name), ('heading', label), ('text', SAMPLE_NOTICE),
                ('heading', f'Cover letter for {target}'), ('text', 'Dear Hiring Team,'),
                ('text', f'I am interested in the {job["title"]} role at {job["employer"]}.'),
            ]
            if summary:
                letter.append(('text', summary))
            letter += [('text', 'Thank you for considering my application.'),
                       ('text', 'Kind regards,'), ('text', name)]
            documents.render_blocks(package, 'cover-letter', letter, config['cover_letter_pages'], 'plain')
            documents.write_email_draft(
                package, f'{label} for {target} - {name}',
                f'{label}. {SAMPLE_NOTICE}\n\nThe example CV and cover letter for {target} are attached.\n\n{name}',
            )
            assessment = matching.match(job, {}, facts)
            (package / 'evidence.json').write_bytes(encode({
                'job': job, 'facts': facts, 'matching': assessment,
                'template': 'plain', 'notice': f'{label}. {SAMPLE_NOTICE}',
            }))
            files = {role: (package / role).read_bytes() for role in documents.FILES}
            packages.validate(files, config)
            previous_version = digest(app['folder'].encode())[:24]
            app.update(packages.publish(
                workspace, files, job, identity,
                generated_at=generated[previous_version], source=label,
            ))
            app['fact_ids'] = [fact['id'] for fact in facts]
            app['fit_summary'] = summaries.summarize(job, facts)
        bundle.update(_export_documents(stage, workspace, state['applications']))
        bundle['demo_resume'] = {**resume, 'pdf': '/' + PUBLIC_MASTER_PATH}
        (stage / Path(PUBLIC_MASTER_PATH).name).write_bytes(pdf)
        _write_bundle(stage, bundle)
        shutil.rmtree(destination)
        shutil.copytree(stage, destination)


def export_preview(destination):
    """Generate the checked fallback listings and fictional application records."""
    catalog = public_catalog.load_catalog()
    listing_data = public_catalog.admitted_catalog(catalog)
    destination = Path(destination).expanduser().absolute()
    _check_owned_export(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    previous_config = os.environ.get('EA_CONFIG_HOME')
    with tempfile.TemporaryDirectory(prefix='ea-public-preview-') as temporary:
        root = Path(temporary)
        os.environ['EA_CONFIG_HOME'] = str(root / 'config')
        workspace = DemoWorkspace(root / 'workspace', sqlite=True)
        try:
            configure(workspace.path, {
                'label': 'Public preview · Alex Morgan', 'demo': True,
                'setup_complete': True, 'timezone': 'Australia/Melbourne',
                'master_template': False,
                'preferred_locations': list(SHOWCASE_LOCATIONS),
            })
            service = Service(workspace)
            choices, previously_seen = seed_showcase(service, listing_data)
            state = service.state()
            rankings = {profile['id']: service.action('rank', {'profile_id': profile['id']}) for profile in state['profiles']}
            # The shared import retains the advertised location. This explicit
            # catalog grouping also preserves country-wide showcase tabs.
            destinations = {job['id']: job['city'] for job in listing_data['jobs'] if job.get('city')}
            for job in [*state['jobs'], *(row['job'] for rows in rankings.values() for row in rows)]:
                if job['id'] in destinations:
                    job['city'] = destinations[job['id']]
                if job['id'] in previously_seen:
                    job['demo_new'] = False
                if choices.get(job['id']) == 'active':
                    job['demo_active'] = True
            stage = root / 'export'
            stage.mkdir()
            # Absolute build paths, machine permissions and provider consent do
            # not belong in this public snapshot, even in a fictional workspace.
            state['_workspace']['path'] = 'public-fictional-preview'
            # The demo derives its application stages from mutable tab-local
            # drafts, not the private agent queue captured during this export.
            state['_workspace'].pop('agent_queue', None)
            state.pop('application_queue', None)
            state.pop('company_highlight_reviews', None)
            state['_master']['path'] = 'master/fictional-resume'
            state['consents'] = {}
            state['runs'] = []
            payload = {
                'public_preview': True, 'schema': 1,
                'notice': 'Public demo with employer listings and sample application records. No applications are sent.',
                'state': state, 'rankings': rankings, 'job_sources': [],
                'current_catalog_only': True,
                'listing_mode': 'reviewed', 'catalog_revision': digest(encode(catalog)),
                'company_logos': public_catalog.export_logos(stage, workspace.path, state, rankings),
                **_export_documents(stage, workspace.path, state['applications']),
            }
            serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True)
            if str(root) in serialized or '/Users/' in serialized:
                raise ValueError('A machine-specific path reached the public preview')
            _write_bundle(stage, payload)
            _check_owned_export(destination)
            if destination.exists():
                shutil.rmtree(destination)
            shutil.copytree(stage, destination)
            return {'jobs': len(state['jobs']), 'applications': len(state['applications']),
                    'assets': len(set(payload['files'].values())), 'revision': payload['revision']}
        finally:
            workspace.close()
            if previous_config is None:
                os.environ.pop('EA_CONFIG_HOME', None)
            else:
                os.environ['EA_CONFIG_HOME'] = previous_config


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--publish-resume', action='store_true',
                        help='Replace the profile and sample documents from approved JSON inputs on stdin')
    arguments = parser.parse_args()
    if arguments.publish_resume:
        if arguments.output is None:
            parser.error('--publish-resume requires an explicit --output directory')
        data = json.load(sys.stdin)
        publish_resume_bundle(arguments.output, data['resume'], base64.b64decode(data['pdf'], validate=True))
    else:
        print(json.dumps(export_preview(arguments.output or Path('frontend/public/demo')), indent=2))
