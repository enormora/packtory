import type { FileSystemHost } from 'ts-morph';

export const syncMethodNames = {
    fileExists: 'fileExistsSync',
    directoryExists: 'directoryExistsSync',
    readFile: 'readFileSync'
} as const;

export function bindRequiredMethod<Result>(
    object: FileSystemHost,
    methodName: string,
    expectedResultDescription: string,
    validateResult: (value: unknown) => value is Result
): (filePath: string) => Result {
    const method: unknown = Reflect.get(object, methodName);

    if (typeof method !== 'function') {
        throw new TypeError(`Expected ${methodName} to be a function`);
    }

    return (filePath) => {
        const result: unknown = Reflect.apply(method, object, [filePath]);

        if (!validateResult(result)) {
            throw new TypeError(`Expected ${methodName} to return ${expectedResultDescription}`);
        }

        return result;
    };
}
