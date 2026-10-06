(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const set = (id, value) => { $(id).textContent = value; };
  const node = (tag, text, className) => { const element = document.createElement(tag); element.textContent = text; if (className) element.className = className; return element; };
  function setupMenu() {
    const menu = document.querySelector('.menu-toggle'), nav = $('site-nav');
    menu?.addEventListener('click', () => {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(open)); nav.classList.toggle('open', open);
    });
    nav?.addEventListener('click', event => { if (event.target.closest('a')) { nav.classList.remove('open'); menu?.setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && nav?.classList.contains('open')) { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.focus(); } });
  }
  function setup() {
    setupMenu();
    const form = $('negotiation-form');
    if (!form) return;
    const E = window.NegotiationEngine, { money, percent } = E;
    let current = null;
    const strategyNames = { balanced: '추천 1차 역제안', defense: '가격 방어 전략', fast: '빠른 판매 전략' };
    function errors(formId, boxId, items) {
      const targetForm = $(formId), box = $(boxId);
      targetForm.querySelectorAll('[aria-invalid]').forEach(el => { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-errormessage'); });
      box.replaceChildren(...items.map(error => node('p', error.text)));
      items.forEach(error => { const field = $(error.field); field?.setAttribute('aria-invalid', 'true'); field?.setAttribute('aria-errormessage', boxId); });
      if (items.length) { box.focus(); $(items[0].field)?.focus(); }
      return items.length > 0;
    }
    function readInput() {
      const input = { itemName: $('itemName').value.trim(), quickTrade: $('quickTrade').checked };
      ['listingPrice', 'buyerOffer', 'minimumPrice'].forEach(key => { input[key] = E.parseAmount($(key).value); });
      [...Object.keys(E.rules), 'tradeMethod'].forEach(key => { input[key] = $(key).value; });
      return input;
    }
    function focusSection(id) { $(id).focus({ preventScroll: true }); $(id).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }
    function updateReply() {
      if (!current) return;
      const offer = current.rounds.length ? current.previousBuyer : current.input.buyerOffer;
      set('reply-context', `${current.replySource} · ${money(current.replyPrice)}`);
      set('response-text', E.reply(current.input, current.replyPrice, $('replyStyle').value, offer));
      set('copy-status', '');
    }
    function updateRoundContext() {
      set('round-context', `첫 구매자 제안 ${money(current.input.buyerOffer)} · 직전 구매자 제안 ${money(current.previousBuyer)} · 다음 기록 ${current.rounds.length + 1}회차`);
    }
    function chooseStrategy(strategy) {
      current.strategy = strategy;
      document.querySelectorAll('.strategy-select').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.strategy === strategy)));
      const price = strategy === 'balanced' ? current.analysis.counter : current.analysis[strategy];
      if (!current.rounds.length) {
        current.replyPrice = price; current.replySource = strategyNames[strategy]; $('sellerCounter').value = price.toLocaleString('ko-KR'); updateReply();
      }
      set('selected-strategy', current.rounds.length ? `${strategyNames[strategy]} 선택됨. 이미 계산한 답변 가격과 실제 대화 기록은 유지하며, 다음 재협상 계산부터 반영합니다.` : `${strategyNames[strategy]} 선택됨 · ${money(price)}을 답변과 첫 재협상 입력에 반영했습니다.`);
    }
    function resetRounds() {
      current.rounds = []; current.previousBuyer = current.input.buyerOffer;
      $('round-result').hidden = true; $('round-history').replaceChildren(); $('reset-rounds').hidden = true; $('nextBuyerOffer').value = '';
      errors('round-form', 'round-errors', []); chooseStrategy(current.strategy); updateRoundContext();
    }
    function render(input) {
      const analysis = E.analyze(input);
      current = { input, analysis, strategy: 'balanced', previousBuyer: input.buyerOffer, rounds: [], replyPrice: analysis.counter, replySource: strategyNames.balanced };
      set('result-item', input.itemName || '입력한 판매 상황');
      set('summary-text', analysis.discount ? `판매 가격 ${money(input.listingPrice)}에 대해 구매자는 ${money(input.buyerOffer)}, 즉 ${money(analysis.discount)} 낮은 가격을 제안했습니다.` : `구매자가 판매 가격 ${money(input.listingPrice)}을 그대로 제안했습니다.`);
      set('offer-ratio', percent(analysis.offerRatio)); set('discount-amount', money(analysis.discount)); set('discount-rate', percent(analysis.discountRate)); set('discount-label', analysis.label);
      $('situation-tags').replaceChildren(...Object.keys(E.rules).map(key => node('span', E.rules[key][input[key]][1], 'tag')));
      set('situation-text', analysis.situation); set('range-text', analysis.rangeText);
      set('room-text', analysis.room === 0 ? '설정상 추가 가격 조정 폭이 없습니다. 시간·장소 등 가격 외 조건을 비교하세요.' : analysis.room / input.listingPrice < 0.05 ? '내부 가격 조정 폭이 판매가에 비해 좁습니다. 반복 인하보다 조건 조율을 우선할 수 있습니다.' : '내부 가격 조정 여지는 있지만, 첫 답변에서 모두 사용할 필요는 없습니다. 상대가 가격을 올리는지도 보세요.');
      set('counter-price', money(analysis.counter)); set('counter-reason', analysis.counterReason);
      $('reason-list').replaceChildren(...analysis.reasons.map(reason => { const li = node('li', ''); li.append(node('strong', reason.label), node('p', reason.text)); return li; }));
      set('defense-price', money(analysis.defense)); set('fast-price', money(analysis.fast));
      set('strategy-gap', analysis.defense === analysis.fast ? '두 전략의 후보 가격이 같습니다. 구매자 제안이나 내부 범위 보정 때문에 가격 차이가 없어도, 거래 시점과 비용으로 비교할 수 있습니다.' : `두 전략의 차이는 ${money(analysis.defense - analysis.fast)}입니다. 빠른 판매 후보는 상대적으로 더 양보하는 가격입니다. 추가 대기와 이 금액 중 무엇이 중요한지 직접 정하세요.`);
      resetRounds();
      $('comparison-form').reset(); $('comparison-result').hidden = true; errors('comparison-form', 'comparison-errors', []);
      $('aPrice').value = analysis.fast.toLocaleString('ko-KR'); $('bPrice').value = analysis.defense.toLocaleString('ko-KR');
      $('aMethod').value = input.tradeMethod; $('bMethod').value = input.tradeMethod;
      const steps = [analysis.withinRange ? '구매자가 현재 가격에 동의하면 상태·구성품·비용 부담과 일정을 확인하고 수락을 결정하세요.' : '구매자가 내부 범위 밖의 가격을 고수하면 무리하게 맞추기보다 현재 역제안을 유지하거나 정중히 거절하세요.', '구매자가 가격을 올리면 ‘다음 대화’에 입력해 가격 차이가 실제로 줄었는지 비교하세요.', input.quickTrade ? '빠른 거래 약속이 구체적인지 확인하세요. 일정이 미뤄지면 같은 할인 조건을 계속 유지할지 다시 판단하세요.' : '가격이 멈췄다면 시간·장소·배송비를 바꿀 수 있는지 ‘거래 조건’에서 비교하세요.', input.inquiries === 'none' ? '문의가 계속 없으면 가격만 반복해서 낮추지 말고 사진·설명·거래 가능 지역을 점검한 뒤 판매 상황을 다시 입력하세요.' : '다른 문의는 실제 구매 확정과 구분하세요. 먼저 합의한 약속이 있다면 그 조건을 확인하세요.'];
      $('next-steps').replaceChildren(...steps.map(text => node('li', text)));
      $('results').hidden = false; focusSection('results');
    }
    function invalidate() {
      if (!current) return;
      current = null; $('results').hidden = true;
      set('example-status', '판매 조건이 바뀌었습니다. 분석 버튼을 누르면 새 조건으로 결과와 기록을 다시 만듭니다.');
    }
    form.addEventListener('input', invalidate); form.addEventListener('change', invalidate);
    form.addEventListener('submit', event => { event.preventDefault(); const input = readInput(); if (errors('negotiation-form', 'form-errors', E.validate(input))) { $('results').hidden = true; current = null; return; } set('example-status', ''); render(input); });
    $('edit-input').addEventListener('click', () => { $('listingPrice').focus(); });
    document.querySelectorAll('.strategy-select').forEach(button => button.addEventListener('click', () => { if (current) chooseStrategy(button.dataset.strategy); }));
    $('replyStyle').addEventListener('change', updateReply);
    $('reset-rounds').addEventListener('click', () => { if (current) resetRounds(); });
    $('round-form').addEventListener('input', () => { $('round-result').hidden = true; });
    $('round-form').addEventListener('submit', event => {
      event.preventDefault(); if (!current) return;
      const seller = E.parseAmount($('sellerCounter').value), buyer = E.parseAmount($('nextBuyerOffer').value);
      const round = E.simulate(current.input, current.previousBuyer, seller, buyer, current.strategy);
      if (errors('round-form', 'round-errors', round.errors)) { $('round-result').hidden = true; return; }
      const previous = current.previousBuyer;
      current.rounds.push({ seller, buyer, previous, next: round.next }); current.previousBuyer = buyer;
      set('round-direction', round.direction);
      const firstMovement = buyer - current.input.buyerOffer;
      const signedMoney = value => value === 0 ? '변화 없음' : `${money(Math.abs(value))} ${value > 0 ? '상승' : '하락'}`;
      const metrics = [`첫 제안 대비: ${signedMoney(firstMovement)}`, `직전 제안 대비: ${signedMoney(round.movement)}`, `이번 판매자 제안 기준 가격 차이: ${money(round.beforeGap)} → ${money(round.afterGap)}`, `가격 차이 ${round.gapReduction === 0 ? '변화 없음' : `${money(Math.abs(round.gapReduction))} ${round.gapReduction > 0 ? '축소' : '확대'}`}`];
      $('round-metrics').replaceChildren(...metrics.map(text => node('p', text)));
      set('round-detail', `${round.detail} ${round.movement > 0 ? '가격상 진전은 있지만 실제 거래 의지나 성사를 보장하지 않습니다.' : ''}`);
      set('round-next', money(round.next));
      set('round-reason', round.matched ? '구매자가 도달한 기존 판매자 제안 가격을 유지했습니다.' : round.movement <= 0 ? '구매자의 추가 양보가 없어 판매자 가격을 자동 인하하지 않았습니다.' : round.next === buyer ? '내부 범위 안이며 작은 가격 차이 또는 선택한 빠른 판매 전략에 따라 현재 제안을 수락 후보로 삼았습니다.' : `${strategyNames[current.strategy]}에 따라 남은 조정 가능 구간의 ${current.strategy === 'defense' ? '20%' : current.strategy === 'fast' ? '60%' : '35%'}만 양보합니다. 금액 단위를 올림하고 내부 범위와 구매자 제안, 이번 판매자 제안 사이로 제한합니다.`);
      const li = node('li', `${current.rounds.length}회차 · 판매자 ${money(seller)} → 구매자 ${money(buyer)} · 다음 후보 ${money(round.next)}`); $('round-history').append(li);
      current.replyPrice = round.next; current.replySource = `${current.rounds.length}회차 재협상 후보`;
      $('sellerCounter').value = round.next.toLocaleString('ko-KR'); $('nextBuyerOffer').value = '';
      $('round-result').hidden = false; $('reset-rounds').hidden = false; updateRoundContext(); updateReply();
    });
    $('comparison-form').addEventListener('input', () => { $('comparison-result').hidden = true; });
    $('comparison-form').addEventListener('change', () => { $('comparison-result').hidden = true; });
    $('comparison-form').addEventListener('submit', event => {
      event.preventDefault(); if (!current) return;
      const read = key => ({ price: E.parseAmount($(key + 'Price').value), days: E.parseAmount($(key + 'Days').value), cost: E.parseAmount($(key + 'Cost').value || '0'), method: $(key + 'Method').value });
      const a = read('a'), b = read('b'), comparison = E.compare(current.input, a, b);
      if (errors('comparison-form', 'comparison-errors', comparison.errors)) { $('comparison-result').hidden = true; return; }
      const { netA, netB, priceDifference, netDifference, daysDifference } = comparison;
      set('comparison-summary', `표시 가격 차이 ${money(Math.abs(priceDifference))} · 비용 차감 후 차이 ${money(Math.abs(netDifference))} · 거래 시점 차이 ${Math.abs(daysDifference)}일`);
      const card = (name, option, other, net, otherNet, within) => {
        const article = node('article', '', 'comparison-card');
        article.append(node('h4', `${name} · ${option.days === 0 ? '오늘' : `${option.days}일 뒤`} ${E.methods[option.method]}`), node('p', `실수령 ${money(net)}`, 'strategy-price'));
        const benefits = [], costs = [];
        if (net > otherNet) benefits.push(`상대 조건보다 ${money(net - otherNet)} 더 받습니다`);
        else if (net < otherNet) costs.push(`상대 조건보다 ${money(otherNet - net)} 덜 받습니다`);
        if (option.days < other.days) benefits.push(`${other.days - option.days}일 먼저 정리할 수 있습니다`);
        else if (option.days > other.days) costs.push(`${option.days - other.days}일 더 기다리며 일정 변경 가능성을 감수합니다`);
        article.append(node('p', `장점: ${benefits.join('. ') || '금액과 시점만으로 상대 조건보다 나은 점은 없습니다'}.`), node('p', `부담: ${costs.join('. ') || '금액과 시점에서 추가 부담 차이가 없습니다'}.`));
        article.append(node('p', option.method === 'parcel' ? '택배: 포장·발송 가능일과 배송비 부담을 확인하세요.' : option.method === 'direct' ? '직거래: 이동 거리와 약속 장소, 시간을 확인하세요.' : '협의: 거래 방식이 정해지면 비용과 날짜를 다시 입력하세요.'));
        article.append(node('p', within ? '비용 차감 후에도 현재 내부 협상 범위 안입니다.' : '비용 차감 후 현재 내부 협상 범위 밖입니다. 비용이나 가격 조건을 다시 협의할 수 있습니다.', 'small'));
        return article;
      };
      $('comparison-cards').replaceChildren(card('A', a, b, netA, netB, comparison.aWithin), card('B', b, a, netB, netA, comparison.bWithin));
      set('comparison-choice', `${daysDifference === 0 ? '거래 시점은 같습니다.' : `빠른 정리가 중요하면 ${daysDifference > 0 ? 'A' : 'B'}의 일정이 앞섭니다.`} ${netDifference === 0 ? '실수령액도 같습니다. 장소와 약속의 구체성을 비교하세요.' : `받는 금액이 중요하면 ${netDifference > 0 ? 'B' : 'A'}의 실수령액이 더 큽니다.`} 어느 쪽이든 일정이 실제로 가능한지 확인한 뒤 선택하세요.`);
      $('comparison-result').hidden = false;
    });
    $('copy-response').addEventListener('click', async () => {
      const copied = $('response-text').textContent;
      try { await navigator.clipboard.writeText(copied); if (copied === $('response-text').textContent) set('copy-status', '답변을 복사했습니다.'); }
      catch { const selection = window.getSelection(), range = document.createRange(); range.selectNodeContents($('response-text')); selection.removeAllRanges(); selection.addRange(range); set('copy-status', '자동 복사가 지원되지 않아 문구를 선택했습니다. 길게 누르거나 Ctrl/Cmd+C로 복사해 주세요.'); $('response-text').focus(); }
    });
    function loadExample(key) {
      const example = window.NegotiationExamples[key]; if (!example) return;
      invalidate();
      Object.entries(example).forEach(([id, value]) => { if (id === 'quickTrade') $(id).checked = value; else $(id).value = typeof value === 'number' ? value.toLocaleString('ko-KR') : value; });
      errors('negotiation-form', 'form-errors', []);
      set('example-status', `${key.replace('case-', '사례 ')}의 연습용 조건을 불러왔습니다. 확인 후 분석해 주세요.${key === 'case-4' ? ' 재협상에서 판매자 475,000원, 구매자 450,000원을 입력해 보세요.' : key === 'case-5' ? ' 거래 조건에서 A 470,000원·오늘, B 490,000원·5일 뒤를 비교해 보세요.' : ''}`);
    }
    $('load-example').addEventListener('click', () => { loadExample('case-1'); $('listingPrice').focus(); });
    // Only fixed editorial example IDs are read from the URL. User input is never serialized there.
    function loadLinkedExample() {
      const exampleKey = location.hash.slice(1);
      if (Object.hasOwn(window.NegotiationExamples, exampleKey)) {
        loadExample(exampleKey);
        $('calculator').scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    }
    loadLinkedExample();
    window.addEventListener('hashchange', loadLinkedExample);
    $('analyze-button').disabled = false;
    window.addEventListener('pageshow', event => { if (event.persisted) { form.reset(); current = null; $('results').hidden = true; set('example-status', ''); } });
  }
  document.addEventListener('DOMContentLoaded', setup);
}());
