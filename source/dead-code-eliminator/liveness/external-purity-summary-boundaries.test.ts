import assert from 'node:assert';
import { suite, test } from 'mocha';
import { InMemoryFileSystemHost, Node as TypeScriptMorphNode, Project, type SourceFile } from 'ts-morph';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { observeCompilerInputs, type CompilerInputObservation } from '../../dependency-scanner/compiler-inputs.ts';
import { resolveRuntimeModule } from '../runtime-module-resolution.ts';
import { exportPurityForOrigin } from './external-purity-summary.ts';

type NamespaceObjectFixture = {
    readonly observation: CompilerInputObservation;
    readonly packageFolder: string;
    readonly source: SourceFile;
};

async function createNamespaceObjectFixture(): Promise<NamespaceObjectFixture> {
    const observation = observeCompilerInputs(new InMemoryFileSystemHost());
    const packageFolder = '/project/node_modules/schema-lib';
    const files = {
        'package.json': '{"type":"module","exports":"./index.js"}',
        'index.js': 'export * as selected from "./selected.js";export * as unrelated from "./unrelated.js";',
        'selected.js': 'export * from "./members.js";',
        'members.js': 'export const value=1;',
        'unrelated.js': 'export const value=2;'
    };
    for (const [ filePath, content ] of Object.entries(files)) {
        await observation.fileSystemHost.writeFile(`${packageFolder}/${filePath}`, content);
    }
    const project = new Project({
        fileSystem: observation.fileSystemHost,
        skipLoadingLibFiles: true,
        compilerOptions: { allowJs: true, noLib: true, types: [] }
    });
    const source = project.createSourceFile('/project/index.js', '');
    return { observation, packageFolder, source };
}

const compilerContexts = new Set<PropertyKey>([
    'getStatements',
    'getDeclarations',
    'getNameNode',
    'getNameNodeOrThrow',
    'getProject',
    'getSourceFile'
]);
const referenceQueries = new Set<PropertyKey>([ 'findReferences', 'findReferencesAsNodes' ]);

function observeCompilerQueries<Context extends Project | TypeScriptMorphNode>(
    context: Context,
    recordBinding: (name: string) => void,
    recordModule: (path: string) => void
): Context {
    function observeResult(value: unknown): unknown {
        if (Array.isArray(value)) {
            return value.map(observeResult);
        }
        return value instanceof TypeScriptMorphNode || value instanceof Project
            ? observeCompilerQueries(value, recordBinding, recordModule)
            : value;
    }
    return new Proxy(context, {
        get(instance, property) {
            const member: unknown = Reflect.get(instance, property, instance);
            if (typeof member !== 'function') {
                return member;
            }
            return function (...methodArguments: readonly unknown[]): unknown {
                if (referenceQueries.has(property) && instance instanceof TypeScriptMorphNode) {
                    recordBinding(instance.getText());
                }
                if (property === 'getSourceFile' && instance instanceof Project) {
                    recordModule(String(methodArguments[0]));
                }
                const result: unknown = Reflect.apply(member, instance, methodArguments);
                return compilerContexts.has(property) ? observeResult(result) : result;
            };
        }
    });
}

const factoryMethodPath = [ 'factory', { type: 'call-result' }, 'method' ] as const;

suite('external purity summary boundaries', function () {
    test('does not resolve unrelated named re-exports', function () {
        const fixture = createExportModuleFixture({
            'index.js': '',
            'library.js': 'export {selected} from "./selected.js";export {ignored} from "./ignored.js";',
            'selected.js': 'export const selected=()=>42;',
            'ignored.js': 'export const ignored=()=>0;'
        }, []);
        const requests: string[] = [];
        const library = observeCompilerQueries(fixture.source('library.js'), function () {
            return undefined;
        }, function (path) {
            requests.push(path);
        });

        assert.strictEqual(
            exportPurityForOrigin(
                { from: './library.js', path: [ 'selected' ] },
                fixture.source('index.js'),
                function () {
                    return library;
                }
            ),
            'pure-callable'
        );
        assert.deepStrictEqual(requests, [ '/repo/selected.js' ]);
    });

    test('follows an aliased namespace through a named re-export', function () {
        const fixture = createExportModuleFixture({
            'index.js': '',
            'library.js': 'export {nested as alias} from "./middle.js";',
            'middle.js': 'export * as nested from "./members.js";',
            'members.js': 'export const create=()=>42;'
        }, []);

        assert.strictEqual(
            exportPurityForOrigin(
                { from: './library.js', path: [ 'alias', 'create' ] },
                fixture.source('index.js'),
                resolveRuntimeModule
            ),
            'pure-callable'
        );
    });

    for (
        const content of [
            'export function selected(){return 42;}export function ignored(){return 0;}',
            'export const selected=()=>42;export const ignored=()=>0;'
        ]
    ) {
        test(`does not query references of unrelated exports in ${content}`, function () {
            const fixture = createExportModuleFixture({ 'index.js': '', 'library.js': content }, []);
            const queries: string[] = [];
            const library = observeCompilerQueries(fixture.source('library.js'), function (name) {
                queries.push(name);
            }, function () {
                return undefined;
            });

            assert.strictEqual(
                exportPurityForOrigin(
                    { from: './library.js', path: [ 'selected' ] },
                    fixture.source('index.js'),
                    function () {
                        return library;
                    }
                ),
                'pure-callable'
            );
            assert.ok(queries.includes('selected'));
            assert.deepStrictEqual(
                queries.filter(function (name) {
                    return name !== 'selected';
                }),
                []
            );
        });
    }

    test('does not load unrelated namespaces or namespace members when checking a namespace object', async function () {
        const { observation, packageFolder, source } = await createNamespaceObjectFixture();

        assert.strictEqual(
            exportPurityForOrigin({ from: 'schema-lib', path: [ 'selected' ] }, source, resolveRuntimeModule),
            'pure-object'
        );
        const inputs = observation.snapshot();
        if (inputs === null) {
            assert.fail('Expected reusable compiler input observations');
        }
        const unread = new Set([ `${packageFolder}/members.js`, `${packageFolder}/unrelated.js` ]);
        assert.strictEqual(
            inputs.some(function (input) {
                return input.operation === 'readFile' && unread.has(input.filePath);
            }),
            false
        );
    });

    for (
        const [ content, path, expected ] of [
            [ 'export const factory=async()=>({method(){return 1;}});', factoryMethodPath, 'unknown' ],
            [ 'export function factory(){return {method(){return 1;}};}', factoryMethodPath, 'pure-callable' ],
            [ 'export function factory(){return {};}factory=globalThis.replace;', [ 'factory' ], 'unknown' ],
            [
                'export const { builder }={builder:()=>42};export {builder as "{ builder }"};',
                [ '{ builder }' ],
                'unknown'
            ],
            [ 'export * from "./unavailable.js";', [ 'missing' ], 'unknown' ],
            [ 'export const z={value:42};', [ 'z', 'value' ], 'unknown' ],
            [ 'export const z={value:{}};', [ 'z', 'value' ], 'pure-object' ],
            [ 'export const z={[key]:()=>1};', [ 'z' ], 'unknown' ],
            [
                'export const factory=()=>({get value(){return 1;}});',
                [ 'factory', { type: 'call-result' } ],
                'unknown'
            ],
            [
                'export const factory=()=>({method(){return 1;}});',
                [ 'factory', { type: 'call-result' }, 'method' ],
                'pure-callable'
            ],
            [ 'export const z={mutate(){this.value=1;}};z.mutate();', [ 'z' ], 'unknown' ]
        ] as const
    ) {
        test(`classifies ${JSON.stringify(path)} from ${content}`, function () {
            const fixture = createExportModuleFixture({
                'index.js': 'import * as library from "./library.js";',
                'library.js': content
            }, []);
            assert.strictEqual(
                exportPurityForOrigin({ from: './library.js', path }, fixture.source('index.js'), resolveRuntimeModule),
                expected
            );
        });
    }
});
