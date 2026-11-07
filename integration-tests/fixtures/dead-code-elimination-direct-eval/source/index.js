import defaultValue, { value as importedValue } from './dep.js';
import * as namespace from './dep.js';

const hidden = 7;
let counter = 0;

function readHidden() {
    return hidden;
}

export function api() {
    const local = 3;
    const probe = source => (eval)(source);
    return {
        hidden: probe('hidden'),
        nested: probe('readHidden() + local'),
        counter: probe('counter += 1'),
        imported: probe('importedValue + defaultValue'),
        namespace: probe('Object.keys(namespace)'),
        namespaceValue: probe('namespace.other'),
        indirect: (0, eval)('typeof hidden')
    };
}
