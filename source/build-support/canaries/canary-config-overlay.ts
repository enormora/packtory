import path from 'node:path';
import type { FileManager } from '../../file-manager/file-manager.ts';

const originalConfigFileName = 'packtory.config.canary-original.js';

type OverlayFileManager = Pick<FileManager, 'copyFile' | 'writeFile'>;

export type CanaryConfigOverlayInput = {
    readonly cloneFolder: string;
    readonly fileManager: OverlayFileManager;
};

export async function writeCanaryConfigOverlay(input: CanaryConfigOverlayInput): Promise<void> {
    const configPath = path.join(input.cloneFolder, 'packtory.config.js');
    const originalConfigPath = path.join(input.cloneFolder, originalConfigFileName);
    await input.fileManager.copyFile(configPath, originalConfigPath);
    await input.fileManager.writeFile(
        configPath,
        [
            `import * as original from './${originalConfigFileName}';`,
            '',
            'function withPublishSettings(settings) {',
            '    if (settings === undefined) {',
            '        return { sbom: { enabled: false } };',
            '    }',
            '    return { ...settings, sbom: { ...settings.sbom, enabled: false } };',
            '}',
            '',
            'function withDeadCodeElimination(settings) {',
            '    return { ...settings, enabled: true };',
            '}',
            '',
            'function withExistingPublishSettings(settings) {',
            '    return settings.publishSettings === undefined',
            '        ? {}',
            '        : { publishSettings: withPublishSettings(settings.publishSettings) };',
            '}',
            '',
            'function withPackageDeadCodeElimination(settings) {',
            '    return settings.deadCodeElimination === undefined',
            '        ? {}',
            '        : { deadCodeElimination: withDeadCodeElimination(settings.deadCodeElimination) };',
            '}',
            '',
            'function withCommonSettings(settings = {}) {',
            '    return {',
            '        ...settings,',
            '        deadCodeElimination: withDeadCodeElimination(settings.deadCodeElimination),',
            '        ...withExistingPublishSettings(settings)',
            '    };',
            '}',
            '',
            'function withPackageSettings(settings) {',
            '    return {',
            '        ...settings,',
            '        ...withPackageDeadCodeElimination(settings),',
            '        ...withExistingPublishSettings(settings)',
            '    };',
            '}',
            '',
            'function withCanarySettings(config) {',
            '    return {',
            '        ...config,',
            '        commonPackageSettings: withCommonSettings(config.commonPackageSettings),',
            '        packages: config.packages.map(function (packageConfig) {',
            '            return withPackageSettings(packageConfig);',
            '        })',
            '    };',
            '}',
            '',
            'async function loadOriginalConfig() {',
            "    if ('buildConfig' in original) {",
            '        return await original.buildConfig();',
            '    }',
            '    return original.config;',
            '}',
            '',
            'export async function buildConfig() {',
            '    return withCanarySettings(await loadOriginalConfig());',
            '}',
            ''
        ]
            .join('\n')
    );
}
