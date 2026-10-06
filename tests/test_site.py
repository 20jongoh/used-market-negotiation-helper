"""End-to-end checks in installed Chrome. Dev-only, no site dependencies."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import sys
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.test-tools'))
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright
from audit import audit, PAGES

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

def check(condition, message):
    if not condition:
        raise AssertionError(message)

def run():
    audit()
    output = ROOT / '.qa'
    output.mkdir(exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    assertions = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 900}, locale='ko-KR', reduced_motion='reduce')
        # Do not contact Google during local QA. Production AdSense markup is unchanged.
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
        page = context.new_page()
        errors, requests = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: requests.append(request.url))
        page.goto(base + '/index.html', wait_until='networkidle')
        page.screenshot(path=str(output / 'desktop-home.png'), full_page=True)
        engine = page.evaluate('''() => {
          const E = NegotiationEngine, base = NegotiationExamples['case-1'];
          const ok = (condition, message) => { if (!condition) throw Error(message); };
          let checks = 0;
          const cases = [
            {...base, listingPeriod:'today', urgency:'notUrgent', inquiries:'several'},
            {...base, minimumPrice:420000, listingPeriod:'overTwoWeeks', urgency:'veryUrgent', inquiries:'none'},
            {...base, listingPrice:100000, buyerOffer:95000, minimumPrice:90000},
            {...base, listingPrice:100000, buyerOffer:50000, minimumPrice:90000}
          ];
          const normal = cases.map(input => { const r=E.analyze(input); return {counter:r.counter, defense:r.defense, fast:r.fast, discount:r.discount, rate:r.discountRate, within:r.withinRange}; });
          ok(normal[0].counter===495000, 'fresh listing expected 495000');
          ok(normal[1].counter===446000, 'stale urgent listing expected 446000');
          ok(normal[2].rate===5 && normal[2].within, '5% within range');
          ok(normal[3].rate===50 && !normal[3].within, '50% outside range'); checks+=4;
          const negotiation=E.simulate(base,400000,475000,450000);
          ok(negotiation.movement===50000 && negotiation.beforeGap===75000 && negotiation.afterGap===25000 && negotiation.next===467000, 'required renegotiation'); checks++;
          for (const value of ['', '0', '-1', 'abc', '100.5', '10,00', '1e6', '999999999999999999999', '1000000001']) {
            ok(E.validate({...base, listingPrice:E.parseAmount(value)}).length>0, 'invalid input '+value); checks++;
          }
          ok(E.parseAmount('500,000')===500000 && E.parseAmount(' 1000 ')===1000, 'valid formatting'); checks++;
          ok(E.validate({...base, minimumPrice:500001}).some(e=>e.field==='minimumPrice'), 'floor above listing');
          ok(E.validate({...base, buyerOffer:500001}).some(e=>e.field==='buyerOffer'), 'offer above listing'); checks+=2;
          for(const condition of Object.keys(E.rules.condition)) for(const listingPeriod of Object.keys(E.rules.listingPeriod)) for(const urgency of Object.keys(E.rules.urgency)) for(const inquiries of Object.keys(E.rules.inquiries)) for(const quickTrade of [false,true]) {
            for(const prices of [[500000,400000,450000],[999,1,2],[100001,99999,100000],[1,1,1],[1000000000,999999999,900000000]]) {
              const [listingPrice,buyerOffer,minimumPrice]=prices;
              const input={...base,listingPrice,buyerOffer,minimumPrice,condition,listingPeriod,urgency,inquiries,quickTrade};
              const r=E.analyze(input);
              ok(r.fast<=r.counter && r.counter<=r.defense, 'ordered strategies');
              for(const price of [r.fast,r.counter,r.defense]) ok(Number.isSafeInteger(price) && price>=minimumPrice && price>=buyerOffer && price<=listingPrice, 'quote bounds');
              checks++;
            }
          }
          const middle=E.analyze(base).counter;
          for(const update of [{condition:'unopened'},{listingPeriod:'today'},{urgency:'notUrgent'},{inquiries:'several'}]) ok(E.analyze({...base,...update}).counter>middle,'defense factor used');
          for(const update of [{condition:'heavyUse'},{listingPeriod:'overTwoWeeks'},{urgency:'veryUrgent'},{inquiries:'none'},{quickTrade:true}]) ok(E.analyze({...base,...update}).counter<middle,'concession factor used'); checks+=9;
          for(const nextBuyer of [350000,400000,430000,450000,470000,475000,480000]) for(const strategy of ['balanced','fast','defense']) {
            const r=E.simulate(base,400000,475000,nextBuyer,strategy);
            ok(!r.errors.length && r.next>=base.minimumPrice && r.next<=475000, 'round bounds');
            if(nextBuyer<=400000) ok(r.next===475000,'no reward for lowering'); checks++;
          }
          ok(E.simulate(base,400000,440000,450000).errors.length>0,'invalid seller floor');
          ok(E.simulate(base,400000,475000,500001).errors.length>0,'invalid next buyer'); checks+=2;
          const comparison=E.compare(base,{price:470000,cost:0,days:0,method:'direct'},{price:490000,cost:0,days:5,method:'direct'});
          ok(comparison.priceDifference===20000 && comparison.netDifference===20000 && comparison.daysDifference===5,'condition differences'); checks++;
          for(const option of [{price:0,cost:0,days:0,method:'direct'},{price:470000,cost:470001,days:0,method:'direct'},{price:470000,cost:0,days:-1,method:'direct'},{price:470000,cost:0,days:366,method:'direct'}]) ok(E.compare(base,option,{price:490000,cost:0,days:5,method:'direct'}).errors.length>0,'invalid comparison'); checks+=4;
          const examples=Object.fromEntries(Object.entries(NegotiationExamples).map(([key,input])=>{const r=E.analyze(input);return [key,{counter:r.counter,defense:r.defense,fast:r.fast}];}));
          const expected={'case-1':[483000,491000,472000],'case-2':[294000,299000,281000],'case-3':[446000,459000,428000],'case-4':[483000,491000,472000],'case-5':[471000,482000,456000],'case-6':[788000,798000,766000]};
          for(const [key,r] of Object.entries(examples)) ok(JSON.stringify([r.counter,r.defense,r.fast])===JSON.stringify(expected[key]),'guide consistency '+key); checks+=6;
          for(const style of ['polite','firm','fast','defense']) {const reply=E.reply(base,483000,style);ok(reply.includes(base.itemName)&&reply.includes('483,000원')&&!reply.includes('450,000원')&&!reply.includes('오늘'),'reply uses real inputs only');checks++;}
          return {checks,normal,negotiation,examples};
        }''')
        print('PASS engine:', engine['checks'], 'scenario/invariant checks')
        assertions += engine['checks']
        def fill_case(listing='500000', offer='400000', minimum='450000', **options):
            for key, value in [('listingPrice', listing), ('buyerOffer', offer), ('minimumPrice', minimum)]:
                page.locator('#' + key).fill(value)
            for key, value in options.items():
                page.locator('#' + key).select_option(value)
            page.locator('#analyze-button').click()
        # Each required error case must reach a readable UI error with no stale output.
        for invalid in ['', '0', '-10', 'hello', '1000000001']:
            fill_case(listing=invalid)
            check(page.locator('#form-errors').inner_text() != '', 'readable primary error')
            check(page.locator('#results').is_hidden(), 'invalid result hidden')
            assertions += 2
        fill_case(minimum='500001'); check('클 수 없습니다' in page.locator('#form-errors').inner_text(), 'floor UI error')
        fill_case(offer='500001'); check('높습니다' in page.locator('#form-errors').inner_text(), 'offer UI error')
        for listing, offer, minimum, opts, expected in [
            ('500000','400000','450000',dict(listingPeriod='today',urgency='notUrgent',inquiries='several'),'495,000원'),
            ('500000','400000','420000',dict(listingPeriod='overTwoWeeks',urgency='veryUrgent',inquiries='none'),'446,000원'),
            ('100000','95000','90000',dict(listingPeriod='fourSevenDays',urgency='slightlyUrgent',inquiries='occasional'),'96,000원'),
            ('100000','50000','90000',dict(listingPeriod='fourSevenDays',urgency='slightlyUrgent',inquiries='occasional'),'97,000원')]:
            fill_case(listing,offer,minimum,**opts)
            check(page.locator('#counter-price').inner_text()==expected, 'normal UI candidate')
            assertions+=1
        page.locator('#load-example').click(); page.locator('#analyze-button').click()
        check('450,000원' not in page.locator('#results').inner_text(), 'private floor not rendered')
        # No HTML injection even through the optional product name.
        page.locator('#itemName').fill('<img src=x onerror=alert(1)>상품')
        page.locator('#analyze-button').click()
        check(page.locator('#result-item img').count()==0, 'product name is text only')
        for strategy in ['defense','fast','balanced']:
            page.locator(f'[data-strategy="{strategy}"]').click()
            check(page.locator(f'[data-strategy="{strategy}"]').get_attribute('aria-pressed')=='true', 'strategy selected')
        for style in ['polite','firm','fast','defense']:
            page.locator('#replyStyle').select_option(style)
            check('483,000원' in page.locator('#response-text').inner_text(), 'style does not silently change price')
        # Real clipboard success, then explicit failure fallback.
        context.grant_permissions(['clipboard-read','clipboard-write'])
        page.locator('#copy-response').click()
        page.wait_for_function("document.getElementById('copy-status').textContent.includes('복사했습니다')")
        copied = page.evaluate('navigator.clipboard.readText()').replace('\r\n', '\n')
        check(copied==page.locator('#response-text').text_content(),'clipboard content')
        page.evaluate("() => { navigator.clipboard.writeText=async()=>{throw Error('test-denied')}; }")
        page.locator('#copy-response').click()
        check('자동 복사' in page.locator('#copy-status').inner_text(),'clipboard fallback')
        page.locator('#sellerCounter').fill('475000'); page.locator('#nextBuyerOffer').fill('450000')
        page.locator('#round-form button[type=submit]').click()
        check('75,000원 → 25,000원' in page.locator('#round-metrics').inner_text(),'round gap UI')
        check(page.locator('#round-next').inner_text()=='467,000원','next quote UI')
        check('467,000원' in page.locator('#response-text').inner_text(),'round connected to reply')
        page.locator('#nextBuyerOffer').fill('460000'); page.locator('#round-form button[type=submit]').click()
        check(page.locator('#round-history li').count()==2,'multi-round history')
        page.locator('[data-strategy=defense]').click()
        check(page.locator('#round-history li').count()==2,'strategy switch keeps history')
        page.locator('#nextBuyerOffer').fill('0'); page.locator('#round-form button[type=submit]').click()
        check(page.locator('#round-errors').inner_text()!='' and page.locator('#round-result').is_hidden(),'invalid round hides stale result')
        page.locator('#aPrice').fill('470000'); page.locator('#bPrice').fill('490000')
        page.locator('#comparison-form button').click()
        check('20,000원' in page.locator('#comparison-summary').inner_text() and '5일' in page.locator('#comparison-summary').inner_text(),'condition UI')
        page.locator('#aCost').fill('10000'); check(page.locator('#comparison-result').is_hidden(),'comparison edits hide stale result')
        page.locator('#comparison-form button').click()
        check('30,000원' in page.locator('#comparison-summary').inner_text(),'net cost UI')
        page.locator('#aDays').fill('-1'); page.locator('#comparison-form button').click()
        check(page.locator('#comparison-errors').inner_text()!='','comparison validation')
        page.locator('#aDays').fill('0'); page.locator('#comparison-form button').click()
        page.locator('#round-form').evaluate('(form)=>form.reset()')
        page.locator('#reset-rounds').click()
        check(page.locator('#round-history li').count()==0,'round reset')
        requests_before = len(requests)
        fill_case(); page.locator('[data-strategy=fast]').click(); page.locator('#replyStyle').select_option('polite')
        check(len(requests)==requests_before,'analysis creates no network requests')
        check(page.evaluate('localStorage.length===0 && sessionStorage.length===0'),'no browser storage')
        page.locator('#listingPrice').fill('600000')
        check(page.locator('#results').is_hidden(),'changed conditions hide old analysis')
        page.reload(wait_until='networkidle')
        check(page.locator('#listingPrice').input_value()=='' and page.locator('#results').is_hidden(),'reload clears input and results')
        # Responsive layout, long text, largest price, expanded reasons, all pages and nav.
        for width in [320,375,390,768,1280]:
            page.set_viewport_size({'width':width,'height':900})
            for file in PAGES:
                page.goto(base+'/'+file,wait_until='networkidle')
                if file=='index.html':
                    page.locator('#itemName').fill('가'*60)
                    fill_case('1000000000','900000000','800000000')
                    page.locator('.why summary').click()
                    page.locator('#comparison-form button').click()
                if width<=768:
                    page.locator('.menu-toggle').click()
                    check(page.locator('#site-nav').is_visible(),'mobile menu on '+file)
                    page.keyboard.press('Escape')
                check(page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), f'no horizontal overflow {file}@{width}')
                assertions+=1
                if width==390 and file=='index.html':
                    page.screenshot(path=str(output/'mobile-results.png'),full_page=True)
                if width==1280 and file=='index.html':
                    page.screenshot(path=str(output/'desktop-results.png'),full_page=True)
                if width==390 and file=='guide.html':
                    page.screenshot(path=str(output/'mobile-guide.png'),full_page=True)
        for number in range(1,7):
            page.goto(base+f'/index.html#case-{number}',wait_until='networkidle')
            page.locator('#analyze-button').click()
            check(page.locator('#results').is_visible(), 'example deep link')
            expected = engine['examples'][f'case-{number}']['counter']
            check(page.locator('#counter-price').inner_text()==f'{expected:,}원', 'example hash change loads correct scenario')
        page.set_viewport_size({'width':390,'height':844})
        page.goto(base+'/index.html#case-1',wait_until='networkidle')
        page.locator('#analyze-button').click()
        page.screenshot(path=str(output/'mobile-result-viewport.png'))
        page.locator('#strategies').screenshot(path=str(output/'mobile-strategies.png'))
        page.locator('#sellerCounter').fill('475000'); page.locator('#nextBuyerOffer').fill('450000')
        page.locator('#round-form button[type=submit]').click()
        page.locator('#renegotiation').screenshot(path=str(output/'mobile-round.png'))
        page.locator('#comparison-form button').click()
        page.locator('#trade-comparison').screenshot(path=str(output/'mobile-conditions.png'))
        page.locator('#reply').screenshot(path=str(output/'mobile-reply.png'))
        check(not errors, 'JavaScript errors: '+str(errors))
        report={'engine':engine,'layoutWidths':[320,375,390,768,1280],'pages':PAGES,'javascriptErrors':errors,'assertionsAtLeast':assertions,'uiFlows':'required normal/errors, styles, strategy sync, clipboard success/fallback, multi-round, comparison/net cost, reload, no network/storage, XSS, all examples'}
        (output/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(f'PASS browser: required scenarios and UI flows, 6 pages at 5 widths, no JS errors; {assertions}+ checks')
        browser.close()
    server.shutdown()

if __name__ == '__main__':
    run()
