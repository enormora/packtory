import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { resolveNamespaceExport, resolveNamespaceImport } from './namespace-export-value.ts';

type NamespaceCase = {
    readonly name: string;
    readonly files: Readonly<Record<string, string>>;
    readonly expected: string | undefined;
};

function namespaceTarget(files: Readonly<Record<string, string>>): string | undefined {
    const fixture = createExportModuleFixture(files, []);
    const declaration = fixture.models.get(fixture.source('index.js'))?.locals.get('ns')?.declarationNode;
    assertDefined(declaration);
    const target = resolveNamespaceImport(declaration, fixture.models, function (source, specifier) {
        assert.strictEqual(typeof specifier, 'string');
        return fixture.resolveModule(source, specifier);
    });
    return target?.getBaseName();
}
const cases: readonly NamespaceCase[] = [
    {
        name: 'direct namespace imports',
        files: { 'index.js': 'import * as ns from "./library.js";', 'library.js': 'export const value=42;' },
        expected: 'library.js'
    },
    {
        name: 'named namespace reexports',
        files: {
            'index.js': 'import {wrapped as ns} from "./wrapper.js";',
            'wrapper.js': 'export * as wrapped from "./library.js";',
            'library.js': 'export const value=42;'
        },
        expected: 'library.js'
    },
    {
        name: 'default snapshots of const namespace aliases',
        files: {
            'index.js': 'import ns from "./wrapper.js";',
            'wrapper.js': 'import * as library from "./library.js";const alias=(library);export default alias;',
            'library.js': 'export const value=42;'
        },
        expected: 'library.js'
    },
    {
        name: 'forwarded named namespace exports',
        files: {
            'index.js': 'import {wrapped as ns} from "./forward.js";',
            'forward.js': 'export {default as wrapped} from "./wrapper.js";',
            'wrapper.js': 'import * as library from "./library.js";export default library;',
            'library.js': 'export const value=42;'
        },
        expected: 'library.js'
    },
    {
        name: 'namespace imports exported under local aliases',
        files: {
            'index.js': 'import {wrapped as ns} from "./wrapper.js";',
            'wrapper.js': 'import * as library from "./library.js";export {library as wrapped};',
            'library.js': 'export const value=42;'
        },
        expected: 'library.js'
    },
    {
        name: 'named forwarding cycles',
        files: {
            'index.js': 'import {wrapped as ns} from "./a.js";',
            'a.js': 'export {wrapped} from "./b.js";',
            'b.js': 'export {wrapped} from "./a.js";'
        },
        expected: undefined
    },
    {
        name: 'self-referential const aliases',
        files: {
            'index.js': 'import ns from "./wrapper.js";',
            'wrapper.js': 'const alias=alias;export default alias;'
        },
        expected: undefined
    },
    {
        name: 'mutable namespace aliases',
        files: {
            'index.js': 'import ns from "./wrapper.js";',
            'wrapper.js': 'import * as library from "./library.js";let alias=library;export default alias;',
            'library.js': 'export const value=42;'
        },
        expected: undefined
    },
    {
        name: 'unbound default snapshot identifiers',
        files: { 'index.js': 'import ns from "./wrapper.js";', 'wrapper.js': 'export default missing;' },
        expected: undefined
    },
    {
        name: 'primitive defaults',
        files: { 'index.js': 'import ns from "./wrapper.js";', 'wrapper.js': 'export default 42;' },
        expected: undefined
    },
    {
        name: 'anonymous default classes',
        files: { 'index.js': 'import ns from "./wrapper.js";', 'wrapper.js': 'export default class{}' },
        expected: undefined
    },
    {
        name: 'named default functions',
        files: { 'index.js': 'import ns from "./wrapper.js";', 'wrapper.js': 'export default function named(){}' },
        expected: undefined
    },
    {
        name: 'unknown namespace targets',
        files: {
            'index.js': 'import {wrapped as ns} from "./wrapper.js";',
            'wrapper.js': 'export * as wrapped from "./external.js";'
        },
        expected: undefined
    },
    {
        name: 'missing local export bindings',
        files: {
            'index.js': 'import {wrapped as ns} from "./wrapper.js";',
            'wrapper.js': 'export {missing as wrapped};'
        },
        expected: undefined
    },
    {
        name: 'missing named exports',
        files: { 'index.js': 'import {wrapped as ns} from "./wrapper.js";', 'wrapper.js': 'export const other=42;' },
        expected: undefined
    },
    {
        name: 'ordinary declarations passed as import queries',
        files: { 'index.js': 'const ns=42;' },
        expected: undefined
    },
    {
        name: 'local constant namespace aliases',
        files: {
            'index.js': 'import * as source from "./library.js";const ns=source;',
            'library.js': 'export const value=42;'
        },
        expected: 'library.js'
    }
];

suite('namespace export values', function () {
    suite('model boundaries', function () {
        test('resolves a directly queried namespace export', function () {
            const fixture = createExportModuleFixture({
                'index.js': 'export * as library from "./library.js";',
                'library.js': 'export const value=1;'
            }, []);
            assert.strictEqual(
                resolveNamespaceExport(fixture.source('index.js'), 'library', fixture.models, fixture.resolveModule),
                fixture.source('library.js')
            );
        });

        test('rejects export queries for excluded modules', function () {
            const fixture = createExportModuleFixture({ 'index.js': 'export const value=1;' }, [ 'index.js' ]);
            assert.strictEqual(
                resolveNamespaceExport(fixture.source('index.js'), 'value', fixture.models, fixture.resolveModule),
                undefined
            );
        });

        test('rejects a local alias without an initializer', function () {
            assert.strictEqual(namespaceTarget({ 'index.js': 'const ns;' }), undefined);
        });

        test('does not identify property accesses as local namespace aliases', function () {
            assert.strictEqual(
                namespaceTarget({
                    'index.js': 'import * as library from "./library.js";const ns=library.value;',
                    'library.js': 'export const value=1;'
                }),
                undefined
            );
        });

        test('requires the model binding to own the referenced declaration', function () {
            const fixture = createExportModuleFixture({
                'index.js': 'import * as library from "./library.js";const other=1;const ns=library;',
                'library.js': 'export const value=1;'
            }, []);
            const source = fixture.source('index.js');
            const model = fixture.models.get(source);
            assertDefined(model);
            const other = model.locals.get('other');
            assertDefined(other);
            const models = new Map(fixture.models);
            models.set(source, { ...model, locals: new Map([ ...model.locals, [ 'library', other ] ]) });
            assert.strictEqual(
                resolveNamespaceImport(source.getVariableDeclarationOrThrow('ns'), models, fixture.resolveModule),
                undefined
            );
        });
    });

    test('rejects namespace entries without module specifier metadata', function () {
        const fixture = createExportModuleFixture({ 'index.js': 'export * as ns from "./missing.js";' }, []);
        const source = fixture.source('index.js');
        const models = new Map(fixture.models);
        const model = models.get(source);
        assertDefined(model);
        models.set(source, { ...model, entries: new Map([ [ 'ns', { kind: 'namespace', specifier: undefined } ] ]) });
        assert.strictEqual(
            resolveNamespaceExport(source, 'ns', models, function () {
                assert.fail('a namespace without a specifier must not request a module');
            }),
            undefined
        );
    });

    test('rejects declarations outside the supplied module models', function () {
        const fixture = createExportModuleFixture({ 'outside.js': 'const ns=42;' }, [ 'outside.js' ]);
        const declaration = fixture.source('outside.js').getVariableDeclarationOrThrow('ns');
        assert.strictEqual(resolveNamespaceImport(declaration, fixture.models, fixture.resolveModule), undefined);
    });

    for (const fixture of cases) {
        test(`resolves ${fixture.name} conservatively`, function () {
            assert.strictEqual(namespaceTarget(fixture.files), fixture.expected);
        });
    }

    test('follows long const alias chains without recursion limits', function () {
        const count = 256;
        const aliases = Array
            .from({ length: count }, function (_value, index) {
                const previousAlias = index === 0 ? 'library' : `alias${index - 1}`;
                return `const alias${index}=${previousAlias};`;
            })
            .join('');
        assert.strictEqual(
            namespaceTarget({
                'index.js': 'import ns from "./wrapper.js";',
                'wrapper.js': `import * as library from "./library.js";${aliases}export default alias${count - 1};`,
                'library.js': 'export const value=42;'
            }),
            'library.js'
        );
    });
});
