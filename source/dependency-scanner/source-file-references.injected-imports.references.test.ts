import { suite, test } from 'mocha';
import { createProject } from '../test-libraries/typescript-project.ts';
import { expectFooReference, expectNoReferences } from './source-file-references.injected-imports-fixtures.test.ts';

suite('source-file-references injected loader references', function () {
    test('follows renamed imports and re-exports to the importing call', function () {
        expectFooReference(createProject({
            withFiles: [
                {
                    filePath: 'main.ts',
                    content: 'import { renamed } from "./bridge"; renamed(path => import(path));'
                },
                { filePath: 'bridge.ts', content: 'export { foo as renamed } from "./a";' },
                { filePath: 'a.ts', content: 'export function foo(load) { return load("./foo"); }' },
                { filePath: 'foo.ts', content: '' }
            ]
        }));
    });

    test('follows namespace member calls', function () {
        expectFooReference(createProject({
            withFiles: [
                { filePath: 'main.ts', content: 'import * as api from "./a"; api.foo(path => import(path));' },
                { filePath: 'a.ts', content: 'export function foo(load) { return load("./foo"); }' },
                { filePath: 'foo.ts', content: '' }
            ]
        }));
    });

    test('follows anonymous default-exported functions', function () {
        expectFooReference(createProject({
            withFiles: [
                { filePath: 'main.ts', content: 'import foo from "./a"; foo(path => import(path));' },
                { filePath: 'a.ts', content: 'export default function (load) { return load("./foo"); }' },
                { filePath: 'foo.ts', content: '' }
            ]
        }));
    });

    test('ignores references passed as arguments and observes newly added calls', function () {
        const project = createProject({
            withFiles: [
                { filePath: 'main.ts', content: 'import { foo } from "./a"; consume(foo);' },
                { filePath: 'a.ts', content: 'export function foo(load) { return load("./foo"); }' },
                { filePath: 'foo.ts', content: '' }
            ]
        });
        expectNoReferences(project);
        project.createSourceFile('caller.ts', 'import { foo } from "./a"; foo(path => import(path));');
        expectFooReference(project);
    });
});
