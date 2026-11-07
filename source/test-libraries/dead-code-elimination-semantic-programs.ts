import fastCheck from 'fast-check';
import { bundleResource, linkedBundle } from './bundle-fixtures.ts';
import type { GeneratedDeadCodeEliminationProgram } from './dead-code-elimination-generated-programs.ts';

const eventLog = 'globalThis.__packtoryDeadCodeEliminationEvents';
const effect = `${eventLog}.push("effect");`;
const throwingEffect = `${effect} throw new RangeError("generated");`;
const defaultValue = `(() => { ${effect} return VALUE; })()`;

export const deadCodeEliminationSemanticScenarios = {
    'object-getter': `const { value } = { get value() { ${effect} return VALUE; } };`,
    'throwing-getter': `const { value } = { get value() { ${throwingEffect} } };`,
    'nested-pattern': `const { nested: { value = ${defaultValue} } } = { nested: {} };`,
    'executed-default': `const { value = ${defaultValue} } = {};`,
    'bypassed-default': `const { value = ${defaultValue} } = { value: VALUE };`,
    'array-default': `const [ value = ${defaultValue} ] = [];`,
    'nested-array': `const [ [ value = ${defaultValue} ] ] = [ [] ];`,
    'iterator-effects': `const [ value ] = { *[Symbol.iterator]() { ${effect} yield VALUE; } };`,
    'iterator-throw': `const [ value ] = { *[Symbol.iterator]() { ${throwingEffect} } };`,
    'pure-access': 'const { value } = { value: VALUE };',
    'primitive-key': 'const object = { [VALUE]: 1 };',
    'string-coercion': `const object = { [{ toString() { ${effect} return "key"; } }]: VALUE };`,
    'value-coercion': `const object = { [{ toString: undefined, valueOf() { ${effect} return "key"; } }]: VALUE };`,
    'symbol-coercion': `const object = { [{ [Symbol.toPrimitive]() { ${effect} return "key"; } }]: VALUE };`,
    'throwing-coercion': `const object = { [{ toString() { ${throwingEffect} } }]: VALUE };`,
    'valid-heritage': 'class Unused extends (class {}) {}',
    'null-heritage': 'class Unused extends null {}',
    'invalid-heritage': `class Unused extends VALUE { static { ${effect} } }`,
    'nonconstructible-heritage': 'class Unused extends (() => VALUE) {}',
    'invalid-prototype': 'function Base() {} Base.prototype = 1; class Unused extends Base {}',
    'static-initialization': `class Unused { static { ${effect} } }`,
    'computed-class-name': `class Unused { [(() => { ${effect} return "method"; })()]() {} }`,
    'direct-eval': 'const hidden = VALUE; export function api() { return eval("hidden"); }',
    'nested-eval':
        'const hidden = VALUE; export function api() { const local = 1; return (() => eval("hidden + local"))(); }',
    'indirect-eval': 'const hidden = VALUE; export function api() { return (0, eval)("typeof hidden"); }',
    'shadowed-binding-eval': 'const hidden = VALUE; export function api() { const hidden = 1; return eval("hidden"); }',
    'namespace-read': 'import * as feature from "./feature.js"; export function api() { return feature.value; }',
    'namespace-enumeration':
        'import * as feature from "./feature.js"; export function api() { return Object.keys(feature).sort(); }',
    'namespace-escape': 'import * as feature from "./feature.js"; export function api() { return feature; }',
    'namespace-live-binding':
        'import * as feature from "./feature.js"; export function api() { const before = feature.value; feature.increment(); return [before, feature.value, Object.keys(feature).sort()]; }',
    'dynamic-namespace': [
        'export async function api() {',
        `${eventLog}.push("before");`,
        'const feature = await import("./feature.js");',
        `${eventLog}.push("after");`,
        'const before = feature.value; feature.increment();',
        'return [Object.keys(feature).sort(), before, feature.value]; }'
    ]
        .join(' '),
    'named-export': 'export { value as publicValue } from "./feature.js";',
    'star-export': 'export * from "./feature.js";',
    'transitive-export': 'export * from "./barrel.js";',
    'ambiguous-export': 'export * from "./feature.js"; export * from "./other.js";',
    'disambiguated-export':
        'export * from "./feature.js"; export * from "./other.js"; export { value } from "./feature.js";',
    'getter-key-interaction': `const { [{ toString() { ${effect} return "value"; } }]: value = ${defaultValue} } =
            { get value() { ${effect} return undefined; } };`
} as const;

export type DeadCodeEliminationSemanticScenario = keyof typeof deadCodeEliminationSemanticScenarios;

export type DeadCodeEliminationSemanticParameters = {
    readonly scenario: DeadCodeEliminationSemanticScenario;
    readonly value: number;
    readonly declarations: boolean;
    readonly singleLine: boolean;
    readonly sourceSkew: boolean;
};

export function deadCodeEliminationSemanticProgram(
    parameters: DeadCodeEliminationSemanticParameters
): GeneratedDeadCodeEliminationProgram {
    const selected = deadCodeEliminationSemanticScenarios[parameters.scenario].replaceAll(
        'VALUE',
        function () {
            return String(parameters.value);
        }
    );
    const source = selected.includes('function api()')
        ? selected
        : `${selected}\nexport function api() { return ${parameters.value}; }`;
    const files = {
        'index.js': `${source}\nconst independentConstant = 99;`,
        'feature.js': `${eventLog}.push("feature"); export let value = ${parameters.value};
            export const extra = "public"; export function increment() { value++; }`,
        'other.js': 'export const value = "ambiguous"; export const other = true;',
        'barrel.js': 'export * from "./feature.js";'
    };
    const contents = Object.entries(files).map(function ([ targetFilePath, content ]) {
        const resource = bundleResource(`/source/${parameters.sourceSkew ? 'authored/' : ''}${targetFilePath}`, {
            targetFilePath,
            content: parameters.singleLine ? content.replaceAll('\n', ' ') : content.replaceAll('; ', ';\n')
        });
        return {
            ...resource,
            directDependencies: new Set(resource.moduleReferences.flatMap(function (reference) {
                return reference.type === 'local-code' ? [ reference.targetFilePath ] : [];
            })),
            isSubstituted: false
        };
    });
    const entry = contents[0];
    if (entry === undefined) {
        throw new Error('semantic program requires an entry');
    }
    const declaration = {
        ...bundleResource('/source/index.d.ts', { content: 'export declare function api(): unknown;' }),
        isSubstituted: false
    };
    const name = JSON.stringify(parameters);
    return {
        name,
        entry: { bundleName: 'package', targetFilePath: 'index.js', exportName: 'api' },
        fileListing: contents
            .map(function (resource) {
                return `${resource.fileDescription.targetFilePath}\n${resource.fileDescription.content}`;
            })
            .join('\n\n'),
        bundle: linkedBundle({
            name: 'package',
            contents: parameters.declarations ? [ ...contents, declaration ] : contents,
            roots: {
                main: parameters.declarations
                    ? { javaScript: entry.fileDescription, declarationFile: declaration.fileDescription }
                    : { javaScript: entry.fileDescription }
            }
        })
    };
}

export function deadCodeEliminationSemanticArbitrary(
    scenario: DeadCodeEliminationSemanticScenario,
    declarations: boolean
): fastCheck.Arbitrary<GeneratedDeadCodeEliminationProgram> {
    return fastCheck
        .record({
            scenario: fastCheck.constant(scenario),
            declarations: fastCheck.constant(declarations),
            value: fastCheck.integer({ min: -10, max: 10 }),
            singleLine: fastCheck.boolean(),
            sourceSkew: fastCheck.boolean()
        })
        .map(deadCodeEliminationSemanticProgram);
}
