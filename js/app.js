(function () {
  'use strict';
  const scoreRules = {
    condition: { unopened: 20, likeNew: 10, lightUse: 0, normalUse: -10, heavyUse: -20 },
    listingPeriod: { today: 15, twoThreeDays: 10, fourSevenDays: 0, oneTwoWeeks: -10, overTwoWeeks: -15 },
    urgency: { notUrgent: 20, slightlyUrgent: 10, moderatelyUrgent: 0, veryUrgent: -20 }
  };
  const urgencyRate = { notUrgent: .7, slightlyUrgent: .6, moderatelyUrgent: .5, veryUrgent: .25 };
  const labels = { notUrgent: '전혀 급하지 않음', slightlyUrgent: '조금 빨리 팔고 싶음', moderatelyUrgent: '적당히 빨리 팔고 싶음', veryUrgent: '최대한 빨리 팔고 싶음' };
  const money = value => `${Math.round(value).toLocaleString('ko-KR')}원`;
  const parseAmount = value => {
    const cleaned = String(value || '').replace(/[\s,원₩]/g, '');
    return /^\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
  };
  function validate(input) {
    const errors = [];
    ['listingPrice', 'buyerOffer', 'minimumPrice'].forEach(key => {
      if (!Number.isFinite(input[key]) || input[key] <= 0) errors.push(`${key === 'listingPrice' ? '현재 판매 가격' : key === 'buyerOffer' ? '구매자 제시 가격' : '최저 희망 가격'}은(는) 0보다 큰 숫자로 입력해 주세요.`);
    });
    if (Number.isFinite(input.minimumPrice) && Number.isFinite(input.listingPrice) && input.minimumPrice > input.listingPrice) errors.push('최저 희망 가격은 현재 판매 가격보다 클 수 없습니다.');
    if (Number.isFinite(input.buyerOffer) && Number.isFinite(input.listingPrice) && input.buyerOffer > input.listingPrice * 1.5) errors.push('구매자 제시 가격이 현재 판매 가격보다 지나치게 큽니다. 금액을 다시 확인해 주세요.');
    return errors;
  }
  function offerAnalysis(ratio) {
    if (ratio >= 95) return '매우 높은 제안';
    if (ratio >= 90) return '높은 제안';
    if (ratio >= 85) return '일반적인 협상 범위';
    if (ratio >= 80) return '낮은 제안';
    if (ratio >= 70) return '상당히 낮은 제안';
    return '매우 낮은 제안';
  }
  function flexibility(input) {
    const score = Math.max(0, Math.min(100, 50 + scoreRules.condition[input.condition] + scoreRules.listingPeriod[input.listingPeriod] + scoreRules.urgency[input.urgency]));
    let text = '';
    if (score >= 80) text = '협상 여유가 높은 편입니다.';
    else if (score >= 60) text = '어느 정도 협상이 가능합니다.';
    else if (score >= 40) text = '거래 상황을 고려해 가격을 조정하는 것이 좋습니다.';
    else if (score >= 20) text = '가격 조정에 신중할 필요가 있습니다.';
    else text = '빠른 판매를 원한다면 가격 조정 폭을 신중하게 검토해야 합니다.';
    return { score, text };
  }
  function roundPrice(value) { return Math.round(value / 1000) * 1000; }
  function calculate(input) {
    const ratio = (input.buyerOffer / input.listingPrice) * 100;
    const room = input.listingPrice - input.minimumPrice;
    let counter = roundPrice(input.minimumPrice + room * urgencyRate[input.urgency]);
    // Never recommend lower than the buyer offer, and never exceed the listing price.
    counter = Math.min(input.listingPrice, Math.max(counter, input.buyerOffer));
    const flex = flexibility(input);
    return { ratio, offerLabel: offerAnalysis(ratio), counter, flex, belowMinimum: input.buyerOffer < input.minimumPrice };
  }
  function strategies(input, result) {
    const items = [];
    if (result.ratio >= 90) items.push('가격 차이가 크지 않으므로 큰 폭으로 낮추기보다 소폭 조정한 가격을 먼저 제시해보세요.');
    else items.push('가격 차이가 큰 편이므로 처음부터 큰 폭으로 낮추기보다 거래 조건을 확인한 뒤 역제안하는 방법을 고려해보세요.');
    if (input.urgency === 'notUrgent') items.push('판매를 서두를 필요가 없다면 처음부터 최저 희망가격을 제시하지 않는 방법을 고려할 수 있습니다.');
    if (input.urgency === 'veryUrgent' || input.urgency === 'slightlyUrgent') items.push('빠른 거래가 중요하다면 가격을 조금 조정하는 대신 거래 시간과 장소를 명확하게 정하는 방법을 고려해보세요.');
    if (input.condition === 'unopened' || input.condition === 'likeNew') items.push('상품 상태가 좋은 편이라면 가격을 크게 낮추기 전에 현재 가격의 근거를 설명해보세요.');
    return items;
  }
  function responseText(input, result) {
    const name = input.itemName ? `${input.itemName} ` : '';
    if (input.urgency === 'veryUrgent') return `문의 감사합니다! ${name}오늘 거래 가능하시면 ${money(result.counter)}까지 조정해드릴 수 있습니다. 해당 가격에 거래 가능하실까요?`;
    if (result.belowMinimum || result.ratio < 80) return `문의 감사합니다. 말씀해주신 가격까지는 어려울 것 같아요. ${name}${money(result.counter)}까지는 조정 가능합니다. 해당 가격에 거래 가능하실까요?`;
    return `문의 감사합니다! ${name}현재 가격에서 조금 조정해서 ${money(result.counter)}까지 가능합니다. 해당 가격에 거래 가능하실까요?`;
  }
  function getInput(form) {
    const data = new FormData(form);
    return { itemName: String(data.get('itemName') || '').trim(), listingPrice: parseAmount(data.get('listingPrice')), buyerOffer: parseAmount(data.get('buyerOffer')), minimumPrice: parseAmount(data.get('minimumPrice')), condition: data.get('condition'), listingPeriod: data.get('listingPeriod'), urgency: data.get('urgency') };
  }
  function buildReNegotiation(counter) {
    const answer = money(counter);
    return [
      ['추천 역제안보다 조금 낮게 제시', '소폭 조정 여지가 있는지 거래 조건과 함께 판단하세요.', `“조금 조정해 ${answer}에 가능해요. 시간 맞으시면 진행할까요?”`],
      ['설정한 협상 범위보다 낮게 제시', '바로 수락하지 말고, 처음 제시한 역제안 가격을 유지해보세요.', `“말씀하신 가격은 어렵고 ${answer}까지 가능합니다.”`],
      ['계속 가격을 낮추는 경우', '반복 흥정에는 한 번 기준을 분명히 알리고 결정 시간을 주세요.', `“안내드린 ${answer}이 최종 조정 가능 가격입니다. 가능하시면 연락 주세요.”`],
      ['빠른 거래를 조건으로 낮춰달라는 경우', '빠른 거래의 장점과 추가 인하 폭을 분리해서 생각하세요.', `“오늘 거래 가능하시면 ${answer}에 진행 가능합니다.”`]
    ].map(([title, text, quote]) => `<article><h4>${title}</h4><p>${text}</p><blockquote>${quote}</blockquote></article>`).join('');
  }
  function renderResult(input, result) {
    document.querySelector('#results')?.remove();
    const fragment = document.querySelector('#result-template').content.cloneNode(true);
    document.querySelector('main').append(fragment);
    const set = (selector, value) => { document.querySelector(selector).textContent = value; };
    set('#result-item', input.itemName ? `상품명: ${input.itemName}` : '입력한 협상 조건을 기준으로 분석했습니다.');
    set('#result-listing', money(input.listingPrice)); set('#result-offer', money(input.buyerOffer));
    set('#result-ratio', `${result.ratio.toFixed(0)}%`); set('#result-ratio-label', `${result.offerLabel} · 내부 분석 기준`); set('#result-counter', money(result.counter));
    set('#result-flexibility', result.flex.text); set('#result-flexibility-detail', `협상 여유 점수는 ${result.flex.score}점입니다. 상품 상태, 등록 기간, 판매 급함을 조합한 참고 지표입니다.`);
    document.querySelector('#strategy-list').innerHTML = strategies(input, result).map(item => `<li>${item}</li>`).join('');
    const reply = responseText(input, result); set('#response-text', reply);
    const alerts = [];
    if (result.ratio < 70) alerts.push('구매자 제안 가격이 현재 판매 가격과 큰 차이가 있습니다. 가격을 바로 크게 낮추기보다 거래 조건을 확인하거나 기존 가격을 유지하면서 역제안하는 방법을 고려해볼 수 있습니다.');
    if (result.belowMinimum) alerts.push('현재 제안 가격으로는 판매자가 설정한 협상 범위보다 낮습니다. 바로 수락하기보다는 조금 높은 가격으로 역제안하는 방법을 고려해볼 수 있습니다.');
    document.querySelector('#result-alerts').innerHTML = alerts.map(x => `<p class="result-alert">${x}</p>`).join('');
    document.querySelector('#renegotiation-list').innerHTML = buildReNegotiation(result.counter);
    document.querySelector('#copy-response').addEventListener('click', async () => {
      const status = document.querySelector('#copy-status');
      try { await navigator.clipboard.writeText(reply); status.textContent = '복사되었습니다.'; }
      catch { status.textContent = '복사하지 못했습니다. 문구를 직접 선택해 복사해 주세요.'; }
    });
    document.querySelector('#recalculate').addEventListener('click', () => { document.querySelector('#calculator').scrollIntoView({ behavior: 'smooth' }); document.querySelector('#listingPrice').focus(); });
    setTimeout(() => document.querySelector('#results').scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  }
  function setup() {
    const form = document.querySelector('#negotiation-form');
    if (!form) return;
    form.addEventListener('submit', event => {
      event.preventDefault();
      const input = getInput(form), errors = validate(input), errorBox = document.querySelector('#form-errors');
      if (errors.length) { errorBox.innerHTML = errors.map(x => `<div>${x}</div>`).join(''); errorBox.focus?.(); return; }
      errorBox.textContent = ''; renderResult(input, calculate(input));
    });
    document.querySelector('.menu-toggle')?.addEventListener('click', event => { const nav = document.querySelector('#site-nav'); const open = nav.classList.toggle('open'); event.currentTarget.setAttribute('aria-expanded', String(open)); });
  }
  window.NegotiationHelper = { validate, calculate, flexibility, offerAnalysis, responseText };
  document.addEventListener('DOMContentLoaded', setup);
}());
