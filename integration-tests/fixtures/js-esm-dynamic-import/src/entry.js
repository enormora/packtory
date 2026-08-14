export async function loadValues() {
    const foo = await import('./foo.js');
    const bar = await import(`./bar.js`);
    return `${foo.foo}-${bar.bar}`;
}
