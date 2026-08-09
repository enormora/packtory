import { used, unused } from '../shared/helpers.js';

function internalHelper() {
    return 'helper';
}

function unusedInternal() {
    return 'unused';
}

function unusedLocalFile() {
    return import('../dead-local.js');
}

export function api() {
    return `${internalHelper()}-${used()}`;
}
