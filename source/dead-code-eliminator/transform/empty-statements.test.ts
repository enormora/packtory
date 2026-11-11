import assert from 'node:assert';
import { runInNewContext } from 'node:vm';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { removeRedundantEmptyStatements } from './empty-statements.ts';

suite('empty statement removal', function () {
    for (
        const [ content, remaining ] of [
            [ 'while(false);', 1 ],
            [ 'for(;;);', 1 ],
            [ ';;"use strict";', 2 ],
            [ '"custom";;"use strict";', 1 ],
            [ '0;;"use strict";', 0 ],
            [ '0;;const value=1;;', 0 ],
            [ '"custom";;effect();', 0 ]
        ] as const
    ) {
        test(`preserves required boundaries in ${content}`, function () {
            const source = createProject().createSourceFile('input.js', content);
            removeRedundantEmptyStatements(source);
            assert.strictEqual(source.getDescendantsOfKind(SyntaxKind.EmptyStatement).length, remaining);
        });
    }

    test('does not introduce strict mode into a function', function () {
        const content = 'function probe(){;"use strict";return this===undefined;}probe();';
        const source = createProject().createSourceFile('input.js', content);
        assert.strictEqual(runInNewContext(content), false);
        removeRedundantEmptyStatements(source);
        assert.strictEqual(runInNewContext(source.getFullText()), false);
    });
});
