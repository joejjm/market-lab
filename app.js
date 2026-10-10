'use strict';

const STRATEGIES = [
  { key: 'value', label: 'Value seekers', short: 'Value', color: '#b7ee76' },
  { key: 'momentum', label: 'Trend riders', short: 'Trend', color: '#83cde0' },
  { key: 'contrarian', label: 'Contrarians', short: 'Contrarian', color: '#d3a3dc' },
  { key: 'noise', label: 'Noise traders', short: 'Noise', color: '#efca7b' }
];
const CONTROLLER_LABELS = { scripted: 'Scripted', llm: 'LLM-style proxy', human: 'Human' };
const INFORMATION_SCHEDULE = [
  { minute: 8, category: 'Earnings', headline: 'Quarterly earnings outlook beats expectations', details: 'An improved earnings outlook raises estimated company value.', impact: 0.035 },
  { minute: 23, category: 'Operations', headline: 'Supplier disruption delays a key product line', details: 'A supply delay lowers estimated company value.', impact: -0.028 },
  { minute: 41, category: 'Guidance', headline: 'Company raises its full-year guidance', details: 'Higher expected revenue raises estimated company value.', impact: 0.042 },
  { minute: 60, category: 'Regulatory', headline: 'New compliance costs weigh on the outlook', details: 'Expected operating costs lower estimated company value.', impact: -0.031 },
  { minute: 84, category: 'Product', headline: 'New product launch draws stronger-than-expected demand', details: 'Improved demand raises estimated company value.', impact: 0.038 }
];
const HISTORY_LIMIT = 180;
const TRACE_LIMIT = 5000;
const ACTION_LIMIT = 240;
const STARTING_CASH = 10000;
const STARTING_SHARES = 35;
const MAX_SHARES = 240;
const MAX_ORDER = 30;

const elements = {
  price: document.querySelector('#price-value'),
  fairValue: document.querySelector('#fair-value'),
  priceChange: document.querySelector('#price-change'),
  sentiment: document.querySelector('#sentiment-value'),
  sentimentFill: document.querySelector('#sentiment-fill'),
  traderCount: document.querySelector('#trader-count'),
  tradeCount: document.querySelector('#trade-count'),
  tick: document.querySelector('#tick-value'),
  sessionStatus: document.querySelector('#session-status'),
  sessionChip: document.querySelector('.session-chip'),
  chartEmpty: document.querySelector('#chart-empty'),
  priceChart: document.querySelector('#price-chart'),
  wealthChart: document.querySelector('#wealth-chart'),
  performance: document.querySelector('#performance-list'),
  journal: document.querySelector('#journal-list'),
  influence: document.querySelector('#influence-list'),
  decisionTimeline: document.querySelector('#decision-timeline'),
  decisionFilter: document.querySelector('#decision-filter'),
  warning: document.querySelector('#population-warning'),
  humanWarning: document.querySelector('#human-warning'),
  nextReleaseTime: document.querySelector('#next-release-time'),
  nextReleaseTitle: document.querySelector('#next-release-title'),
  nextReleaseDescription: document.querySelector('#next-release-description'),
  humanDesk: document.querySelector('#human-desk'),
  humanAgentName: document.querySelector('#human-agent-name'),
  humanInbox: document.querySelector('#human-inbox'),
  humanOrderStatus: document.querySelector('#human-order-status'),
  start: document.querySelector('#start-button'),
  step: document.querySelector('#step-button'),
  reset: document.querySelector('#reset-button')
};

let state;
let timer = null;
let activeConfig = null;

function createRandom(seed) {
  let randomState = seed >>> 0;
  return () => {
    randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
}

function hashSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return (hash >>> 0) || 1;
}

function randomNormal(randomSource = state.random) {
  const first = Math.max(randomSource(), 1e-10);
  const second = randomSource();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function readConfig() {
  const counts = {};
  const controllers = {};
  STRATEGIES.forEach((strategy) => {
    const input = document.querySelector(`#count-${strategy.key}`);
    const count = clamp(Math.round(Number(input.value) || 0), 0, 20);
    input.value = String(count);
    counts[strategy.key] = count;
    controllers[strategy.key] = document.querySelector(`#controller-${strategy.key}`).value;
  });
  const humanCount = STRATEGIES.reduce((total, strategy) => (
    total + (controllers[strategy.key] === 'human' ? counts[strategy.key] : 0)
  ), 0);
  return {
    counts,
    controllers,
    humanCount,
    volatility: Number(document.querySelector('#volatility').value) / 100,
    impact: Number(document.querySelector('#impact').value),
    seed: clamp(Math.round(Number(document.querySelector('#seed').value) || 1), 1, 2147483647)
  };
}

function setPopulationTotal() {
  const config = readConfig();
  const total = Object.values(config.counts).reduce((sum, count) => sum + count, 0);
  document.querySelector('#population-total').textContent = String(total);
  elements.humanWarning.hidden = config.humanCount <= 1;
}

function formatSimTime(minute) {
  return `T+${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function agentName(agent) {
  const strategy = STRATEGIES.find((item) => item.key === agent.strategy);
  return `${strategy.short} ${String(agent.sequence).padStart(2, '0')}`;
}

function createState(config) {
  const agents = [];
  const sequence = Object.fromEntries(STRATEGIES.map((strategy) => [strategy.key, 0]));
  STRATEGIES.forEach((strategy) => {
    for (let index = 0; index < config.counts[strategy.key]; index += 1) {
      const controller = config.controllers[strategy.key];
      sequence[strategy.key] += 1;
      const agentKey = `${config.seed}:${strategy.key}:${sequence[strategy.key]}`;
      const personalityRandom = createRandom(hashSeed(`${agentKey}:personality`));
      const delayRandom = createRandom(hashSeed(`${agentKey}:delays`));
      agents.push({
        id: `${strategy.key}-${sequence[strategy.key]}`,
        sequence: sequence[strategy.key],
        strategy: strategy.key,
        controller,
        cash: STARTING_CASH,
        shares: STARTING_SHARES,
        personality: 0.75 + personalityRandom() * 0.5,
        perceivedFairValue: 100,
        infoDelay: controller === 'llm' ? 2 + Math.floor(delayRandom() * 4) : controller === 'scripted' ? Math.floor(delayRandom() * 2) : 0,
        socialDelay: controller === 'llm' ? 1 + Math.floor(delayRandom() * 2) : Math.floor(delayRandom() * 2),
        decisionRandom: createRandom(hashSeed(`${agentKey}:decisions`)),
        pendingInformation: [],
        knownInformation: [],
        seenActions: new Set(),
        socialMemory: [],
        lastSignal: 0,
        pendingOrder: null
      });
    }
  });
  return {
    tick: 0,
    random: createRandom(hashSeed(`${config.seed}:market`)),
    startPrice: 100,
    price: 100,
    fairValue: 100,
    sentiment: 0,
    previousReturn: 0,
    returns: [],
    totalTrades: 0,
    agents,
    information: INFORMATION_SCHEDULE.map((event, index) => ({ ...event, id: `info-${index + 1}`, published: false })),
    informationSequence: 0,
    actionSequence: 0,
    actions: [],
    trace: [],
    traceSequence: 0,
    decisions: [],
    decisionSequence: 0,
    journal: [],
    history: [{ tick: 0, price: 100, fairValue: 100, wealth: averageWealthByStrategy(agents, 100) }]
  };
}

function averageWealthByStrategy(agents, marketPrice) {
  return Object.fromEntries(STRATEGIES.map((strategy) => {
    const members = agents.filter((agent) => agent.strategy === strategy.key);
    const total = members.reduce((sum, agent) => sum + agent.cash + agent.shares * marketPrice, 0);
    return [strategy.key, members.length ? total / members.length : null];
  }));
}

function appendTrace(type, headline, detail, references = []) {
  state.traceSequence += 1;
  state.trace.unshift({
    id: `trace-${state.traceSequence}`,
    tick: state.tick,
    type,
    headline,
    detail,
    references
  });
  state.trace = state.trace.slice(0, TRACE_LIMIT);
}

function addJournalEntry(type, title, detail, direction = '') {
  state.journal.unshift({ tick: state.tick, type, title, detail, direction });
  state.journal = state.journal.slice(0, 28);
}

function publishScheduledInformation() {
  state.information.forEach((event) => {
    if (event.published || event.minute !== state.tick) return;
    event.published = true;
    state.fairValue = Math.max(1, state.fairValue * Math.exp(event.impact));
    state.sentiment = clamp(state.sentiment + Math.sign(event.impact) * 0.2, -1, 1);
    state.agents.forEach((agent) => {
      if (agent.controller !== 'human') {
        agent.pendingInformation.push({ eventId: event.id, processAt: state.tick + agent.infoDelay });
      }
    });
    addJournalEntry('news', event.headline, `${event.category} information published · ${formatSimTime(state.tick)}`);
    appendTrace('information', `Information released: ${event.headline}`, `${event.details} Underlying fair value changed ${event.impact > 0 ? '+' : ''}${(event.impact * 100).toFixed(1)}%. Agents will process it according to their individual delays.`, [event.id]);
  });
}

function processAgentInputs(agent) {
  const dueInformation = agent.pendingInformation.filter((item) => item.processAt <= state.tick);
  agent.pendingInformation = agent.pendingInformation.filter((item) => item.processAt > state.tick);
  dueInformation.forEach((item) => {
    const event = state.information.find((candidate) => candidate.id === item.eventId);
    if (!event) return;
    agent.perceivedFairValue = Math.max(1, agent.perceivedFairValue * Math.exp(event.impact));
    agent.knownInformation.push({ id: event.id, tick: state.tick, headline: event.headline });
    agent.knownInformation = agent.knownInformation.slice(-6);
    appendTrace(
      'processing',
      `${agentName(agent)} processed ${event.category.toLowerCase()} information`,
      `${CONTROLLER_LABELS[agent.controller]} decision-maker received it ${state.tick - event.minute} simulated minute(s) after release.`,
      [event.id, agent.id]
    );
  });

  const newlyObserved = [];
  state.actions.forEach((action) => {
    if (action.agentId === agent.id || agent.seenActions.has(action.id)) return;
    if (state.tick < action.publishedAt + agent.socialDelay) return;
    agent.seenActions.add(action.id);
    agent.socialMemory.push(action);
    newlyObserved.push(action);
  });
  agent.socialMemory = agent.socialMemory.filter((action) => state.tick - action.tick <= 8).slice(-8);
  return newlyObserved;
}

function strategyDecision(agent) {
  const fairGap = (agent.perceivedFairValue - state.price) / Math.max(state.price, 1);
  const trend = state.returns.slice(-5).reduce((sum, value) => sum + value, 0);
  const observedActions = agent.socialMemory.slice(-4);
  const crowdFlow = observedActions.reduce((sum, action) => (
    sum + Math.sign(action.shares) * Math.min(Math.abs(action.shares), 30) / 120
  ), 0);
  let strategySignalValue;
  let strategyReason;
  switch (agent.strategy) {
    case 'value':
      strategySignalValue = fairGap * 1.6 + state.sentiment * 0.009;
      strategyReason = `Value gap ${signedPercent(fairGap)} × 1.6; sentiment ${state.sentiment.toFixed(2)} × 0.009`;
      break;
    case 'momentum':
      strategySignalValue = trend * 2.1 + state.previousReturn * 0.75 + state.sentiment * 0.035;
      strategyReason = `5-minute trend ${signedPercent(trend)} × 2.1; previous return ${signedPercent(state.previousReturn)} × 0.75; sentiment ${state.sentiment.toFixed(2)} × 0.035`;
      break;
    case 'contrarian':
      strategySignalValue = -trend * 1.8 - state.sentiment * 0.028 + fairGap * 0.2;
      strategyReason = `Contrarian to 5-minute trend ${signedPercent(trend)}; sentiment ${state.sentiment.toFixed(2)}; value gap ${signedPercent(fairGap)}`;
      break;
    default:
      {
        const impulse = randomNormal(agent.decisionRandom) * 0.025;
        strategySignalValue = impulse + state.sentiment * 0.018;
        strategyReason = `Random impulse ${signedPercent(impulse)}; sentiment ${state.sentiment.toFixed(2)} × 0.018`;
      }
  }
  const socialWeight = agent.controller === 'llm' ? 0.34 : 0.16;
  const socialSignal = clamp(crowdFlow * socialWeight, -0.055, 0.055);
  const agentBlend = agent.controller === 'llm'
    ? strategySignalValue * 0.72 + fairGap * 0.3 + socialSignal
    : strategySignalValue + socialSignal;
  const signal = clamp(agentBlend * agent.personality, -0.13, 0.13);
  agent.lastSignal = signal;
  return {
    signal,
    fairGap,
    trend,
    crowdFlow,
    socialSignal,
    strategySignal: strategySignalValue,
    agentBlend,
    blendReason: agent.controller === 'llm'
      ? `LLM-style proxy blend: strategy × 0.72 + value gap × 0.30 + peer signal; personality multiplier ${agent.personality.toFixed(2)}`
      : `Scripted strategy + peer signal; personality multiplier ${agent.personality.toFixed(2)}`,
    strategyReason,
    socialReason: observedActions.length
      ? `${observedActions.length} peer trade(s); net observed flow ${crowdFlow >= 0 ? '+' : ''}${(crowdFlow * 120).toFixed(0)} shares; social signal ${signedPercent(socialSignal)}`
      : 'No peer trades observed in the response window',
    informationReason: agent.knownInformation.filter((event) => state.tick - event.tick <= 8)
      .map((event) => `${event.headline} (${state.tick - event.tick} min ago)`)
  };
}

function signedPercent(value) {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
}

function addDecisionRecord(agent, rationale, targetShares, outcome, shares = 0, evidence = []) {
  state.decisionSequence += 1;
  state.decisions.unshift({
    id: `decision-${state.decisionSequence}`,
    tick: state.tick,
    agentId: agent.id,
    agentName: agentName(agent),
    strategy: agent.strategy,
    controller: agent.controller,
    price: state.price,
    fairValue: agent.perceivedFairValue,
    sentiment: state.sentiment,
    strategyReason: rationale?.strategyReason || agent.pendingOrder?.reason || 'No reason supplied',
    blendReason: rationale?.blendReason || 'Human-selected order; no automated signal blend',
    socialReason: rationale?.socialReason || 'Manually selected by the human participant',
    informationReason: rationale?.informationReason || [],
    signal: rationale?.signal ?? null,
    currentShares: agent.shares - shares,
    targetShares,
    outcome,
    shares,
    evidence
  });
  state.decisions = state.decisions.slice(0, 10000);
}

function executeOrder(agent, requestedShares, price) {
  if (requestedShares > 0) return Math.min(requestedShares, Math.floor(agent.cash / price));
  if (requestedShares < 0) return -Math.min(-requestedShares, agent.shares);
  return 0;
}

function runStep() {
  if (!state || !state.agents.length) return;
  state.tick += 1;
  publishScheduledInformation();
  state.sentiment = clamp(state.sentiment * 0.94 + randomNormal() * 0.025, -1, 1);

  const priceBeforeTrading = state.price;
  const plans = [];
  state.agents.forEach((agent) => {
    processAgentInputs(agent);
    if (agent.controller === 'human') {
      if (agent.pendingOrder) {
        plans.push({
          agent,
          requestedShares: agent.pendingOrder.shares,
          orderKind: 'human',
          targetShares: clamp(agent.shares + agent.pendingOrder.shares, 0, MAX_SHARES),
          rationale: { strategyReason: agent.pendingOrder.reason || 'No reason supplied' },
          evidence: []
        });
      }
      return;
    }
    const rationale = strategyDecision(agent);
    const targetShares = clamp(Math.round(STARTING_SHARES + rationale.signal * 1450), 0, MAX_SHARES);
    const requestedShares = clamp(targetShares - agent.shares, -MAX_ORDER, MAX_ORDER);
    const knownInformation = agent.knownInformation.filter((event) => state.tick - event.tick <= 8);
    const socialEvidence = agent.socialMemory.slice(-2);
    const evidence = [
      ...knownInformation.map((event) => event.id),
      ...socialEvidence.map((action) => action.id)
    ];
    plans.push({ agent, requestedShares, orderKind: 'agent', evidence, rationale, targetShares });
  });

  let netOrderFlow = 0;
  const filledOrders = [];
  plans.forEach((plan) => {
    const shares = executeOrder(plan.agent, plan.requestedShares, priceBeforeTrading);
    if (!shares) {
      if (plan.orderKind === 'human') plan.agent.pendingOrder = null;
      const outcome = plan.orderKind === 'human'
        ? 'Order could not be filled (cash or share limit)'
        : plan.requestedShares === 0 ? 'Held position' : 'Order blocked by cash or share limit';
      addDecisionRecord(plan.agent, plan.rationale, plan.targetShares, outcome, 0, plan.evidence);
      return;
    }
    plan.agent.cash -= shares * priceBeforeTrading;
    plan.agent.shares += shares;
    plan.agent.pendingOrder = null;
    netOrderFlow += shares;
    state.totalTrades += 1;
    state.actionSequence += 1;
    const action = {
      id: `trade-${state.actionSequence}`,
      agentId: plan.agent.id,
      agentName: agentName(plan.agent),
      strategy: plan.agent.strategy,
      controller: plan.agent.controller,
      shares,
      tick: state.tick,
      publishedAt: state.tick + 1,
      price: priceBeforeTrading
    };
    const outcome = plan.orderKind === 'human'
      ? `${shares > 0 ? 'Bought' : 'Sold'} ${Math.abs(shares)} shares`
      : `${shares > 0 ? 'Bought' : 'Sold'} ${Math.abs(shares)} shares`;
    addDecisionRecord(plan.agent, plan.rationale, plan.targetShares, outcome, shares, plan.evidence);
    state.actions.push(action);
    filledOrders.push({ ...plan, action });
    if (plan.orderKind === 'agent') {
      const informationRefs = plan.evidence.filter((id) => id.startsWith('info-'));
      const actionRefs = plan.evidence.filter((id) => id.startsWith('trade-'));
      const sourceNames = actionRefs.map((id) => state.actions.find((item) => item.id === id)?.agentName).filter(Boolean);
      const side = shares > 0 ? 'bought' : 'sold';
      const sourceText = sourceNames.length ? ` after observing ${sourceNames.join(', ')}` : '';
      const infoText = informationRefs.length ? ` after processing ${informationRefs.length} recent information release(s)` : '';
      appendTrace(
        'decision',
        `${agentName(plan.agent)} ${side} ${Math.abs(shares)} shares`,
        `${CONTROLLER_LABELS[plan.agent.controller]} ${STRATEGIES.find((item) => item.key === plan.agent.strategy).label.toLowerCase()} decision${sourceText}${infoText}. Order filled at ${formatMoney(priceBeforeTrading)}.`,
        [plan.agent.id, action.id, ...plan.evidence]
      );
      addJournalEntry('trade', `${agentName(plan.agent)} ${side} ${Math.abs(shares)} shares`, `${CONTROLLER_LABELS[plan.agent.controller]} · filled at ${formatMoney(priceBeforeTrading)}${sourceText ? ` · influenced by ${sourceNames.join(', ')}` : ''}`, shares > 0 ? 'buy' : 'sell');
    } else {
      addJournalEntry('trade', `Human trader ${shares > 0 ? 'bought' : 'sold'} ${Math.abs(shares)} shares`, `Manual order · filled at ${formatMoney(priceBeforeTrading)} · ${formatSimTime(state.tick)}`, shares > 0 ? 'buy' : 'sell');
      appendTrace(
        'decision',
        `Human trader ${shares > 0 ? 'bought' : 'sold'} ${Math.abs(shares)} shares`,
        `Manually submitted order filled at ${formatMoney(priceBeforeTrading)}.`,
        [plan.agent.id, action.id]
      );
    }
  });

  state.actions = state.actions.slice(-ACTION_LIMIT);
  const retainedActionIds = new Set(state.actions.map((action) => action.id));
  state.agents.forEach((agent) => {
    agent.seenActions = new Set([...agent.seenActions].filter((id) => retainedActionIds.has(id)));
  });
  const liquidity = Math.max(state.agents.length * 18, 1);
  const orderImpact = (netOrderFlow / liquidity) * activeConfig.impact * 0.012;
  const marketShock = randomNormal() * activeConfig.volatility;
  const change = clamp(orderImpact + marketShock, -0.08, 0.08);
  state.price = Math.max(1, state.price * Math.exp(change));
  state.previousReturn = change;
  state.returns.push(change);
  if (state.returns.length > 12) state.returns.shift();
  const priceChange = ((state.price - priceBeforeTrading) / priceBeforeTrading) * 100;
  appendTrace(
    'market',
    `Market repriced ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`,
    `Net order flow ${netOrderFlow >= 0 ? '+' : ''}${netOrderFlow} shares; price moved from ${formatMoney(priceBeforeTrading)} to ${formatMoney(state.price)}. New price and public order flow become observable next minute.`,
    filledOrders.slice(0, 8).map((item) => item.action.id)
  );

  const wealth = averageWealthByStrategy(state.agents, state.price);
  state.history.push({ tick: state.tick, price: state.price, fairValue: state.fairValue, wealth });
  if (state.history.length > HISTORY_LIMIT) state.history.shift();
  render();
}

function formatMoney(value) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width: rect.width, height: rect.height };
}

function drawLineChart(canvas, series) {
  const { context: ctx, width, height } = resizeCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  const padding = { left: 48, right: 10, top: 14, bottom: 24 };
  const chartWidth = Math.max(1, width - padding.left - padding.right);
  const chartHeight = Math.max(1, height - padding.top - padding.bottom);
  const values = series.flatMap((item) => item.values.filter(Number.isFinite));
  if (!values.length) return;
  let minimum = Math.min(...values);
  let maximum = Math.max(...values);
  const spread = maximum - minimum || Math.max(Math.abs(maximum) * 0.03, 1);
  minimum -= spread * 0.15;
  maximum += spread * 0.15;
  const yPosition = (value) => padding.top + (maximum - value) / (maximum - minimum) * chartHeight;
  const xPosition = (index, count) => padding.left + (count <= 1 ? chartWidth : index / (count - 1) * chartWidth);
  ctx.font = '10px "DM Mono", Consolas, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let line = 0; line <= 4; line += 1) {
    const y = padding.top + chartHeight * line / 4;
    const value = maximum - (maximum - minimum) * line / 4;
    ctx.strokeStyle = '#29332c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, Math.round(y) + 0.5);
    ctx.lineTo(width - padding.right, Math.round(y) + 0.5);
    ctx.stroke();
    ctx.fillStyle = '#829086';
    ctx.fillText(`$${value.toFixed(2)}`, padding.left - 8, y);
  }
  series.forEach((item) => {
    if (!item.values.length) return;
    ctx.beginPath();
    item.values.forEach((value, index) => {
      const x = xPosition(index, item.values.length);
      const y = yPosition(value);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.width || 2;
    ctx.setLineDash(item.dashed ? [5, 5] : []);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

function renderPerformance() {
  const history = state.history;
  drawLineChart(elements.wealthChart, STRATEGIES.map((strategy) => ({
    color: strategy.color,
    values: history.map((point) => point.wealth[strategy.key]).filter(Number.isFinite)
  })));
  elements.performance.innerHTML = STRATEGIES.map((strategy) => {
    const values = history.map((point) => point.wealth[strategy.key]).filter(Number.isFinite);
    if (!values.length) {
      return `<div class="performance-item"><span class="performance-name"><i class="performance-dot" style="background:${strategy.color}"></i>${strategy.short}</span><span class="performance-value">—</span><span class="performance-change">No agents</span></div>`;
    }
    const latest = values[values.length - 1];
    const initialValue = STARTING_CASH + STARTING_SHARES * state.startPrice;
    const change = ((latest - initialValue) / initialValue) * 100;
    const changeClass = change >= 0 ? 'positive' : 'negative';
    return `<div class="performance-item"><span class="performance-name"><i class="performance-dot" style="background:${strategy.color}"></i>${strategy.short}</span><span class="performance-value">${formatMoney(latest)}</span><span class="performance-change ${changeClass}">${change >= 0 ? '+' : ''}${change.toFixed(1)}% portfolio</span></div>`;
  }).join('');
}

function renderJournal() {
  if (!state.journal.length) {
    elements.journal.innerHTML = '<div class="journal-empty"><span class="empty-icon">↗</span><strong>Quiet for now.</strong><span>Start the simulation to see trades and market events.</span></div>';
    return;
  }
  elements.journal.innerHTML = state.journal.map((entry) => {
    const directionClass = entry.direction ? ` ${entry.direction}-text` : '';
    return `<div class="journal-entry"><span class="journal-tick">${formatSimTime(entry.tick)}</span><span class="journal-body"><strong class="${directionClass.trim()}">${entry.title}</strong><small>${entry.detail}</small></span></div>`;
  }).join('');
}

function renderInformationPreview() {
  const upcoming = state.information.find((event) => !event.published);
  if (!upcoming) {
    elements.nextReleaseTime.textContent = 'NO MORE EVENTS';
    elements.nextReleaseTitle.textContent = 'Scheduled information exhausted';
    elements.nextReleaseDescription.textContent = 'Reset to run the release schedule again.';
    return;
  }
  elements.nextReleaseTime.textContent = formatSimTime(upcoming.minute);
  elements.nextReleaseTitle.textContent = `Scheduled ${upcoming.category.toLowerCase()} update`;
  elements.nextReleaseDescription.textContent = `Headline and valuation impact hidden until release · ${upcoming.minute - state.tick} simulated minute(s) away.`;
}

function renderInfluenceTrace() {
  if (!state.trace.length) {
    elements.influence.innerHTML = '<div class="influence-empty">Start or step the market to record information releases and agent-to-agent influence.</div>';
    return;
  }
  elements.influence.innerHTML = state.trace.slice(0, 200).map((event) => (
    `<article class="trace-event trace-${event.type}"><span class="trace-time">${formatSimTime(event.tick)}</span><div><strong>${event.headline}</strong><p>${event.detail}</p>${event.references.length ? `<small>Linked evidence: ${event.references.join(' · ')}</small>` : ''}</div></article>`
  )).join('');
}

function renderDecisionTimeline() {
  if (!state.decisions.length) {
    elements.decisionTimeline.innerHTML = '<div class="influence-empty">Decision records appear here as the simulation advances.</div>';
    return;
  }
  const filter = elements.decisionFilter.value;
  const visible = state.decisions.filter((decision) => filter === 'all' || decision.agentId === filter).slice(0, 120);
  if (!visible.length) {
    elements.decisionTimeline.innerHTML = '<div class="influence-empty">No decisions recorded for this entity yet.</div>';
    return;
  }
  elements.decisionTimeline.innerHTML = visible.map((decision) => {
    const information = decision.informationReason.length
      ? `<li><strong>Information known:</strong> ${decision.informationReason.map(escapeHtml).join('; ')}</li>`
      : '<li><strong>Information known:</strong> No recent release processed</li>';
    const signal = decision.signal === null ? 'Manual human order' : `${signedPercent(decision.signal)} signal`;
    const position = decision.shares
      ? `${decision.currentShares} → ${decision.currentShares + decision.shares} shares`
      : `${decision.currentShares} shares held; target ${decision.targetShares}`;
    const linkedEvidence = decision.evidence.length
      ? `<small>Evidence IDs: ${decision.evidence.join(' · ')}</small>`
      : '';
    return `<article class="decision-entry"><div class="decision-entry-top"><time>${formatSimTime(decision.tick)}</time><strong>${escapeHtml(decision.agentName)}</strong><span class="decision-controller">${CONTROLLER_LABELS[decision.controller]} · ${STRATEGIES.find((item) => item.key === decision.strategy).label}</span><b class="${decision.shares > 0 ? 'buy-text' : decision.shares < 0 ? 'sell-text' : ''}">${escapeHtml(decision.outcome)}</b></div><div class="decision-snapshot">Price ${formatMoney(decision.price)} · perceived fair value ${formatMoney(decision.fairValue)} · sentiment ${decision.sentiment.toFixed(2)} · ${signal} · ${position}</div><ul><li><strong>Strategy:</strong> ${escapeHtml(decision.strategyReason)}</li><li><strong>Decision rule:</strong> ${escapeHtml(decision.blendReason)}</li><li><strong>Peer activity:</strong> ${escapeHtml(decision.socialReason)}</li>${information}</ul>${linkedEvidence}</article>`;
  }).join('');
}

function renderDecisionFilter() {
  const selected = elements.decisionFilter.value;
  const options = ['<option value="all">All entities</option>'];
  state.agents.forEach((agent) => {
    options.push(`<option value="${agent.id}">${agentName(agent)} · ${CONTROLLER_LABELS[agent.controller]}</option>`);
  });
  elements.decisionFilter.innerHTML = options.join('');
  if (state.agents.some((agent) => agent.id === selected)) elements.decisionFilter.value = selected;
}

function exportTrace() {
  const header = ['simulated_time', 'tick', 'event_type', 'event', 'details', 'evidence_ids', 'agent_id', 'controller', 'strategy', 'seed', 'volatility', 'price_impact', 'agent_mix'];
  const agentMix = STRATEGIES.map((strategy) => (
    `${strategy.key}:${state.agents.filter((agent) => agent.strategy === strategy.key).length}:${activeConfig.controllers[strategy.key]}`
  )).join('|');
  const rows = [[formatSimTime(0), 0, 'run_settings', 'Simulation configuration', `Volatility ${(activeConfig.volatility * 100).toFixed(1)}%; price impact ${activeConfig.impact.toFixed(2)}×`, '', '', '', '', activeConfig.seed, activeConfig.volatility, activeConfig.impact, agentMix]];
  rows.push(...state.trace.slice().reverse().map((event) => [
    formatSimTime(event.tick),
    event.tick,
    event.type,
    event.headline,
    event.detail,
    event.references.join('|'),
    '',
    '',
    '',
    activeConfig.seed,
    activeConfig.volatility,
    activeConfig.impact,
    agentMix
  ]));
  rows.push(...state.decisions.slice().reverse().map((decision) => [
    formatSimTime(decision.tick),
    decision.tick,
    'agent_decision',
    `${decision.agentName}: ${decision.outcome}`,
    [
      decision.strategyReason,
      decision.blendReason,
      decision.socialReason,
      ...decision.informationReason,
      `Price ${formatMoney(decision.price)}; fair value ${formatMoney(decision.fairValue)}; signal ${decision.signal === null ? 'manual' : signedPercent(decision.signal)}; target ${decision.targetShares}; position ${decision.currentShares} -> ${decision.currentShares + decision.shares}`
    ].join('; '),
    decision.evidence.join('|'),
    decision.agentId,
    decision.controller,
    decision.strategy,
    activeConfig.seed,
    activeConfig.volatility,
    activeConfig.impact,
    agentMix
  ]));
  const escapeCsv = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `market-lab-trace-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function renderHumanDesk() {
  const human = state.agents.find((agent) => agent.controller === 'human');
  elements.humanDesk.hidden = !human;
  if (!human) return;
  elements.humanAgentName.textContent = `${agentName(human)} · ${human.shares} shares · ${formatMoney(human.cash)} cash`;
  const recentInformation = state.information.filter((event) => event.published).slice(-2).map((event) => event.headline);
  const recentActions = state.actions.filter((action) => action.agentId !== human.id).slice(-3).map((action) => `${action.agentName} ${action.shares > 0 ? 'bought' : 'sold'} ${Math.abs(action.shares)}`);
  const inboxItems = [...recentInformation, ...recentActions];
  elements.humanInbox.textContent = inboxItems.length ? inboxItems.join(' · ') : 'No information releases or public agent orders yet.';
  elements.humanOrderStatus.textContent = human.pendingOrder
    ? `${human.pendingOrder.side.toUpperCase()} ${Math.abs(human.pendingOrder.shares)} queued for ${formatSimTime(state.tick + 1)}.`
    : '';
}

function render() {
  if (!state) return;
  const changePercent = ((state.price - state.startPrice) / state.startPrice) * 100;
  elements.price.textContent = formatMoney(state.price);
  elements.fairValue.textContent = formatMoney(state.fairValue);
  elements.priceChange.textContent = `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`;
  elements.priceChange.className = `change ${changePercent > 0.005 ? 'positive' : changePercent < -0.005 ? 'negative' : 'neutral'}`;
  elements.sentiment.textContent = state.sentiment > 0.2 ? 'BULLISH' : state.sentiment < -0.2 ? 'BEARISH' : 'NEUTRAL';
  elements.sentimentFill.style.left = `calc(${((state.sentiment + 1) / 2) * 100}% - 5px)`;
  elements.traderCount.textContent = String(state.agents.length);
  elements.tradeCount.textContent = state.totalTrades.toLocaleString('en-US');
  elements.tick.textContent = formatSimTime(state.tick);
  elements.chartEmpty.hidden = state.tick > 0;
  drawLineChart(elements.priceChart, [
    { color: '#8794b4', values: state.history.map((point) => point.fairValue), width: 1.5, dashed: true },
    { color: '#b7ee76', values: state.history.map((point) => point.price), width: 2 }
  ]);
  renderPerformance();
  renderJournal();
  renderInformationPreview();
  renderInfluenceTrace();
  renderDecisionTimeline();
  renderHumanDesk();
}

function setRunning(running) {
  if (timer) {
    window.clearInterval(timer);
    timer = null;
  }
  elements.sessionStatus.textContent = running ? 'SIMULATION RUNNING' : 'SIMULATION PAUSED';
  elements.sessionChip.classList.toggle('running', running);
  elements.start.innerHTML = running ? '<span aria-hidden="true">Ⅱ</span> Pause simulation' : '<span aria-hidden="true">▶</span> Start simulation';
  if (running) {
    const speed = Number(document.querySelector('#speed').value);
    timer = window.setInterval(runStep, 1000 / speed);
  }
}

function resetSimulation() {
  setRunning(false);
  activeConfig = readConfig();
  document.querySelector('#seed').value = String(activeConfig.seed);
  state = createState(activeConfig);
  renderDecisionFilter();
  elements.warning.hidden = true;
  elements.humanWarning.hidden = activeConfig.humanCount <= 1;
  render();
}

function applyChangedSettings() {
  const nextConfig = readConfig();
  if (JSON.stringify(nextConfig) !== JSON.stringify(activeConfig)) resetSimulation();
}

function validateRun() {
  const config = readConfig();
  setPopulationTotal();
  if (config.humanCount > 1) {
    elements.humanWarning.hidden = false;
    return false;
  }
  if (!state.agents.length) {
    elements.warning.hidden = false;
    return false;
  }
  elements.warning.hidden = true;
  elements.humanWarning.hidden = true;
  return true;
}

elements.start.addEventListener('click', () => {
  if (timer) {
    setRunning(false);
    return;
  }
  applyChangedSettings();
  if (validateRun()) setRunning(true);
});

elements.step.addEventListener('click', () => {
  if (timer) setRunning(false);
  applyChangedSettings();
  if (validateRun()) runStep();
});

elements.reset.addEventListener('click', resetSimulation);
document.querySelectorAll('.agent-count, .controller-select').forEach((input) => {
  input.addEventListener('input', setPopulationTotal);
  input.addEventListener('change', setPopulationTotal);
});

document.querySelector('#volatility').addEventListener('input', (event) => {
  document.querySelector('#volatility-output').textContent = `${Number(event.target.value).toFixed(1)}%`;
});
document.querySelector('#impact').addEventListener('input', (event) => {
  document.querySelector('#impact-output').textContent = `${Number(event.target.value).toFixed(2)}×`;
});
document.querySelector('#speed').addEventListener('input', (event) => {
  document.querySelector('#speed-output').textContent = `${event.target.value} min/s`;
  if (timer) setRunning(true);
});
document.querySelector('#seed').addEventListener('change', () => {
  const seed = clamp(Math.round(Number(document.querySelector('#seed').value) || 1), 1, 2147483647);
  document.querySelector('#seed').value = String(seed);
});
document.querySelector('#new-seed').addEventListener('click', () => {
  document.querySelector('#seed').value = String(Math.floor(Date.now() % 2147483646) + 1);
});
elements.decisionFilter.addEventListener('change', renderDecisionTimeline);

document.querySelector('#human-order-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const human = state.agents.find((agent) => agent.controller === 'human');
  if (!human) return;
  const side = document.querySelector('#human-order-side').value;
  const shares = clamp(Math.round(Number(document.querySelector('#human-order-shares').value) || 1), 1, MAX_ORDER) * (side === 'buy' ? 1 : -1);
  human.pendingOrder = {
    side,
    shares,
    reason: document.querySelector('#human-order-reason').value.trim()
  };
  renderHumanDesk();
});
document.querySelector('#export-trace').addEventListener('click', exportTrace);

const helpDialog = document.querySelector('#help-dialog');
document.querySelector('#help-button').addEventListener('click', () => helpDialog.showModal());
document.querySelector('#close-help').addEventListener('click', () => helpDialog.close());
document.querySelector('#done-help').addEventListener('click', () => helpDialog.close());
helpDialog.addEventListener('click', (event) => {
  if (event.target === helpDialog) helpDialog.close();
});

let resizeFrame = null;
window.addEventListener('resize', () => {
  if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
  resizeFrame = window.requestAnimationFrame(() => {
    if (state) render();
  });
});

resetSimulation();
