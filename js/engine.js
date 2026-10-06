(function (root) {
  'use strict';
  // Editorial negotiation rules, not market data or a probability model.
  const MAX_PRICE = 1000000000;
  const rules = {
    condition: {
      unopened: [0.10, '미개봉', '미개봉 상태를 사진과 구성품으로 확인할 수 있다면 가격을 유지할 근거가 됩니다.'],
      likeNew: [0.06, '새상품에 가까움', '좋은 상태를 확인할 사진을 제시하며 조정 폭을 작게 시작합니다.'],
      lightUse: [0.02, '사용감 적음', '사용감이 적다는 설명은 소폭의 가격 방어 요소로 반영합니다.'],
      normalUse: [0, '일반적인 사용감', '일반적인 사용감은 가격 유지나 인하 어느 쪽에도 추가 가중하지 않습니다.'],
      heavyUse: [-0.08, '사용감 많음', '흔적과 결함을 먼저 알리고, 구매자가 부담할 상태 차이를 조정에 반영합니다.']
    },
    listingPeriod: {
      today: [0.08, '오늘 등록', '등록 당일에는 반응을 관찰할 시간이 남아 있어 첫 인하 폭을 줄입니다.'],
      twoThreeDays: [0.04, '2~3일', '등록 초기라 추가 문의를 기다릴 여지를 조금 남깁니다.'],
      fourSevenDays: [0, '4~7일', '등록 기간만으로 방향을 정하지 않고 문의량과 판매 일정을 함께 봅니다.'],
      oneTwoWeeks: [-0.05, '1~2주', '판매 기간이 길어져 첫 가격에서 조금 더 조정하는 쪽으로 반영합니다.'],
      overTwoWeeks: [-0.10, '2주 이상', '오랜 대기 시간을 반영해 조정 폭을 넓힙니다. 기간만으로 비싼 매물이라고 단정할 수는 없습니다.']
    },
    urgency: {
      notUrgent: [0.08, '급하지 않음', '기다릴 수 있는 상황이므로 가격을 지키고 다음 대화를 볼 여지를 남깁니다.'],
      slightlyUrgent: [0, '조금 빨리', '가격과 일정을 함께 비교하는 중간 기준을 사용합니다.'],
      moderatelyUrgent: [-0.10, '일주일 안에', '판매 일정이 있어 조정 폭을 조금 넓힙니다. 거래 날짜 확인이 함께 필요합니다.'],
      veryUrgent: [-0.18, '최대한 빨리', '빠른 정리를 우선하므로 조정 폭을 넓히되 내부 협상 범위를 넘기지 않습니다.']
    },
    inquiries: {
      none: [-0.06, '거의 없음', '문의가 적어 조정 폭을 조금 넓힙니다. 사진·설명·거래 장소도 먼저 점검하세요.'],
      occasional: [0, '가끔 있음', '간헐적인 문의만으로 수요를 단정하지 않고 중간 기준을 사용합니다.'],
      several: [0.08, '여러 명 문의', '비교할 문의가 있어 첫 제안에 크게 양보하지 않는 쪽으로 반영합니다.'],
      imminent: [0.12, '거래 직전 문의 있음', '구체적인 거래 문의가 있어 가격 방어 여지를 더 둡니다. 문의는 확정 거래와 다릅니다.']
    }
  };
  const methods = { direct: '직거래', parcel: '택배', either: '방식 협의' };
  const money = value => `${value.toLocaleString('ko-KR')}원`;
  const percent = value => `${Number(value.toFixed(1))}%`;
  function parseAmount(value) {
    const raw = String(value ?? '').trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw)) return NaN;
    const number = Number(raw.replace(/,/g, ''));
    return Number.isSafeInteger(number) ? number : NaN;
  }
  const validAmount = (value, allowZero = false) => Number.isSafeInteger(value) && value >= (allowZero ? 0 : 1) && value <= MAX_PRICE;
  function validate(input) {
    const errors = [];
    const names = { listingPrice: '현재 판매 가격', buyerOffer: '구매자 제안 가격', minimumPrice: '최저 희망 가격' };
    Object.entries(names).forEach(([key, label]) => {
      if (!validAmount(input[key])) errors.push({ field: key, text: `${label}: 1원부터 10억 원까지의 정수를 입력해 주세요. 쉼표는 3자리 구분에만 사용할 수 있습니다.` });
    });
    if (validAmount(input.minimumPrice) && validAmount(input.listingPrice) && input.minimumPrice > input.listingPrice) errors.push({ field: 'minimumPrice', text: '최저 희망 가격은 현재 판매 가격보다 클 수 없습니다.' });
    if (validAmount(input.buyerOffer) && validAmount(input.listingPrice) && input.buyerOffer > input.listingPrice) errors.push({ field: 'buyerOffer', text: '구매자 제안이 판매 가격보다 높습니다. 입력 실수인지 확인하고 판매 가격 이하로 입력해 주세요.' });
    Object.keys(rules).forEach(key => { if (!Object.hasOwn(rules[key], input[key])) errors.push({ field: key, text: '판매 상황을 선택해 주세요.' }); });
    if (!Object.hasOwn(methods, input.tradeMethod)) errors.push({ field: 'tradeMethod', text: '거래 방식을 선택해 주세요.' });
    if (typeof input.itemName !== 'string' || input.itemName.length > 60) errors.push({ field: 'itemName', text: '상품명은 60자 이내로 입력해 주세요.' });
    return errors;
  }
  const clamp = (number, min, max) => Math.min(max, Math.max(min, number));
  const priceUnit = price => price >= 100000 ? 1000 : price >= 10000 ? 100 : price >= 1000 ? 10 : 1;
  const ceilPrice = (price, unit) => Math.ceil((price - 1e-8) / unit) * unit;
  function discountLabel(rate) {
    if (rate === 0) return '할인 요청이 없는 제안';
    if (rate < 5) return '작은 폭의 가격 조정 요청';
    if (rate < 10) return '소폭의 가격 조정 요청';
    if (rate < 20) return '차이를 살펴볼 가격 조정 요청';
    return '상당히 큰 가격 조정 요청';
  }
  function analyze(input) {
    if (validate(input).length) throw new Error('먼저 입력값을 확인해 주세요.');
    const discount = input.listingPrice - input.buyerOffer;
    const discountRate = discount / input.listingPrice * 100;
    const room = input.listingPrice - input.minimumPrice;
    const unit = priceUnit(input.listingPrice);
    const demandAdjustment = discountRate >= 20 ? 0.06 : discountRate >= 10 ? 0.02 : discountRate < 5 ? -0.03 : 0;
    const retention = clamp(0.60 + Object.keys(rules).reduce((sum, key) => sum + rules[key][input[key]][0], 0) + demandAdjustment - (input.quickTrade ? 0.04 : 0), 0.18, 0.90);
    // Keep a buffer above the private floor where any room exists; never quote below an existing offer.
    const guardedFloor = Math.min(input.listingPrice, input.minimumPrice + unit);
    const quote = rate => clamp(ceilPrice(input.minimumPrice + room * rate, unit), Math.max(guardedFloor, input.buyerOffer), input.listingPrice);
    const counter = quote(retention), defense = quote(Math.min(0.98, retention + 0.16)), fast = quote(Math.max(0.08, retention - 0.22));
    const withinRange = input.buyerOffer >= input.minimumPrice;
    let situation;
    if (input.buyerOffer === input.listingPrice) situation = '구매자가 판매 가격을 그대로 제안했습니다. 추가 역제안보다 상품 상태와 거래 일정·비용을 확인하고 수락을 검토할 단계입니다.';
    else if (room === 0) situation = '현재 설정에서는 가격을 낮출 여지가 없습니다. 가격 유지가 가능한지 먼저 확인하고 시간·장소·배송 조건으로 접점을 찾아보세요.';
    else if (input.listingPeriod === 'overTwoWeeks' && input.inquiries === 'none' && input.urgency === 'veryUrgent') situation = '등록한 지 2주 이상 지났고 문의가 거의 없으며 빠른 판매를 원합니다. 가격 조정을 적극적으로 검토할 이유가 겹칩니다. 다만 사진·설명과 거래 가능한 시간도 함께 보완해야 합니다.';
    else if (input.listingPeriod === 'today' && input.urgency === 'notUrgent') situation = '등록 당일이고 판매를 서두르지 않아 첫 제안에서 크게 낮출 필요는 크지 않습니다. 문의 반응을 더 보며 첫 역제안으로 상대의 의사를 확인할 수 있습니다.';
    else if (['several', 'imminent'].includes(input.inquiries) && input.urgency === 'veryUrgent') situation = '빠른 판매가 중요하지만 다른 문의도 있는 상황입니다. 가격을 급히 낮추기 전에 실제로 일정이 확정되는 구매자인지 비교하세요.';
    else if (input.listingPeriod === 'overTwoWeeks' && ['several', 'imminent'].includes(input.inquiries)) situation = '등록 기간은 길지만 문의는 있습니다. 가격 외에 장소·시간·상태 설명에서 거래가 멈추는지 확인한 뒤 조정 폭을 정하세요.';
    else situation = `${rules.condition[input.condition][1]} 상태, ${rules.listingPeriod[input.listingPeriod][1]} 등록 기간, ${rules.urgency[input.urgency][1]} 판매 일정, ${rules.inquiries[input.inquiries][1]} 상황을 함께 반영했습니다. ${retention >= 0.7 ? '첫 인하 폭을 줄이고 다음 제안을 기다릴 여지를 남깁니다.' : retention <= 0.4 ? '거래 일정 확인을 전제로 가격 접점을 조금 더 적극적으로 찾는 방향입니다.' : '소폭 조정으로 대화를 이어가면서 가격과 판매 일정을 함께 비교하는 방향입니다.'}`;
    const reasons = Object.keys(rules).map(key => ({ label: rules[key][input[key]][1], text: rules[key][input[key]][2] }));
    reasons.unshift({ label: `할인 요구 ${percent(discountRate)}`, text: discountRate >= 20 ? '요구 폭이 커 첫 제안에 바로 맞추지 않도록 가격 방어 여지를 더 남겼습니다.' : discountRate < 5 ? '가격 차이가 작아 추가 흥정을 길게 하기보다 접점을 찾는 쪽으로 반영했습니다.' : '판매가와의 차이를 반영하되 할인율만으로 수락 여부를 정하지 않았습니다.' });
    reasons.push({ label: input.quickTrade ? '빠른 거래 제안 있음' : '빠른 거래 제안 없음', text: input.quickTrade ? '실제로 일정을 맞출 수 있다는 전제에서 소폭 조정 여지를 더했습니다. 약속이 확정됐다는 뜻은 아닙니다.' : '빠른 거래에 따른 별도 할인은 반영하지 않았습니다.' });
    const rangeText = withinRange ? '현재 제안은 설정한 내부 협상 범위 안입니다. 범위 안이라는 이유만으로 수락할 필요는 없고, 일정과 비용을 확인해 결정하세요.' : '현재 제안은 설정한 내부 협상 범위 밖입니다. 그대로 수락하기보다 역제안하거나 이번 제안을 거절할 수 있습니다.';
    const counterReason = counter === input.buyerOffer ? '구매자 제안이 계산된 첫 역제안 이상입니다. 구매자가 이미 제시한 금액을 깎지 않고 그 가격에서 거래 조건 확인을 우선합니다.' : counter === input.listingPrice ? '가격을 지킬 조건과 금액 단위 보정을 반영하니 판매 가격 유지가 첫 후보가 되었습니다.' : `내부 협상 범위를 한 번에 쓰지 않고 다음 대화 여지를 남긴 가격입니다. ${money(unit)} 단위로 올림했으며, 구매자 제안보다 낮아지거나 판매 가격을 넘지 않게 보정했습니다.`;
    return { offerRatio: input.buyerOffer / input.listingPrice * 100, discount, discountRate, room, withinRange, unit, retention, counter, defense, fast, label: discountLabel(discountRate), situation, reasons, rangeText, counterReason };
  }
  function reply(input, price, style, offer = input.buyerOffer) {
    const item = input.itemName ? `문의하신 ${input.itemName}, ` : '문의하신 상품, ';
    const acceptance = price <= offer;
    const priceText = acceptance ? `제안해 주신 ${money(price)}에 거래 가능합니다.` : price === input.listingPrice ? `${money(price)}으로 가격을 유지하고 있습니다.` : `${money(price)}에 제안드립니다.`;
    const condition = input.tradeMethod === 'parcel' ? '배송비 부담과 발송일을 먼저 확인해 주세요.' : input.tradeMethod === 'direct' ? '직거래 가능한 시간과 장소를 함께 정하면 좋겠습니다.' : '거래 방식과 가능한 일정을 알려주세요.';
    if (style === 'firm') return `${item}${priceText}\n${acceptance ? '상품 상태와 거래 조건을 확인한 뒤 진행하겠습니다.' : '이번에는 안내드린 가격으로 거래하고 싶습니다.'} ${condition}`;
    if (style === 'fast') return `문의 감사합니다. ${item}${priceText}\n${input.quickTrade ? '말씀하신 빠른 거래 일정이 맞는지 확인하고 싶습니다.' : '일정이 맞으면 빠르게 거래를 진행하고 싶습니다.'} ${condition}`;
    if (style === 'defense') return `문의 감사합니다. ${item}${priceText}\n${acceptance ? '가격이 맞으니 상품 상태와 구성품을 확인해 주세요.' : ['unopened', 'likeNew'].includes(input.condition) ? '설명드린 상품 상태를 확인하실 수 있도록 사진과 구성품을 안내드리겠습니다.' : '안내드린 상태와 구성품을 기준으로 정한 제안입니다.'} ${condition}`;
    return `문의 감사합니다. ${item}${priceText}\n${acceptance ? '괜찮으시면 거래 조건을 함께 확인할까요?' : '이 가격에 거래 가능하시면 말씀해 주세요.'} ${condition}`;
  }
  function simulate(input, previousBuyer, seller, nextBuyer, strategy = 'balanced') {
    const errors = [];
    if (!validAmount(seller) || seller > input.listingPrice) errors.push({ field: 'sellerCounter', text: '내가 제안한 가격은 1원 이상, 현재 판매 가격 이하로 입력해 주세요.' });
    else if (seller < input.minimumPrice || seller < previousBuyer) errors.push({ field: 'sellerCounter', text: '내가 제안한 가격은 내부 협상 범위 안이며 직전 구매자 제안 이상이어야 합니다. 이미 다른 조건에 합의했다면 판매 조건부터 다시 분석해 주세요.' });
    if (!validAmount(nextBuyer) || nextBuyer > input.listingPrice) errors.push({ field: 'nextBuyerOffer', text: '구매자 재제안은 1원 이상, 현재 판매 가격 이하의 정수로 입력해 주세요.' });
    if (errors.length) return { errors };
    const movement = nextBuyer - previousBuyer;
    const beforeGap = Math.max(0, seller - previousBuyer), afterGap = Math.max(0, seller - nextBuyer);
    const withinRange = nextBuyer >= input.minimumPrice;
    const matched = nextBuyer >= seller;
    const close = withinRange && afterGap / input.listingPrice <= 0.02;
    let direction, detail, next;
    if (matched) {
      direction = '수락 검토'; next = seller;
      detail = '구매자 재제안이 내가 제시한 가격에 도달했습니다. 이미 제시한 가격으로 일정·상태·비용을 확인한 뒤 거래를 정할 수 있습니다.';
    } else if (movement <= 0) {
      direction = withinRange ? '기존 역제안 유지 또는 수락 검토' : '가격 유지 또는 거절 검토'; next = seller;
      detail = movement < 0 ? '구매자 제안이 오히려 낮아져 가격 접점에서 멀어졌습니다. 새 조건이 생긴 것인지 확인하고 자동으로 더 양보하지 마세요.' : '가격 변화가 없어 협상이 숫자상 진전되지는 않았습니다. 같은 가격 흥정보다 거래 조건을 확인하거나 대화를 마무리할 수 있습니다.';
    } else if (close || (withinRange && strategy === 'fast')) {
      direction = '수락 또는 소폭 추가 역제안 검토'; next = nextBuyer;
      detail = close ? '내 제안과의 차이가 판매가의 2% 이내이고 내부 범위 안입니다. 이는 서비스의 작은 차이 기준일 뿐, 반드시 수락해야 한다는 뜻은 아닙니다.' : '빠른 판매 전략을 선택했고 구매자가 내부 협상 범위까지 올렸습니다. 일정이 확실하다면 현재 제안 수락을 검토할 수 있습니다.';
    } else {
      direction = withinRange ? '추가 역제안 검토' : '추가 역제안 또는 거절 검토';
      const lower = Math.max(nextBuyer, Math.min(input.listingPrice, input.minimumPrice + priceUnit(input.listingPrice)));
      const rate = strategy === 'fast' ? 0.6 : strategy === 'defense' ? 0.2 : 0.35;
      next = Math.min(seller, Math.max(lower, ceilPrice(seller - (seller - lower) * rate, priceUnit(input.listingPrice))));
      detail = withinRange ? '구매자가 가격을 올려 내부 협상 범위에 들어왔지만 아직 가격 차이가 남아 있습니다. 나도 일부 조정하되 한 번에 전부 양보하지 않는 후보입니다.' : '가격은 올라왔지만 아직 내부 협상 범위 밖입니다. 진전 자체는 인정하되 지금 제안을 그대로 수락하지 않는 방향을 검토하세요.';
    }
    return { errors: [], movement, beforeGap, afterGap, gapReduction: beforeGap - afterGap, withinRange, direction, detail, next, matched };
  }
  function compare(input, a, b) {
    const errors = [];
    [a, b].forEach((option, i) => {
      const key = i === 0 ? 'a' : 'b', name = key.toUpperCase();
      if (!validAmount(option.price)) errors.push({ field: `${key}Price`, text: `${name} 가격은 1원부터 10억 원까지 입력해 주세요.` });
      if (!Number.isInteger(option.days) || option.days < 0 || option.days > 365) errors.push({ field: `${key}Days`, text: `${name} 거래 시점은 오늘 0일부터 365일 사이 정수로 입력해 주세요.` });
      if (!validAmount(option.cost, true) || option.cost > option.price) errors.push({ field: `${key}Cost`, text: `${name} 판매자 부담 비용은 0원부터 해당 거래 가격까지 입력해 주세요.` });
      if (!Object.hasOwn(methods, option.method)) errors.push({ field: `${key}Method`, text: `${name} 거래 방식을 선택해 주세요.` });
    });
    if (errors.length) return { errors };
    const netA = a.price - a.cost, netB = b.price - b.cost;
    return { errors: [], priceDifference: b.price - a.price, netDifference: netB - netA, daysDifference: b.days - a.days, netA, netB, aWithin: netA >= input.minimumPrice, bWithin: netB >= input.minimumPrice };
  }
  root.NegotiationEngine = { MAX_PRICE, rules, methods, money, percent, parseAmount, validAmount, validate, analyze, reply, simulate, compare };
}(typeof window === 'undefined' ? globalThis : window));
