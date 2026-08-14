export async function load() {
    const producer = await import('../producer/index.js');
    const feature = await import(`../producer/feature.js`);
    return `${producer.value}-${feature.feature}`;
}
