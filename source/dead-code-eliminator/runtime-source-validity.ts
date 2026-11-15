import { parse, type ParserPlugin } from '@babel/parser';
import { ScriptKind, ts, type SourceFile } from 'ts-morph';

type RuntimeSourceType = 'commonjs' | 'module';

function sourcePlugins(source: SourceFile): readonly ParserPlugin[] | undefined {
    const kind = source.getScriptKind();
    if (kind === ScriptKind.JSX) {
        return [ 'jsx' ];
    }
    if (kind !== ScriptKind.TS && kind !== ScriptKind.TSX) {
        return undefined;
    }
    const plugins: readonly ParserPlugin[] = [ 'typescript', 'decorators-legacy', 'decoratorAutoAccessors' ];
    return kind === ScriptKind.TSX ? plugins.concat('jsx') : plugins;
}

function sourceTypes(source: SourceFile): readonly RuntimeSourceType[] {
    const filePath = source.getFilePath();
    if (filePath.endsWith('.cjs') || filePath.endsWith('.cts')) {
        return [ 'commonjs' ];
    }
    if (ts.isExternalModule(source.compilerNode) || filePath.endsWith('.mjs') || filePath.endsWith('.mts')) {
        return [ 'module' ];
    }
    return [ 'module', 'commonjs' ];
}

function parseRuntimeSource(source: SourceFile): void {
    const content = source.getFullText();
    const plugins = sourcePlugins(source);
    for (const sourceType of sourceTypes(source)) {
        const parserOptions = plugins === undefined ? { sourceType } : { sourceType, plugins: Array.from(plugins) };
        parse(content, parserOptions);
    }
}

export function runtimeSourceIsValid(source: SourceFile): boolean {
    try {
        parseRuntimeSource(source);
        return true;
    } catch {
        return false;
    }
}
