"""Static release checks; uses only the Python standard library."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import re
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://used-market-negotiation-helper.vercel.app'
PAGES = ['index.html', 'about.html', 'guide.html', 'faq.html', 'privacy.html', 'contact.html']
PROTECTED = ['ads.txt', 'google88dd3956862ee470.html', 'naverd0dfa0302d13e790a193b4a2f642216a.html', 'sitemap.xml', 'robots.txt']

class Document(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.ids, self.links, self.canonical, self.og = [], [], [], []
        self.has_description = False
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        if attrs.get('href'):
            self.links.append(attrs['href'])
        if attrs.get('src'):
            self.links.append(attrs['src'])
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical.append(attrs.get('href'))
        if tag == 'meta' and attrs.get('property') == 'og:url':
            self.og.append(attrs.get('content'))
        if tag == 'meta' and attrs.get('name') == 'description':
            self.has_description = bool(attrs.get('content'))

def audit():
    docs = {file: Document((ROOT / file).read_text(encoding='utf-8')) for file in PAGES}
    link_count = 0
    for file, doc in docs.items():
        expected = BASE + ('/' if file == 'index.html' else '/' + file)
        assert doc.canonical == [expected], (file, 'canonical')
        assert doc.og == [expected], (file, 'og:url')
        assert doc.has_description
        source = (ROOT / file).read_text(encoding='utf-8')
        assert re.search(r'<title>[^<]+</title>', source)
        assert len(doc.ids) == len(set(doc.ids)), (file, 'duplicate IDs')
        assert not re.search(r'[\u3040-\u30ff]', source), (file, 'unexpected Japanese text')
        for link in doc.links:
            parsed = urlsplit(link)
            if parsed.scheme or parsed.netloc:
                continue
            destination = unquote(parsed.path) or file
            assert (ROOT / destination).is_file(), (file, link, 'missing local file')
            if parsed.fragment:
                fragment = unquote(parsed.fragment)
                if destination == 'index.html' and re.fullmatch(r'case-[1-6]', fragment):
                    assert fragment in (ROOT / 'js/examples.js').read_text(encoding='utf-8')
                else:
                    assert fragment in docs[destination].ids, (file, link, 'missing anchor')
            link_count += 1
    for file in PROTECTED:
        before = subprocess.check_output(['git', 'show', f'HEAD:{file}'], cwd=ROOT).replace(b'\r\n', b'\n')
        after = (ROOT / file).read_bytes().replace(b'\r\n', b'\n')
        assert before == after, (file, 'protected file changed')
    script_re = r'<script\b[^>]*src="https://pagead2\.googlesyndication\.com[^>]*>\s*</script>'
    for file in PAGES:
        original = subprocess.check_output(['git', 'show', f'HEAD:{file}'], cwd=ROOT).decode('utf-8').replace('\r\n', '\n')
        updated = (ROOT / file).read_text(encoding='utf-8')
        assert re.findall(script_re, original) == re.findall(script_re, updated), (file, 'AdSense changed')
    assert 'google.com, pub-1560924786638070, DIRECT, f08c47fec0942fa0' in (ROOT / 'ads.txt').read_text()
    assert 'rlawhddh3803@naver.com' in (ROOT / 'contact.html').read_text(encoding='utf-8')
    ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    urls = [el.text for el in ET.parse(ROOT / 'sitemap.xml').findall('s:url/s:loc', ns)]
    assert set(urls) == {BASE + ('/' if file == 'index.html' else '/' + file) for file in PAGES}
    assert 'Sitemap: ' + BASE + '/sitemap.xml' in (ROOT / 'robots.txt').read_text()
    for path in (ROOT / 'js').glob('*.js'):
        text = path.read_text(encoding='utf-8')
        assert not re.search(r'\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB)\b|document\.cookie|\.innerHTML\s*=', text), path
    # Inputs intentionally have no names: native form submission cannot serialize personal values.
    index = (ROOT / 'index.html').read_text(encoding='utf-8')
    assert not re.search(r'<(?:input|select|textarea)\b[^>]*\bname=', index)
    subprocess.run(['git', 'diff', '--check'], cwd=ROOT, check=True)
    print(f'PASS static audit: {len(PAGES)} pages, {link_count} local links/anchors; SEO, AdSense, protected files and privacy checks')

if __name__ == '__main__':
    audit()
