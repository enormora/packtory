export async function api() {
    const results = [];
    for (const load of [
        () => import('./literal.js'),
        () => import('./arrow.js'),
        () => import('./generator.js'),
        () => import('./prototype.js'),
        () => import('./expression.js'),
        () => import('./safe.js')
    ]) {
        try {
            results.push((await load()).value);
        } catch (error) {
            results.push(error.name);
        }
    }
    return results;
}
