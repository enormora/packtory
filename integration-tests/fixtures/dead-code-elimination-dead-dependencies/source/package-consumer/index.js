function deadExternal() {
    return import('common-tags');
}

function deadSibling() {
    return import('../package-producer/index.js');
}

export function consumerEntry() {
    return 'consumer';
}
