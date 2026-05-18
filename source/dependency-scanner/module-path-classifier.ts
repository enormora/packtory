import { unique } from 'remeda';

function isNodeModulesPath(filePath: string): boolean {
    return filePath.includes('/node_modules/');
}

function isLocalPath(filePath: string): boolean {
    return !isNodeModulesPath(filePath);
}

function extractModuleName(nodeModulePath: string): string {
    const prefix = '/node_modules/';
    const pattern = /\/node_modules\/(?:[^@]+?|(?:@.+?\/.+?))\//;

    const result = pattern.exec(nodeModulePath);

    if (result === null) {
        throw new Error(`Couldn’t find node_modules package name for '${nodeModulePath}'`);
    }

    return result[0].slice(prefix.length, -1);
}

export function determineLocalDependencies(dependencies: readonly string[]): readonly string[] {
    return dependencies.filter(isLocalPath);
}

export function determineExternalDependencies(dependencies: readonly string[]): readonly string[] {
    const modulePaths = dependencies.filter(isNodeModulesPath);
    const moduleNames = modulePaths.map(extractModuleName);
    return unique(moduleNames);
}
