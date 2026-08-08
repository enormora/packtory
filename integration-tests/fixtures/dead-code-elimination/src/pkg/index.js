import { used, unused } from '../shared/helpers.js';

function internalHelper() {
    return 'helper';
}

function unusedInternal() {
    return 'unused';
}

export function api() {
    return `${internalHelper()}-${used()}`;
}
