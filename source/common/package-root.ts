type ScriptRoot<TFile, TTypes> = {
    readonly javaScript: TFile;
    readonly declarationFile?: TTypes | undefined;
    readonly json?: never;
};
type DeclarationRoot<TFile> = {
    readonly declarationFile: TFile;
    readonly javaScript?: never;
    readonly json?: never;
};
type JsonRoot<TFile> = {
    readonly json: TFile;
    readonly javaScript?: never;
    readonly declarationFile?: never;
};
export type PackageRoot<TFile, TTypes = TFile> = DeclarationRoot<TTypes> | JsonRoot<TFile> | ScriptRoot<TFile, TTypes>;

export function rootFiles<TFile, TDeclarationFile>(
    root: PackageRoot<TFile, TDeclarationFile>
): readonly (TDeclarationFile | TFile)[] {
    return [ root.javaScript, root.json, root.declarationFile ].filter(function isPresent(file) {
        return file !== undefined;
    });
}

export function rootEntryFile<TFile, TDeclarationFile>(
    root: PackageRoot<TFile, TDeclarationFile>
): TDeclarationFile | TFile {
    const entry = root.javaScript ?? root.json ?? root.declarationFile;
    if (entry === undefined) {
        throw new Error('Package root has no entry file');
    }
    return entry;
}
