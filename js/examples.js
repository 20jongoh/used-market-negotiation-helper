(function () {
  'use strict';
  const base = { itemName: '무선 헤드폰', listingPrice: 500000, buyerOffer: 400000, minimumPrice: 450000, condition: 'normalUse', listingPeriod: 'fourSevenDays', urgency: 'slightlyUrgent', inquiries: 'occasional', tradeMethod: 'either', quickTrade: false };
  window.NegotiationExamples = {
    'case-1': { ...base },
    'case-2': { ...base, itemName: '게임기', listingPrice: 300000, buyerOffer: 210000, minimumPrice: 240000, listingPeriod: 'today', urgency: 'notUrgent', inquiries: 'several' },
    'case-3': { ...base, itemName: '책상', minimumPrice: 420000, listingPeriod: 'overTwoWeeks', urgency: 'veryUrgent', inquiries: 'none', tradeMethod: 'direct' },
    'case-4': { ...base, itemName: '카메라 렌즈' },
    'case-5': { ...base, itemName: '태블릿', buyerOffer: 450000, minimumPrice: 430000, tradeMethod: 'direct', quickTrade: true },
    'case-6': { ...base, itemName: '휴대용 게임 기기', listingPrice: 800000, buyerOffer: 600000, minimumPrice: 700000, condition: 'likeNew', listingPeriod: 'today', urgency: 'notUrgent' }
  };
}());
