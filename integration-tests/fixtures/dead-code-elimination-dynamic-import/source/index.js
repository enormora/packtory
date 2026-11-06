import { events } from './events.js';
events.push('entry');
export async function api() {
    const before = [...events];
    events.push('start-import');
    const ns = await import('./lazy.js');
    return { before, value: ns.value, keys: Object.keys(ns), events };
}
function unused() {
    return import('./unused.js');
}
