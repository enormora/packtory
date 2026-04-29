import assert from 'node:assert';
import { builtinModules } from 'node:module';
import fc from 'fast-check';
import { test } from 'mocha';
import { createProject } from '../test-libraries/typescript-project.ts';
import { getReferencedSourceFiles } from './source-file-references.ts';

const builtinImportArbitrary = fc.constantFrom(
    ...builtinModules.filter((moduleName) => {
        return !moduleName.startsWith('_');
    })
);
const unresolvedImportArbitrary = fc.stringMatching(/^[a-z][\da-z-]{0,10}$/).filter((moduleName) => {
    return !builtinModules.includes(moduleName) && !builtinModules.includes(`node:${moduleName}`);
});

test('getReferencedSourceFiles() does not throw for builtin imports', () => {
    fc.assert(
        fc.property(builtinImportArbitrary, (moduleName) => {
            const project = createProject({
                withFiles: [{ filePath: 'main.ts', content: `import value from "${moduleName}";` }]
            });

            assert.doesNotThrow(() => {
                getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));
            });
        })
    );
});

test('getReferencedSourceFiles() throws for unresolved non-builtin imports', () => {
    fc.assert(
        fc.property(unresolvedImportArbitrary, (moduleName) => {
            const project = createProject({
                withFiles: [{ filePath: 'main.ts', content: `import value from "${moduleName}";` }]
            });

            assert.throws(() => {
                getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));
            }, Error);
        })
    );
});
