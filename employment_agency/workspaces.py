"""Workspace selection and declarative settings; never load workspace code."""
from pathlib import Path, PurePosixPath
import json
import os
import sys
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from datetime import timezone
from .store import atomic, encode


def config_home():
    return Path(os.environ.get('EA_CONFIG_HOME', Path.home() / '.config/employment-agency'))


def default_workspace():
    for root in (Path(__file__).resolve().parents[1], Path(sys.prefix).parent, Path.cwd()):
        project = root / 'pyproject.toml'
        if project.is_file() and 'name = "employment-agency-local"' in project.read_text():
            return root / 'workspace'
    return Path.home() / 'EmploymentAgency/workspace'


def selected_workspace(explicit=None):
    """Return the selected path and whether first-run creation is allowed."""
    if explicit is None:
        try:
            explicit = json.loads((config_home() / 'location.json').read_text())['path']
        except FileNotFoundError:
            return default_workspace(), True
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise ValueError('Could not read the remembered workspace. Specify --workspace to open a folder.') from exc
        if not isinstance(explicit, str) or not explicit.strip():
            raise ValueError('Invalid remembered workspace. Specify --workspace to open a folder.')
    if not str(explicit).strip():
        raise ValueError('Specify a workspace path.')
    return Path(explicit).expanduser().resolve(), False


def can_create_workspace(path):
    if not path.exists():
        return True
    entries = {child.name for child in path.iterdir()}
    return not entries or ('.git' in entries and entries <= {'.git', '.gitignore', '.gitattributes', 'README.md'})


def remember(path):
    atomic(config_home() / 'location.json', encode({'path': str(Path(path).resolve())}))


def inside(root, relative):
    """Reject traversal and every symlink component, including missing leaf paths."""
    root = Path(root).resolve()
    rel = PurePosixPath(str(relative))
    if not rel.parts or rel.is_absolute() or any(x in ('.', '..') for x in rel.parts) or '\\' in str(relative) or ':' in str(relative):
        raise ValueError('Expected a workspace-relative path')
    path = root
    for part in rel.parts:
        path = path / part
        if path.is_symlink():
            raise ValueError('Workspace paths cannot contain symlinks')
    if not path.resolve().is_relative_to(root):
        raise ValueError('Path is outside workspace')
    return path


DEFAULTS = {'schema': 1, 'label': 'My career workspace', 'master': 'master/main.tex',
            'demo': False, 'master_template': False, 'timezone': 'UTC', 'preferred_locations': [],
            'location_aliases': {}, 'supplementary_skills': [], 'setup_complete': False,
            'resume_pages': 2, 'cover_letter_pages': 1, 'backup_paths': []}


def validate_backup_paths(root, paths):
    if not isinstance(paths, list) or any(not isinstance(path, str) for path in paths):
        raise ValueError('Backup paths must be a list of workspace-relative paths')
    for path in paths:
        inside(root, path)


def settings(root):
    path = inside(root, 'workspace.json')
    result = dict(DEFAULTS)
    if path.exists():
        result.update(json.loads(path.read_text()))
    if result['schema'] != 1:
        raise ValueError('Unsupported workspace settings version')
    inside(root, result['master'])
    validate_backup_paths(root, result['backup_paths'])
    time_zone(result['timezone'])
    return result


def configure(root, changes):
    result = settings(root)
    allowed = set(DEFAULTS) - {'schema'}
    if set(changes) - allowed:
        raise ValueError('Unknown workspace setting')
    result.update(changes)
    if any(not isinstance(result[key], bool) for key in ('master_template', 'setup_complete', 'demo')):
        raise ValueError('Expected boolean workspace settings')
    for key in ('label', 'master', 'timezone'):
        if not isinstance(result[key], str) or len(result[key]) > 500:
            raise ValueError('Invalid workspace setting')
    for key in ('preferred_locations', 'supplementary_skills'):
        if not isinstance(result[key], list) or len(result[key]) > 100 or any(not isinstance(v, str) or len(v) > 200 for v in result[key]):
            raise ValueError('Invalid workspace list')
    if not isinstance(result['location_aliases'], dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in result['location_aliases'].items()):
        raise ValueError('Invalid location aliases')
    for key in ('resume_pages', 'cover_letter_pages'):
        if type(result[key]) is not int or not 1 <= result[key] <= 10:
            raise ValueError('Page limit must be 1–10')
    inside(root, result['master'])
    validate_backup_paths(root, result['backup_paths'])
    time_zone(result['timezone'])
    atomic(inside(root, 'workspace.json'), encode(result))
    return result


def city_for(job, config):
    location = job.get('city') or job.get('location', '')
    for city in config.get('preferred_locations', []):
        if city.casefold() in location.casefold():
            return city
    for alias, city in config.get('location_aliases', {}).items():
        if alias.casefold() in location.casefold():
            return city
    return location.strip() or 'Location unconfirmed'


def time_zone(name):
    if name == 'UTC':
        return timezone.utc
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError('Timezone unavailable; choose a valid IANA timezone or UTC') from exc
