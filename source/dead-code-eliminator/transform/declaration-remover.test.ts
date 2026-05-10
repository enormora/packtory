import assert from 'node:assert';
import { test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { applyRemovalPlan } from './declaration-remover.ts';

function transform(
    content: string,
    surviving: ReadonlySet<string>
): { readonly text: string; readonly mutated: boolean } {
    const project = createProject({ withFiles: [{ filePath: 'index.ts', content }] });
    const sourceFile = project.getSourceFileOrThrow('index.ts');
    const mutated = applyRemovalPlan(sourceFile, { survivingNames: surviving });
    return { text: sourceFile.getFullText(), mutated };
}

test('removes an unreachable function declaration', () => {
    const { text, mutated } = transform('function dead() {}\nexport function live() {}', new Set(['live']));
    assert.strictEqual(text.includes('dead'), false);
    assert.strictEqual(text.includes('live'), true);
    assert.strictEqual(mutated, true);
});

test('keeps a reachable function declaration', () => {
    const { text, mutated } = transform('function alive() {}', new Set(['alive']));
    assert.strictEqual(text.includes('alive'), true);
    assert.strictEqual(mutated, false);
});

test('removes the whole VariableStatement when every declarator is unreachable', () => {
    const { text, mutated } = transform('const a = 1, b = 2;\nexport const live = 3;', new Set(['live']));
    assert.strictEqual(text.includes('const a'), false);
    assert.strictEqual(text.includes('const b'), false);
    assert.strictEqual(text.includes('live'), true);
    assert.strictEqual(mutated, true);
});

test('removes only the dead declarators when some are reachable', () => {
    const { text, mutated } = transform('export const a = 1, b = 2;', new Set(['a']));
    assert.strictEqual(text.includes('a'), true);
    assert.strictEqual(text.includes('b = 2'), false);
    assert.strictEqual(mutated, true);
});

test('returns false when nothing needs to change', () => {
    const { text, mutated } = transform('export const a = 1;', new Set(['a']));
    assert.strictEqual(text.includes('a'), true);
    assert.strictEqual(mutated, false);
});

test('removes class declarations whose name is not surviving', () => {
    const { text } = transform('class Dead {}\nexport class Live {}', new Set(['Live']));
    assert.strictEqual(text.includes('class Dead'), false);
    assert.strictEqual(text.includes('class Live'), true);
});

test('removes interface, type alias, enum, and namespace declarations whose names are unreachable', () => {
    const content = [
        'interface DeadInterface {}',
        'type DeadAlias = string;',
        'enum DeadEnum { A }',
        'namespace DeadNamespace {}',
        'export interface LiveInterface {}'
    ].join('\n');
    const { text } = transform(content, new Set(['LiveInterface']));
    assert.strictEqual(text.includes('DeadInterface'), false);
    assert.strictEqual(text.includes('DeadAlias'), false);
    assert.strictEqual(text.includes('DeadEnum'), false);
    assert.strictEqual(text.includes('DeadNamespace'), false);
    assert.strictEqual(text.includes('LiveInterface'), true);
});

test('does not affect imports, exports, or other non-declaration statements', () => {
    const content = ['import { x } from "./other";', 'export { something } from "./other";'].join('\n');
    const { text, mutated } = transform(content, new Set<string>());
    assert.strictEqual(text.includes('import'), true);
    assert.strictEqual(text.includes('export'), true);
    assert.strictEqual(mutated, false);
});

test('returns true if any statement was mutated', () => {
    const { mutated } = transform('function dead() {}', new Set<string>());
    assert.strictEqual(mutated, true);
});

test('an empty file produces no mutations', () => {
    const { text, mutated } = transform('', new Set<string>());
    assert.strictEqual(text, '');
    assert.strictEqual(mutated, false);
});

test('keeps an anonymous default-exported function declaration whose name cannot be resolved', () => {
    const { text, mutated } = transform('export default function() { return 1; }', new Set<string>());
    assert.strictEqual(text.includes('default'), true);
    assert.strictEqual(text.includes('function'), true);
    assert.strictEqual(mutated, false);
});
