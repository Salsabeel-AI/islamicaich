// Client presentation compatibility only. These are authored card signatures,
// not question/routing patterns. Shared Fata-only projection removes switchSpec.
const targets = new Set(['linah', 'qabas']);
export const HANDOFF_PREFIX = '__COUNCIL_HANDOFF__:';
const signature = text => String(text || '').normalize('NFC').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/\s+/g, ' ').trim();
const legacyDeclines = new Map([
  ['لا، ابقَ مع برق', 'linah'],
  ['لا، ابقَ في المؤصَّل', 'qabas'],
  ['لا، يكفيني تأصيلُ «برق»', 'qabas'],
  ['لا، يكفي المؤصَّل', 'qabas'],
].map(([label, module]) => [signature(label), module]));
const validQuestion = text => typeof text === 'string' && !!text.trim() && text.length <= 6000;
const validButton = button => button && typeof button === 'object' && typeof button.label === 'string' && button.label.length <= 300 && typeof button.value === 'string' && button.value.length <= 6000;
const handoffLabel = module => module === 'linah' ? '⚖️ انتقل إلى لينة وأرسل السؤال' : '🔎 انتقل إلى قبس وأرسل السؤال';

export function createHandoffRegistry(makeId) {
  const actions = new Map();
  return {
    register(module, question) {
      if (!targets.has(module) || (question !== '' && !validQuestion(question))) return null;
      const value = HANDOFF_PREFIX + makeId();
      actions.set(value, Object.freeze({module, question: question.trim()}));
      return value;
    },
    resolve(value) { return typeof value === 'string' ? actions.get(value) : undefined; },
  };
}

export function prepareFataHandoffs(content, originalQuestion, register) {
  if (typeof content !== 'string' || !validQuestion(originalQuestion)) return content;
  return content.replace(/```barq-card[^\n]*\n([\s\S]*?)```/g, (fence, body) => {
    let card; try { card = JSON.parse(body); } catch { return fence; }
    if (!card || !Array.isArray(card.buttons) || card.buttons.length > 100 || !card.buttons.every(validButton)) return fence;
    // Reserved local tokens arriving from upstream are never trusted as actions.
    if (card.buttons.some(b => b.value.startsWith(HANDOFF_PREFIX))) return '';
    let changed = false;
    const buttons = card.buttons.map(button => {
      if (!button.switchSpec) return button;
      if (!targets.has(button.switchSpec)) return null;
      // A supplied prompt must be valid; never replace an invalid explicit fire.
      const question = button.fire === undefined ? originalQuestion : button.fire;
      if (question !== '' && !validQuestion(question)) return null;
      const value = register(button.switchSpec, question);
      changed = true;
      return {label: question === '' ? (button.switchSpec === 'linah' ? '⚖️ انتقل إلى لينة' : '🔎 انتقل إلى قبس') : handoffLabel(button.switchSpec), value};
    }).filter(Boolean);
    if (!card.buttons.some(b => b.switchSpec) && buttons.length === 1 && buttons[0].value.trim() === 'لا') {
      const target = legacyDeclines.get(signature(buttons[0].label));
      if (target) {
        buttons.unshift({label: handoffLabel(target), value: register(target, originalQuestion)});
        changed = true;
      }
    }
    // Unknown/unsupported target controls must not be submitted as ordinary text.
    if (buttons.length !== card.buttons.length) changed = true;
    if (!changed) return fence;
    return '```barq-card\n' + JSON.stringify({...card, buttons}).replace(/`/g, '\\u0060') + '\n```';
  });
}
