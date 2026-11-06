import * as ns from './dep.js';

function consume(value) {
    return [Object.keys(value), value.other];
}

export function api() {
    ns.increment();
    return {
        value: ns.value,
        keys: Object.keys(ns),
        ownKeys: Reflect.ownKeys(ns).map(String),
        escaped: consume(ns)
    };
}
