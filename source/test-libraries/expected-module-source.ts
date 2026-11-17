import assert from 'node:assert';
import fixtures from './expected-elimination-output.json' with { type: 'json' };

const expectedSources = new Set(fixtures.moduleSources);
function readableModuleSource(source: string): string {
    return source.replaceAll(
        /data:text\/javascript;base64,(?<moduleCode>[A-Za-z0-9+/=]+)/gu,
        function (_address, data: string) {
            return readableModuleSource(Buffer.from(data, 'base64').toString('utf8'));
        }
    );
}
export function assertExpectedModuleSource(source: string): void {
    assert.strictEqual(expectedSources.has(readableModuleSource(source)), true, 'Changed emitted module source');
}
export function assertExpectedModuleExpression(content: string, expression: string): void {
    const address = `data:text/javascript;base64,${Buffer.from(content).toString('base64')}`;
    assertExpectedModuleSource(`
        try {
            const module = await import(${JSON.stringify(address)});
            console.log(JSON.stringify({ value: ${expression} }));
        } catch (error) {
            console.log(JSON.stringify({ error: error.name }));
        }
    `);
}
