import { baseConfig } from '@enormora/eslint-config-base';
import { typescriptConfig } from '@enormora/eslint-config-typescript';
import { nodeConfig, nodeConfigFileConfig, nodeEntryPointFileConfig } from '@enormora/eslint-config-node';
import { avaConfig } from '@enormora/eslint-config-ava';

export default [
    {
        ignores: ['target/**/*', 'integration-tests/fixtures/**/*']
    },
    baseConfig,
    nodeConfig,
    {
        ...typescriptConfig,
        files: ['**/*.ts']
    },
    {
        ...avaConfig,
        files: ['**/*.test.ts']
    },
    {
        ...nodeConfigFileConfig,
        files: ['eslint.config.js', 'ava.config.js', 'ava.integration.config.js']
    },
    {
        ...nodeEntryPointFileConfig,
        files: ['source/*.entry-point.ts', 'source/example.ts']
    },
    {
        files: ['**/*.ts'],
        rules: {
            '@typescript-eslint/no-extra-parens': 'off',
            '@typescript-eslint/no-magic-numbers': [
                'error',
                {
                    ignoreEnums: false,
                    ignoreNumericLiteralTypes: true,
                    ignoreReadonlyClassProperties: false,
                    ignoreTypeIndexes: false,
                    ignoreDefaultValues: true,
                    ignoreArrayIndexes: false,
                    detectObjects: false,
                    enforceConst: false,
                    ignoreClassFieldInitialValues: false,
                    ignore: [-1, 0, 1]
                }
            ]
        }
    },
    {
        files: ['**/*.test.ts'],
        rules: {
            '@typescript-eslint/no-magic-numbers': 'off'
        }
    }
];
