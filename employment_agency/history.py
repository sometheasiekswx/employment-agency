"""Scoped history metadata and integrity-checked access to canonical versions."""
import json
from .packages import catalogue
from .store import digest
from .workspaces import inside, settings


def versions(root):
    result = []
    for key, (relative, data) in catalogue(root).items():
        parts = relative.split('/')[1:]
        if len(parts) < 4:
            continue
        result.append({
            'id': key, 'city': parts[0], 'company': parts[1], 'job': parts[2],
            'label': '/'.join(parts[3:]), 'generated_at': data.get('generated_at', ''),
            'date_uncertain': bool(data.get('date_uncertain')),
            'source': data.get('source', 'Unknown source'), 'files': sorted(data['files']),
        })
    priority = settings(root)['preferred_locations']
    return sorted(result, key=lambda item: (
        priority.index(item['city']) if item['city'] in priority else len(priority),
        item['city'], item['company'], item['job'], item['label'],
    ))


def verified_file(root, key, name):
    item = catalogue(root).get(key)
    if not item or name not in item[1]['files']:
        raise ValueError('Historical document not found')
    relative, record = item
    index = json.loads(inside(root, '.recovery/index.json').read_text())
    baseline = index.get(relative)
    if not baseline or digest(inside(root, relative + '/version.json').read_bytes()) != baseline:
        raise ValueError('Version manifest changed; recovery review is required')
    path = inside(root, relative + '/' + name)
    if digest(path.read_bytes()) != record['files'][name]:
        raise ValueError('Document changed; validate edits in Applications first')
    return path
