import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { assertDeepSubset, assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import {
    assertDeadCodeEliminationBehaviorEquivalent,
    observeDeadCodeEliminationBehavior,
    type DeadCodeEliminationBehaviorComparison
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import { bundleForCodeFile, inputs } from '../test-libraries/eliminator-test-support.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { createDeadCodeEliminator } from './eliminator.ts';

type MemberCase = {
    readonly name: string;
    readonly dependency: string;
    readonly setup: string;
    readonly key: string;
    readonly remainingKeys: number;
};

type MemberComparison = {
    readonly original: DeadCodeEliminationBehaviorComparison['leftBundles'];
    readonly emitted: DeadCodeEliminationBehaviorComparison['rightBundles'];
    readonly content: string;
};

const packageManifest = '{"name":"schema-lib","type":"module","exports":"./index.js"}';
const primitiveMember = 'export const resultType={config:"initial"};';
const coercingValue = '{toString(){console.log("coerce");return "key";}}';
const replacements = [
    `resultType.config=${coercingValue};`,
    `const alias=resultType;alias.config=${coercingValue};`,
    `Object.defineProperty(resultType,"config",{value:${coercingValue}});`,
    `Reflect.set(resultType,"config",${coercingValue});`,
    `function update(value){value.config=${coercingValue};}update(resultType);`
];

const cases: readonly MemberCase[] = [
    ...replacements.flatMap(function (replacement, index) {
        return [
            {
                name: `dependency replacement ${index}`,
                dependency: primitiveMember + replacement,
                setup: '',
                key: 'resultType.config',
                remainingKeys: 1
            },
            {
                name: `consumer replacement ${index}`,
                dependency: primitiveMember,
                setup: replacement,
                key: 'resultType.config',
                remainingKeys: 1
            }
        ];
    }),
    {
        name: 'exported string field',
        dependency: primitiveMember,
        setup: '',
        key: 'resultType.config',
        remainingKeys: 1
    },
    {
        name: 'exported number field',
        dependency: 'export const resultType={config:1+2};',
        setup: '',
        key: 'resultType.config',
        remainingKeys: 1
    },
    {
        name: 'exported getter',
        dependency: 'export const resultType={get config(){return "key";}};',
        setup: '',
        key: 'resultType.config',
        remainingKeys: 1
    },
    {
        name: 'accessor overriding data',
        dependency: 'export const resultType={config:"initial",get config(){console.log("get");return "key";}};',
        setup: '',
        key: 'resultType.config',
        remainingKeys: 1
    },
    {
        name: 'spread overriding data',
        dependency: `export const resultType={config:"initial",...{config:${coercingValue}}};`,
        setup: '',
        key: 'resultType.config',
        remainingKeys: 1
    },
    {
        name: 'inherited prototype accessor',
        dependency: 'export const resultType={__proto__:{get config(){console.log("get");return "key";}}};',
        setup: '',
        key: 'resultType.config',
        remainingKeys: 1
    },
    {
        name: 'unrelated member remains unknown',
        dependency: `export const resultType={config:"initial",other:${coercingValue}};`,
        setup: 'const ignored={[resultType.other]:1};',
        key: 'resultType.config',
        remainingKeys: 2
    }
];

function assertRemainingKeys(content: string | undefined, expected: number): void {
    assertDefined(content);
    const source = createProject().createSourceFile('output.js', content);
    assert.strictEqual(source.getDescendantsOfKind(SyntaxKind.ComputedPropertyName).length, expected);
}

async function memberComparison(fixture: MemberCase): Promise<MemberComparison> {
    const content = `import {resultType} from "schema-lib";${fixture.setup}` +
        `const unused={[${fixture.key}]:1};export function probe(){return 42;}`;
    const bundle = bundleForCodeFile({
        name: 'package',
        inputFilePath: '/repo/source/index.js',
        targetFilePath: 'index.js',
        content
    });
    const eliminator = createDeadCodeEliminator({
        createProject() {
            return createProject({
                withFiles: [
                    { filePath: '/repo/node_modules/schema-lib/package.json', content: packageManifest },
                    { filePath: '/repo/node_modules/schema-lib/index.js', content: fixture.dependency }
                ]
            });
        },
        progressBroadcaster: {
            emit() {
                return undefined;
            },
            hasSubscribers() {
                return false;
            }
        },
        trace: undefined
    });
    const [ output ] = await eliminator.eliminate(inputs(bundle));
    assertDefined(output);
    const dependency = {
        name: 'schema-lib',
        roots: {},
        contents: [ { fileDescription: { targetFilePath: 'index.js', content: fixture.dependency } } ]
    };
    const emittedContent = output.contents[0]?.fileDescription.content;
    assertDefined(emittedContent);
    return { original: [ bundle, dependency ], emitted: [ output, dependency ], content: emittedContent };
}

async function assertMemberEffects(fixture: MemberCase): Promise<void> {
    const comparison = await memberComparison(fixture);
    await assertDeadCodeEliminationBehaviorEquivalent({
        name: fixture.name,
        entry: { bundleName: 'package', targetFilePath: 'index.js', exportName: 'probe' },
        leftName: 'native',
        leftBundles: comparison.original,
        rightName: 'emitted',
        rightBundles: comparison.emitted
    });
    assertRemainingKeys(comparison.content, fixture.remainingKeys);
}

suite('imported computed key effects', function () {
    for (const fixture of cases) {
        test(`preserves ${fixture.name}`, async function () {
            await assertMemberEffects(fixture);
        });
    }

    test('preserves replacement by a downstream consumer outside the analyzed package', async function () {
        const comparison = await memberComparison({
            name: 'downstream replacement',
            dependency: primitiveMember,
            setup: '',
            key: 'resultType.config',
            remainingKeys: 1
        });
        const launcher = {
            name: 'consumer',
            roots: {},
            contents: [ {
                fileDescription: {
                    targetFilePath: 'index.js',
                    content: 'import {resultType} from "schema-lib";' +
                        `Object.defineProperty(resultType,"config",{value:${coercingValue}});` +
                        'export async function probe(){const app=await import("package");return app.probe();}'
                }
            } ]
        };
        const oracle = {
            name: 'downstream replacement',
            entry: { bundleName: 'consumer', targetFilePath: 'index.js', exportName: 'probe' },
            bundles: [ ...comparison.original, launcher ]
        };
        const native = await observeDeadCodeEliminationBehavior(oracle);
        assertDeepSubset(native[0]?.result.observation, { error: null, value: 42, output: [ [ 'log', 'coerce' ] ] });
        await assertDeadCodeEliminationBehaviorEquivalent({
            ...oracle,
            leftName: 'native',
            leftBundles: oracle.bundles,
            rightName: 'emitted',
            rightBundles: [ ...comparison.emitted, launcher ]
        });
        assertRemainingKeys(comparison.content, 1);
    });
});
