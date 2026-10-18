export async function loadInjected(loadModule) {
    const producer = await loadModule('../producer/index.js');
    return producer.value;
}

export async function load() {
    return loadInjected((modulePath) => import(modulePath));
}
