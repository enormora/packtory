import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { namespaceConsumerDemand } from './namespace-consumer-demand.ts';
import { allNamespaceProperties, noNamespaceProperties } from './namespace-demand.ts';

suite('namespace consumer demand', function () {
    for (
        const [ name, expected ] of [
            [ 'value', [ 'value as chosen' ] ],
            [ 'missing', [] ],
            [ 'default', [ 'initial,{value as chosen, other as ignored}' ] ]
        ] as const
    ) {
        test(`observes only imports matching ${name}`, function () {
            const source = createProject().createSourceFile(
                'input.ts',
                'import initial,{value as chosen, other as ignored} from "library";'
            );
            const declaration = source.getImportDeclarations()[0];
            assertDefined(declaration);
            const requested: string[] = [];
            const demand = namespaceConsumerDemand({ type: 'import', declaration }, name, {
                binding(node) {
                    requested.push(node.getText());
                    return allNamespaceProperties;
                },
                exported() {
                    return assert.fail('Import demand must not request exported values');
                },
                expression() {
                    return assert.fail('Import demand must not request dynamic expressions');
                }
            });
            assert.deepStrictEqual(requested, expected);
            assert.strictEqual(demand, expected.length === 0 ? noNamespaceProperties : allNamespaceProperties);
        });
    }

    for (const [ name, expected ] of [ [ 'value', [ 'chosen' ] ], [ 'missing', [] ] ] as const) {
        test(`observes only forwarded exports matching ${name}`, function () {
            const source = createProject().createSourceFile(
                'input.ts',
                'export {value as chosen, other as ignored} from "library";'
            );
            const declaration = source.getExportDeclarations()[0];
            assertDefined(declaration);
            const requested: string[] = [];
            namespaceConsumerDemand({ type: 'export', declaration }, name, {
                binding() {
                    return assert.fail('Export demand must not request imported bindings');
                },
                exported(_source, exportedName) {
                    requested.push(exportedName);
                    return allNamespaceProperties;
                },
                expression() {
                    return assert.fail('Export demand must not request dynamic expressions');
                }
            });
            assert.deepStrictEqual(requested, expected);
        });
    }
});
