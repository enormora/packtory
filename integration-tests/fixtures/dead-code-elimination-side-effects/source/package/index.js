import { pureHelper } from './pure-helper.js';

function unusedHelper() {
    return 'unused';
}

export function publicApi(value) {
    return pureHelper(value);
}

console.log('module loaded');
