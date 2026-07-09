import { baseConfig } from '@enormora/eslint-config-base';
import { mochaNodeAssertConfig, testSupportConfig } from '@enormora/eslint-config-mocha-node-assert';
import { typescriptConfig } from '@enormora/eslint-config-typescript';
import { nodeConfig, nodeConfigFileConfig, nodeEntryPointFileConfig } from '@enormora/eslint-config-node';

export default [
    {
        ignores: [ 'target/**/*', 'integration-tests/fixtures/**/*' ]
    },
    ...baseConfig,
    {
        ...nodeConfig,
        files: [ '**/*.{js,cjs,mjs,ts,cts,mts}' ]
    },
    {
        ...typescriptConfig,
        files: [ '**/*.ts' ]
    },
    {
        ...mochaNodeAssertConfig,
        files: [ '**/*.test.ts', '**/*.property.ts', 'integration-tests/**/*.ts' ]
    },
    {
        ...testSupportConfig,
        files: [ 'source/test-libraries/**/*.ts', '**/*test-support.ts' ]
    },
    {
        ...nodeConfigFileConfig,
        files: [
            'dependency-cruiser.config.js',
            'eslint.config.js',
            'packtory.config.js'
        ]
    },
    {
        ...nodeEntryPointFileConfig,
        files: [ 'source/packages/**/*.entry-point.ts', 'source/packages/**/*.composition.ts' ]
    }
];
