type DeclarationCompanionRule = {
    readonly declarationExtensions: readonly string[];
    readonly jsExtension: string;
};

const declarationCompanionRules: readonly DeclarationCompanionRule[] = [
    { declarationExtensions: [ '.d.mts', '.d.ts' ], jsExtension: '.mjs' },
    { declarationExtensions: [ '.d.cts', '.d.ts' ], jsExtension: '.cjs' },
    { declarationExtensions: [ '.d.ts' ], jsExtension: '.js' }
];

export function declarationCompanionCandidates(filePath: string): readonly string[] {
    const rule = declarationCompanionRules.find(function (candidate) {
        return filePath.endsWith(candidate.jsExtension);
    });
    if (rule === undefined) {
        return [];
    }

    const pathWithoutExtension = filePath.slice(0, -rule.jsExtension.length);
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
