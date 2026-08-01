import fs from 'node:fs/promises';
import { baseConfig } from '@enormora/eslint-config-base';
import { mochaNodeAssertConfig, testSupportConfig } from '@enormora/eslint-config-mocha-node-assert';
import { typescriptConfig } from '@enormora/eslint-config-typescript';
import { nodeConfig, nodeConfigFileConfig, nodeEntryPointFileConfig } from '@enormora/eslint-config-node';

const packageJsonSchema = JSON.parse(
    await fs.readFile(new URL('./schemas/package-json.schema.json', import.meta.url), { encoding: 'utf8' })
);

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
    },
    {
        files: [ 'package.json' ],
        rules: {
            'json-schema-validator/no-invalid': [
                'error',
                {
                    schemas: [
                        {
                            fileMatch: [ 'package.json' ],
                            schema: packageJsonSchema
                        }
                    ],
                    useSchemastoreCatalog: false
                }
            ]
        }
    }
];
