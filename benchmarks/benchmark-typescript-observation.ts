import assert from 'node:assert/strict';
import { RealFileSystemHost } from '@ts-morph/common';
import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget } from 'ts-morph';
import {
    createDeadCodeEliminator,
    type InspectableDeadCodeEliminator
} from '../source/dead-code-eliminator/eliminator.ts';
import type { ProgressBroadcastProvider } from '../source/progress/progress-broadcaster.ts';

export function observeTypeScriptParsing(recordBytes: (bytes: number) => void): typeof Project {
    return new Proxy(Project, {
        construct(target, constructorArguments) {
            const project: unknown = Reflect.construct(target, constructorArguments);
            assert.ok(project instanceof Project);
            return new Proxy(project, {
                get(instance, property) {
                    const member: unknown = Reflect.get(instance, property);
                    if (typeof member !== 'function') {
                        return member;
                    }
                    return function (...methodArguments: readonly unknown[]): unknown {
                        const content = methodArguments[1];
                        if (property === 'createSourceFile' && typeof content === 'string') {
                            recordBytes(Buffer.byteLength(content));
                        }
                        return Reflect.apply(member, instance, methodArguments);
                    };
                }
            });
        }
    });
}

export function createBenchmarkDeadCodeEliminator(
    progressBroadcaster: ProgressBroadcastProvider,
    recordBytes: (bytes: number) => void
): InspectableDeadCodeEliminator {
    const EliminationProject = observeTypeScriptParsing(recordBytes);
    return createDeadCodeEliminator({
        trace: undefined,
        progressBroadcaster,
        createProject() {
            return new EliminationProject({
                compilerOptions: {
                    allowJs: true,
                    module: ModuleKind.Node16,
                    esModuleInterop: true,
                    noLib: true,
                    target: ScriptTarget.ES2022,
                    moduleResolution: ModuleResolutionKind.Node16
                },
                skipLoadingLibFiles: true,
                fileSystem: new RealFileSystemHost()
            });
        }
    });
}
