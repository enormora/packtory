import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    inspectPackageSymbols,
    type PackageSymbolInspection
} from '../../source/packages/packtory/packtory.entry-point.ts';
import { assertDefined } from '../../source/test-libraries/deep-subset-assertion.ts';
import type { PacktoryConfigurationWithoutRegistry } from '../../source/configuration/configuration.ts';

function configuration(enabled: boolean): PacktoryConfigurationWithoutRegistry {
    return {
        commonPackageSettings: {
            sourcesFolder: path.join(process.cwd(), 'integration-tests/fixtures/dead-code-elimination/source'),
            mainPackageManifest: { type: 'module' },
            publishSettings: { access: 'public' },
            deadCodeElimination: { enabled }
        },
        packages: [ { name: 'example', roots: { main: { javaScript: 'package/index.js' } } } ]
    };
}

function assertDecisions(symbols: PackageSymbolInspection['symbols'], enabled: boolean): void {
    const helper = symbols.find(function (symbol) {
        return symbol.name === 'internalHelper';
    });
    const unused = symbols.find(function (symbol) {
        return symbol.name === 'unusedInternal';
    });
    const imported = symbols.find(function (symbol) {
        return symbol.name === 'used' && symbol.kind === 'FunctionDeclaration';
    });
    assertDefined(helper);
    assertDefined(unused);
    assertDefined(imported);
    assert.deepStrictEqual({
        helper: helper.decision,
        imported: imported.decision,
        unused: unused.decision,
        reason: unused.reason
    }, {
        helper: 'kept',
        imported: 'kept',
        unused: enabled ? 'removed' : 'kept',
        reason: enabled ? 'unreachable' : 'dead-code-elimination-disabled'
    });
    assert.deepStrictEqual(
        helper.chain.map(function (step) {
            return step.reason;
        }),
        [ 'entry-export', 'identifier-reference' ]
    );
}

suite('symbol inspection', function () {
    for (const enabled of [ true, false ]) {
        test(`reports symbol decisions with elimination enabled=${String(enabled)}`, async function () {
            const outcome = await inspectPackageSymbols(configuration(enabled), 'example');
            assert.ok(outcome.result.isOk, JSON.stringify(outcome.result));
            assertDecisions(outcome.result.value.symbols, enabled);
        });
    }
});
