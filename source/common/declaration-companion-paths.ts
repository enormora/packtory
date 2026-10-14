type DeclarationCompanionRule = {
    readonly declarationExtensions: readonly string[];
    readonly javaScriptExtension: string;
};

const declarationCompanionRules: readonly DeclarationCompanionRule[] = [
    { declarationExtensions: [ '.d.mts', '.d.ts' ], javaScriptExtension: '.mjs' },
    { declarationExtensions: [ '.d.cts', '.d.ts' ], javaScriptExtension: '.cjs' },
    { declarationExtensions: [ '.d.ts' ], javaScriptExtension: '.js' }
];

export function declarationCompanionCandidates(filePath: string): readonly string[] {
    const rule = declarationCompanionRules.find(function (candidate) {
        return filePath.endsWith(candidate.javaScriptExtension);
    });
    if (rule === undefined) {
        return [];
    }

    const pathWithoutExtension = filePath.slice(0, -rule.javaScriptExtension.length);
    return rule.declarationExtensions.map(function (declarationExtension) {
        return `${pathWithoutExtension}${declarationExtension}`;
    });
}

export function isDeclarationCompanionFilePath(filePath: string): boolean {
    return declarationCompanionRules.some(function (rule) {
        return rule.declarationExtensions.some(function (declarationExtension) {
            return filePath.endsWith(declarationExtension);
        });
    });
}
