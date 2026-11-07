import { pathToFileURL as pathToFileAddress } from 'node:url';
import { runNodeProbe } from './run-node-probe.ts';

function deadCodeEliminationProbeScript(
    entryAddress: string,
    exportName: string,
    invokeExport: boolean
): string {
    return `
        import { format } from 'node:util';
        const output = [];
        for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
            console[method] = (...args) => output.push([method, format(...args)]);
        }
        globalThis.__packtoryDeadCodeEliminationEvents = [];
        const references = new Map();
        function observe(value) {
            if (value === undefined) return { type: 'undefined' };
            if (typeof value === 'bigint') return { type: 'bigint', value: String(value) };
            if (typeof value === 'number' && !Number.isFinite(value)) return { type: 'number', value: String(value) };
            if (Object.is(value, -0)) return { type: 'number', value: '-0' };
            if (typeof value === 'function') return { type: 'function' };
            if (typeof value === 'symbol') return { type: 'symbol', value: String(value) };
            if (value === null || typeof value !== 'object') return value;
            if (references.has(value)) return { reference: references.get(value) };
            const id = references.size;
            references.set(value, id);
            return {
                id,
                type: Array.isArray(value) ? 'array' : 'object',
                length: Array.isArray(value) ? value.length : null,
                properties: Object.keys(value).sort().map(key => [key, observe(value[key])])
            };
        }
        const observation = { exportNames: null, exports: null, value: null, after: null, error: null };
        let missingExport = false;
        let phase = 'evaluation';
        try {
            const module = await import(${JSON.stringify(entryAddress)});
            missingExport = ${String(invokeExport)} && !Object.hasOwn(module, ${JSON.stringify(exportName)});
            observation.exportNames = Object.keys(module).sort();
            phase = 'exports';
            observation.exports = observe(module);
            if (${String(invokeExport)}) {
                phase = 'call';
                const exported = module[${JSON.stringify(exportName)}];
                observation.value = observe(typeof exported === 'function' ? await exported() : exported);
                references.clear();
                observation.after = observe(module);
            }
        } catch (error) {
            observation.error = { phase, type: typeof error, name: error?.name ?? null };
        }
        observation.events = observe(globalThis.__packtoryDeadCodeEliminationEvents);
        observation.output = output;
        process.stdout.write(JSON.stringify({ missingExport, observation }));
    `;
}

export async function runDeadCodeEliminationProbe(
    entryPath: string,
    exportName: string,
    invokeExport: boolean
): Promise<unknown> {
    return runNodeProbe(deadCodeEliminationProbeScript(pathToFileAddress(entryPath).href, exportName, invokeExport));
}
