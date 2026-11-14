"""Extract explicit company branding from a verified public page."""

import json
from itertools import islice
from urllib.parse import urljoin

from lxml import etree, html

from . import companies, company_logo_assets as assets, sources


PAGE_LIMIT = 512 * 1024
ORGANIZATION_TYPES = frozenset({
    'Organization', 'Corporation', 'LocalBusiness', 'BankOrCreditUnion',
    'ProfessionalService', 'FinancialService', 'NGO', 'EducationalOrganization',
    'GovernmentOrganization', 'MedicalOrganization',
})
SHARED_PUBLISHERS = (
    'greenhouse.io', 'lever.co', 'smartrecruiters.com', 'ashbyhq.com', 'workable.com',
    'indeed.com', 'linkedin.com', 'remotive.com', 'weworkremotely.com',
)


def page_address(url):
    parsed = sources.public_url(url)
    if parsed.query or parsed.fragment:
        raise ValueError('A public branding page URL without query parameters is required')
    host = parsed.hostname.rstrip('.')
    if any(host == shared or host.endswith('.' + shared) for shared in SHARED_PUBLISHERS):
        raise ValueError('Choose an official employer site for company branding')
    return parsed


def records(value):
    if isinstance(value, list):
        for element in value[:60]:
            if isinstance(element, dict):
                yield element
    elif isinstance(value, dict):
        yield value
        graph = value.get('@graph')
        if isinstance(graph, list):
            yield from records(graph)


def named_logos(tree):
    for script in tree.xpath('//script[starts-with(@type, "application/ld+json")]/text()')[:24]:
        try:
            value = json.loads(script)
        except (ValueError, RecursionError):
            continue
        for item in islice(records(value), 120):
            kind = item.get('@type')
            kinds = kind if isinstance(kind, list) else [kind]
            types = {value.rsplit('/', 1)[-1] for value in kinds if isinstance(value, str)}
            if 'JobPosting' in types:
                item = item.get('hiringOrganization')
            elif not types & ORGANIZATION_TYPES:
                continue
            if not isinstance(item, dict):
                continue
            name = item.get('name')
            if isinstance(name, str) and (label := companies.name_key(name)):
                yield label, item.get('logo')


def declared_url(value, page):
    if isinstance(value, dict):
        value = value.get('contentUrl') or value.get('url')
    if (not isinstance(value, str) or not value or '\\' in value
            or any(char.isspace() or ord(char) < 32 for char in value)):
        return None
    try:
        return assets.public_logo(urljoin(page, value)).geturl()
    except ValueError:
        return None


def selected_logo(tree, page, names, selection):
    candidate = assets.public_logo(selection)
    declared = candidate.geturl()
    labels = {label for label, logo in named_logos(tree) if declared_url(logo, page) == declared}
    if labels - names:
        raise assets.UnsupportedLogo('The selected image is declared as another organization’s logo')
    if labels:
        return declared
    if assets.same_host(candidate.hostname, page_address(page).hostname):
        for image in islice(tree.iter('img'), 250):
            if declared_url(image.get('src'), page) == declared:
                return declared
    return None


def logo_from_html(body, url, names, charset=None, *, selection=None):
    try:
        tree = html.fromstring(body, parser=html.HTMLParser(encoding=charset, no_network=True))
    except (etree.Error, LookupError) as exc:
        raise assets.UnsupportedLogo('The official branding page could not be read') from exc
    if selection is not None:
        return selected_logo(tree, url, names, selection)

    candidates = {candidate for label, logo in named_logos(tree) if label in names
                  and (candidate := sources.logo_candidate(logo, url))}
    if not candidates:
        # Use a named header mark with same-site navigation, including localized pages.
        host = page_address(url).hostname
        for image in tree.xpath('//header//a[@href]//img[@src and @alt]')[:32]:
            alt = companies.name_key(image.get('alt'))
            if alt not in names and alt.removesuffix(' logo') not in names:
                continue
            try:
                link = page_address(urljoin(url, next(iter(image.iterancestors('a'))).get('href')))
            except ValueError:
                continue
            if assets.same_host(host, link.hostname):
                if candidate := sources.logo_candidate(image.get('src'), url):
                    candidates.add(candidate)
    if len(candidates) > 1:
        raise assets.UnsupportedLogo('The official page declares conflicting logo images')
    return next(iter(candidates), None)


def fetch(url, names, deadline, *, selection=None):
    host = page_address(url).hostname

    def redirect(target):
        if not assets.same_host(page_address(target).hostname, host):
            raise assets.UnsupportedLogo('The branding page redirected outside the verified site')

    response = assets.request(url, deadline, max_bytes=PAGE_LIMIT,
                              accept='text/html, application/xhtml+xml', redirect=redirect)
    redirect(response.url)
    if (len(response.headers.get_all('Content-Type', [])) != 1
            or response.headers.get_content_type() not in ('text/html', 'application/xhtml+xml')
            or response.headers.get('Content-Encoding', 'identity').casefold() != 'identity'):
        raise assets.UnsupportedLogo('The official source did not return supported HTML')
    logo = logo_from_html(response.body, response.url, names, response.headers.get_content_charset(),
                          selection=selection)
    return logo, response.url
