import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourcePreparation } from '../../source-transformation/source-preparation.ts';
import { resolveRuntimeModule } from '../runtime-module-resolution.ts';
import { evaluateImportedConstant } from '../evaluation/imported-constant.ts';
import { specializeImportedValues } from './imported-value-specialization.ts';

const statement = 'import {key} from "./library.js";';
const cases: readonly (readonly [string, string, string])[] = [
    [ 'named export', 'export {key};const value=key;', 'export {key};const value=(42);' ],
    [ 'type query', 'type Key=typeof key;const value=key;', 'type Key=typeof key;const value=(42);' ],
    [ 'type annotation', 'type Key=key;const value=key;', 'type Key=key;const value=(42);' ],
    [ 'property name', 'const value={key:key};', 'const value={key:(42)};' ],
    [ 'shorthand property', 'const value={key};', 'const value={key};' ],
    [ 'label', 'key:{break key;}const value=key;', 'key:{break key;}const value=(42);' ],
    [
        'shadowed parameter',
        'function read(key:number){return key;}const value=key;',
        'function read(key:number){return key;}const value=(42);'
    ],
    [ 'type assertion', 'const value=key as number;', 'const value=(42) as number;' ],
    [ 'non-null assertion', 'const value=key!;', 'const value=(42)!;' ],
    [ 'satisfies expression', 'const value=key satisfies number;', 'const value=(42) satisfies number;' ],
    [ 'element key', 'const value=object[key];', 'const value=object[(42)];' ],
    [ 'property receiver', 'const value=key?.unknown;', 'const value=(42)?.unknown;' ],
    [ 'method receiver', 'const value=key.toString();', 'const value=(42).toString();' ],
    [ 'element receiver', 'const value=key[0];', 'const value=(42)[0];' ],
    [ 'loop initializer', 'for(key;;){break;}', 'for((42);;){break;}' ],
    [ 'loop condition', 'for(;key;){break;}', 'for(;(42);){break;}' ],
    [ 'loop increment', 'for(;false;key){}', 'for(;false;(42)){}' ],
    [ 'loop write', 'for(;false;key++){}', 'for(;false;key++){}' ],
    [ 'iteration target', 'for(key of values){}', 'for(key of values){}' ],
    [ 'parenthesized callee', '(key)();', '(key)();' ],
    [ 'optional callee', 'key?.();', 'key?.();' ],
    [ 'tag', '(key)`value`;', '(key)`value`;' ],
    [ 'constructor', 'new (key)();', 'new (key)();' ],
    [ 'delete operand', 'delete (key);', 'delete (key);' ],
    [ 'logical assignment', 'key||=value;', 'key||=value;' ],
    [ 'bitwise assignment', 'key^=value;', 'key^=value;' ],
    [ 'membership operand', 'const value=key in object;', 'const value=(42) in object;' ],
    [ 'instance operand', 'const value=key instanceof Constructor;', 'const value=(42) instanceof Constructor;' ],
    [ 'iteration expression', 'for(const item of key){}', 'for(const item of (42)){}' ],
    [ 'enumeration expression', 'for(const item in key){}', 'for(const item in (42)){}' ],
    [ 'destructuring default', '[target=key]=[];', '[target=(42)]=[];' ],
    [ 'destructuring target', '[key=42]=[];', '[key=42]=[];' ],
    [ 'computed target key', '({[key]:target}=object);', '({[(42)]:target}=object);' ],
    [ 'delete property key', 'delete object[key];', 'delete object[(42)];' ],
    [ 'parameter default', 'function read(value=key){return value;}', 'function read(value=(42)){return value;}' ],
    [ 'arrow result', 'const read=()=>key;', 'const read=()=>(42);' ]
];

suite('imported value read positions', function () {
    test('specializes an eligible read at the beginning of a source', function () {
        const source = createProject().createSourceFile('input.ts', 'value;');
        specializeImportedValues(createSourcePreparation(source), function (expression) {
            assert.strictEqual(expression.getText(), 'value');
            return { value: 42 };
        });
        assert.strictEqual(source.getFullText(), '(42);');
    });

    test('replaces an outer imported read without reevaluating its receiver', function () {
        const source = createProject().createSourceFile('input.ts', 'library.value;');
        specializeImportedValues(createSourcePreparation(source), function (expression) {
            assert.strictEqual(expression.getText(), 'library.value');
            return { value: 42 };
        });
        assert.strictEqual(source.getFullText(), '(42);');
    });

    for (const [ name, original, expected ] of cases) {
        test(name, function () {
            const project = createProject({
                withFiles: [
                    { filePath: '/repo/package.json', content: '{"type":"module"}' },
                    { filePath: '/repo/library.js', content: 'export const key=42;' },
                    { filePath: '/repo/index.ts', content: statement + original }
                ]
            });
            const source = project.getSourceFileOrThrow('/repo/index.ts');
            specializeImportedValues(createSourcePreparation(source), function (expression) {
                return evaluateImportedConstant(expression, resolveRuntimeModule);
            });
            assert.strictEqual(source.getFullText(), statement + expected);
        });
    }
});
