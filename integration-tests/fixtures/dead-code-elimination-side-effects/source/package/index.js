import { pureHelper } from './pure-helper.js';

function unusedHelper() {
    return 'unused';
}

export function publicApi() {
    return pureHelper();
}

console.log('module loaded');
