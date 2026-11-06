import { fallback } from './fallback.js';

const events = [];
const { missing = events.push('missing') } = {};
const { explicit = events.push('undefined') } = { explicit: undefined };
const { defined = events.push('bypassed') } = { defined: 0 };
const { nested: { inner = events.push('inner') } = fallback(events) } = {};
const { getter = events.push('default') } = {
    get getter() {
        events.push('get');
    }
};

export function api() {
    return { value: 42, events };
}
