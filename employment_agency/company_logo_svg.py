"""Validate and rasterize the static SVG subset accepted as logo evidence."""

from math import ceil, isfinite
from pathlib import Path
import re
import subprocess
import sys
from threading import BoundedSemaphore
from time import monotonic

from lxml import etree


SVG = 'http://www.w3.org/2000/svg'
XLINK = 'http://www.w3.org/1999/xlink'
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
ELEMENTS = frozenset({
    'svg', 'g', 'defs', 'title', 'desc', 'path', 'rect', 'circle', 'ellipse',
    'line', 'polyline', 'polygon', 'clipPath', 'mask', 'linearGradient',
    'radialGradient', 'stop', 'style', 'symbol', 'use',
})
ATTRIBUTES = frozenset({
    'id', 'version', 'viewBox', 'preserveAspectRatio', 'width', 'height',
    'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy',
    'd', 'points', 'transform', 'fill', 'fill-rule', 'fill-opacity', 'opacity',
    'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
    'stroke-opacity', 'clip-path', 'clip-rule', 'clipPathUnits', 'mask',
    'maskUnits', 'maskContentUnits', 'gradientUnits', 'gradientTransform',
    'spreadMethod', 'offset', 'stop-color', 'stop-opacity', 'color',
    'display', 'visibility', 'shape-rendering', 'vector-effect', 'overflow', 'class',
})
GRADIENTS = frozenset({'linearGradient', 'radialGradient'})
REFERENCE_ATTRIBUTES = {'fill': GRADIENTS, 'stroke': GRADIENTS,
                        'clip-path': {'clipPath'}, 'mask': {'mask'}}
CSS_PROPERTIES = frozenset({
    *REFERENCE_ATTRIBUTES, 'color', 'opacity', 'fill-rule', 'fill-opacity',
    'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'clip-rule', 'stop-color', 'stop-opacity', 'display', 'visibility',
})
FRAGMENT = re.compile(r'#[A-Za-z_][\w.:-]{0,127}', re.ASCII)
LOCAL_URL = re.compile(r'url\(\s*(#[A-Za-z_][\w.:-]{0,127})\s*\)', re.ASCII)
LENGTH = re.compile(r'((?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)(?:px)?')
COLOR_FUNCTION = re.compile(r'rgba?\([\d.,%\s]+\)', re.ASCII)
CLASS_NAME = re.compile(r'[A-Za-z_][A-Za-z0-9_-]{0,63}')
CLASS_RULE = re.compile(r'\s*([^{}]+)\{([^{}]+)\}')
CSS_LITERAL = re.compile(r'[A-Za-z0-9.# %+,\-]+')
ROOT_BACKGROUND = re.compile(r'enable-background\s*:\s*new(?:\s+-?[0-9]{1,7}(?:\.[0-9]{1,6})?){4}\s*;?', re.ASCII)
RENDER_SLOTS = BoundedSemaphore(2)
RENDER_SECONDS = 2
MAX_ELEMENTS = 2048
MAX_DEPTH = 32
MAX_SYMBOL_REFERENCES = 8
HREF_ATTRIBUTES = {'href', f'{{{XLINK}}}href'}


def dimensions(root, side, max_side, max_pixels):
    width, height = root.get('width'), root.get('height')
    viewbox = root.get('viewBox')
    intrinsic = None
    if viewbox is not None:
        values = re.split(r'[\s,]+', viewbox.strip())
        if len(values) != 4:
            raise ValueError('The SVG logo has an invalid viewBox')
        x, y, w, h = map(float, values)
        if not all(isfinite(n) and abs(n) <= 10_000_000 for n in (x, y, w, h)):
            raise ValueError('The SVG logo has an invalid viewBox')
        intrinsic = w, h
    lengths = [LENGTH.fullmatch(value.strip()) if value else None for value in (width, height)]
    if all(lengths):
        w, h = (float(length[1]) for length in lengths)
    elif intrinsic and all(value is None or value.strip() == '100%' for value in (width, height)):
        w, h = intrinsic
    else:
        raise ValueError('The SVG logo requires pixel dimensions or a viewBox')
    if not all(isfinite(n) and 0 < n <= max_side for n in (w, h)) or w * h > max_pixels:
        raise ValueError('The SVG logo exceeds its decoded size limit')
    scale = min(1.0, side / max(w, h))
    return max(1, ceil(w * scale)), max(1, ceil(h * scale))


def presentation_reference(attribute, value, references):
    if 'url' in value.casefold():
        match = LOCAL_URL.fullmatch(value)
        if not match or attribute not in REFERENCE_ATTRIBUTES:
            raise ValueError('SVG logos cannot reference external resources')
        references.append((match[1][1:], REFERENCE_ATTRIBUTES[attribute]))
        return True
    return False


def stylesheet(value, references):
    """Rebuild a short class-only sheet from its permitted declarations."""
    if not value or len(value) > 8192:
        raise ValueError('The SVG logo stylesheet exceeds its size limit')
    rules = []
    offset = 0
    value = value.strip()
    while offset < len(value):
        rule = CLASS_RULE.match(value, offset)
        if not rule or len(rules) >= 64:
            raise ValueError('The SVG logo contains an unsupported stylesheet')
        selectors = [item.strip() for item in rule[1].split(',')]
        declarations = rule[2].strip().removesuffix(';').split(';')
        if (len(selectors) > 32 or len(declarations) > 32
                or any(not item.startswith('.') or not CLASS_NAME.fullmatch(item[1:]) for item in selectors)):
            raise ValueError('The SVG logo contains an unsupported stylesheet')
        checked = []
        for declaration in declarations:
            name, separator, content = declaration.partition(':')
            name, content = name.strip(), content.strip()
            if not separator or name not in CSS_PROPERTIES:
                raise ValueError('The SVG logo contains an unsupported CSS property')
            if not (presentation_reference(name, content, references)
                    or CSS_LITERAL.fullmatch(content) or COLOR_FUNCTION.fullmatch(content)):
                raise ValueError('The SVG logo contains an unsupported CSS value')
            checked.append(f'{name}:{content}')
        rules.append(','.join(selectors) + '{' + ';'.join(checked) + '}')
        offset = rule.end()
    return ''.join(rules)


def validated_document(body, side, max_side, max_pixels):
    parser = etree.XMLParser(
        no_network=True, resolve_entities=False, load_dtd=False, recover=False,
        remove_comments=True, remove_pis=True, huge_tree=False,
    )
    try:
        root = etree.fromstring(body, parser=parser)
    except etree.XMLSyntaxError as exc:
        raise ValueError('The SVG logo could not be parsed safely') from exc
    if root.getroottree().docinfo.doctype or root.tag != f'{{{SVG}}}svg':
        raise ValueError('The logo must be an SVG document without a DOCTYPE')
    size = dimensions(root, side, max_side, max_pixels)
    seen = {}
    references = []
    symbol_references = 0
    styles = 0
    for count, node in enumerate(root.iter(), 1):
        if count > MAX_ELEMENTS or sum(1 for _ in node.iterancestors()) > MAX_DEPTH:
            raise ValueError('The SVG logo exceeds its document complexity limit')
        if not isinstance(node.tag, str) or not node.tag.startswith(f'{{{SVG}}}'):
            raise ValueError('The SVG logo contains unsupported markup')
        name = etree.QName(node).localname
        if name not in ELEMENTS or (name == 'svg' and node is not root):
            raise ValueError('The SVG logo contains unsupported markup')
        if (name not in ('title', 'desc', 'style') and (node.text or '').strip()) or (node.tail or '').strip():
            raise ValueError('The SVG logo contains unsupported text')
        if name == 'style':
            styles += 1
            if node.get('type') == 'text/css':
                del node.attrib['type']
            if styles > 1 or node.attrib or len(node):
                raise ValueError('The SVG logo contains unsupported stylesheet markup')
            node.text = stylesheet(node.text, references)
        if name == 'use':
            symbol_references += 1
            if (symbol_references > MAX_SYMBOL_REFERENCES
                    or sum(attr in node.attrib for attr in HREF_ATTRIBUTES) != 1
                    or any(parent.tag == f'{{{SVG}}}symbol' for parent in node.iterancestors())):
                raise ValueError('The SVG logo contains unsupported symbol reuse')
        for attribute, value in list(node.attrib.items()):
            if node is root and (
                (attribute == XML_SPACE and value == 'preserve')
                or (attribute == 'style' and ROOT_BACKGROUND.fullmatch(value.strip()))
            ):
                # The filter-era background hint and text spacing have no
                # effect on the permitted geometry and never reach the renderer.
                del node.attrib[attribute]
                continue
            if attribute == 'data-name':
                del node.attrib[attribute]
                continue
            if attribute in HREF_ATTRIBUTES and (name in GRADIENTS or name == 'use'):
                if not FRAGMENT.fullmatch(value):
                    raise ValueError('SVG logos cannot reference external resources')
                references.append((value[1:], {'symbol'} if name == 'use' else GRADIENTS))
                continue
            if attribute not in ATTRIBUTES or '\\' in value:
                raise ValueError('The SVG logo contains an unsupported attribute')
            if attribute == 'id':
                seen.setdefault(value, []).append(node)
                continue
            if attribute == 'class' and not all(CLASS_NAME.fullmatch(item) for item in value.split()):
                raise ValueError('The SVG logo contains an unsupported class name')
            value = value.strip()
            if (not presentation_reference(attribute, value, references)
                    and attribute in REFERENCE_ATTRIBUTES and '(' in value and not COLOR_FUNCTION.fullmatch(value)):
                raise ValueError('The SVG logo contains an unsupported presentation value')
    linked_ids = set()
    for identifier, targets in references:
        nodes = seen.get(identifier, [])
        if len(nodes) != 1 or etree.QName(nodes[0]).localname not in targets:
            raise ValueError('The SVG logo contains an invalid local reference')
        linked_ids.add(identifier)
    # Class-only styles cannot select decorative, unreferenced editor IDs.
    for identifier in seen.keys() - linked_ids:
        for node in seen[identifier]:
            del node.attrib['id']
    return etree.tostring(root, encoding='utf-8'), size


def rasterize(body, side, max_side, max_pixels, *, deadline=None):
    document, (width, height) = validated_document(body, side, max_side, max_pixels)
    end = min(deadline if deadline is not None else float('inf'), monotonic() + RENDER_SECONDS)
    if not RENDER_SLOTS.acquire(timeout=max(0, end - monotonic())):
        raise ValueError('SVG logo rendering is busy')
    try:
        process = subprocess.run(
            [sys.executable, '-I', str(Path(__file__).resolve()), str(width), str(height)],
            input=document, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            timeout=max(0, end - monotonic()), check=True,
        )
    except (subprocess.SubprocessError, OSError) as exc:
        raise ValueError('The SVG logo could not be rendered safely') from exc
    finally:
        RENDER_SLOTS.release()
    if not 0 < len(process.stdout) <= side * side * 4 + 4096:
        raise ValueError('The rasterized logo exceeds its size limit')
    return process.stdout


if __name__ == '__main__':
    from resvg_py import svg_to_bytes

    width, height = map(int, sys.argv[1:])
    sys.stdout.buffer.write(svg_to_bytes(
        svg_string=sys.stdin.buffer.read().decode('utf-8'),
        width=width, height=height, skip_system_fonts=True,
    ))
