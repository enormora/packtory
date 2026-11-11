import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { dynamicImportSpecifier } from './dynamic-import-specifier.ts';

const cases: readonly (readonly [string, string, string | undefined])[] = [
    [ 'missing argument', 'import();', undefined ],
    [ 'literal', 'import("./lazy.js");', './lazy.js' ],
    [ 'literal with dynamic scope', 'eval("path");import("./lazy.js");', './lazy.js' ],
    [ 'template literal', 'import(`./lazy.js`);', './lazy.js' ],
    [ 'derived constant', 'const folder="./";const path=folder+"lazy.js";import(path);', './lazy.js' ],
    [ 'local constant', 'function probe(){const path="./lazy.js";return import(path);}', './lazy.js' ],
    [ 'shadowed constant', 'const path="./lazy.js";function probe(path){return import(path);}', undefined ],
    [ 'mutable binding', 'let path="./other.js";path="./lazy.js";import(path);', undefined ],
    [ 'binding before initialization', 'import(path);const path="./lazy.js";', undefined ],
    [ 'numeric conversion', 'import(42);', undefined ],
    [ 'argument effects', 'import((console.log("effect"),"./lazy.js"));', undefined ],
    [ 'dynamic scope', 'const path="./lazy.js";eval("path");import(path);', undefined ]
];

suite('dynamic import specifier', function () {
    for (const [ name, content, expected ] of cases) {
        test(name, function () {
            const source = createProject().createSourceFile('/source/index.js', content);
            const call = source.getDescendantsOfKind(SyntaxKind.CallExpression).find(function (candidate) {
                return candidate.getExpression().getKind() === SyntaxKind.ImportKeyword;
            });
            assertDefined(call);
            assert.strictEqual(dynamicImportSpecifier(call), expected);
        });
    }

    test('does not treat ordinary call arguments as module requests', function () {
        const source = createProject().createSourceFile('/source/index.js', 'consume("./lazy.js");');
        assert.strictEqual(
            dynamicImportSpecifier(source.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)),
            undefined
        );
    });
});
