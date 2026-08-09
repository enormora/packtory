function deadExternal() {
    return import('common-tags');
}

function deadSibling() {
    return import('../pkg-producer/index.js');
}

export function consumerEntry() {
    return 'consumer';
}
