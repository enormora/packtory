import {
    Node as TsMorphNode,
    SyntaxKind,
    type ArrowFunction,
    type CallExpression,
    type FunctionDeclaration,
    type FunctionExpression,
    type Identifier,
    type MethodDeclaration,
    type Node as TsMorphNodeType,
    type ObjectLiteralElementLike,
    type ObjectLiteralExpression,
    type ParameterDeclaration,
    type SourceFile,
    type StringLiteral,
    type Symbol as TsMorphSymbol
} from 'ts-morph';

type ImportingFunction = ArrowFunction | FunctionDeclaration | FunctionExpression | MethodDeclaration;

type ParameterInjectedImportCall = {
    readonly functionDeclaration: FunctionDeclaration;
    readonly importArgumentIndex: number;
    readonly injectedParameterIndex: number;
    readonly literal: StringLiteral;
};

type PropertyInjectedImportCall = {
    readonly containerParameterIndex: number;
    readonly functionDeclaration: FunctionDeclaration;
    readonly importArgumentIndex: number;
    readonly literal: StringLiteral;
    readonly propertyName: string;
};

type InjectedImportCall = ParameterInjectedImportCall | PropertyInjectedImportCall;

type FunctionParameterTarget = {
    readonly functionDeclaration: FunctionDeclaration;
    readonly parameterIndex: number;
};

type StringLiteralArgument = {
    readonly argumentIndex: number;
    readonly literal: StringLiteral;
};

function symbolDeclarations(symbol: TsMorphSymbol | undefined): readonly TsMorphNodeType[] {
    if (symbol === undefined) {
        return [];
    }

    const targetSymbol = symbol.getAliasedSymbol() ?? symbol;
    return targetSymbol.getDeclarations();
}

function referencesDeclaration(identifier: Readonly<Identifier>, declaration: TsMorphNodeType): boolean {
    return symbolDeclarations(identifier.getSymbol()).includes(declaration);
}

function parameterForIdentifier(identifier: Readonly<Identifier>): ParameterDeclaration | undefined {
    return symbolDeclarations(identifier.getSymbol()).find(TsMorphNode.isParameterDeclaration);
}

function functionParameterTarget(parameter: ParameterDeclaration): FunctionParameterTarget | undefined {
    const parent = parameter.getParent();
    if (!TsMorphNode.isFunctionDeclaration(parent)) {
        return undefined;
    }

    return {
        functionDeclaration: parent,
        parameterIndex: parent.getParameters().indexOf(parameter)
    };
}

function isStringLiteralArgument(argument: StringLiteralArgument | undefined): argument is StringLiteralArgument {
    return argument !== undefined;
}

function stringLiteralArguments(callExpression: Readonly<CallExpression>): readonly StringLiteralArgument[] {
    return callExpression
        .getArguments()
        .map(function (argument, argumentIndex): StringLiteralArgument | undefined {
            const literal = argument.asKind(SyntaxKind.StringLiteral);
            return literal === undefined ? undefined : { argumentIndex, literal };
        })
        .filter(isStringLiteralArgument);
}

function collectParameterInjectedImportCalls(callExpression: Readonly<CallExpression>): readonly InjectedImportCall[] {
    const callee = callExpression.getExpression().asKind(SyntaxKind.Identifier);
    if (callee === undefined) {
        return [];
    }

    const parameter = parameterForIdentifier(callee);
    const target = parameter === undefined ? undefined : functionParameterTarget(parameter);
    if (target === undefined) {
        return [];
    }

    return stringLiteralArguments(callExpression).map(function (literalArgument) {
        return {
            functionDeclaration: target.functionDeclaration,
            injectedParameterIndex: target.parameterIndex,
            importArgumentIndex: literalArgument.argumentIndex,
            literal: literalArgument.literal
        };
    });
}

function collectPropertyInjectedImportCalls(callExpression: Readonly<CallExpression>): readonly InjectedImportCall[] {
    const callee = callExpression.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
    if (callee === undefined) {
        return [];
    }

    const containerIdentifier = callee.getExpression().asKind(SyntaxKind.Identifier);
    const parameter = containerIdentifier === undefined ? undefined : parameterForIdentifier(containerIdentifier);
    const target = parameter === undefined ? undefined : functionParameterTarget(parameter);
    if (target === undefined) {
        return [];
    }

    return stringLiteralArguments(callExpression).map(function (literalArgument) {
        return {
            containerParameterIndex: target.parameterIndex,
            functionDeclaration: target.functionDeclaration,
            importArgumentIndex: literalArgument.argumentIndex,
            literal: literalArgument.literal,
            propertyName: callee.getName()
        };
    });
}

function collectInjectedImportCalls(callExpression: Readonly<CallExpression>): readonly InjectedImportCall[] {
    return [
        ...collectParameterInjectedImportCalls(callExpression),
        ...collectPropertyInjectedImportCalls(callExpression)
    ];
}

function callTargetsFunctionDeclaration(
    callExpression: Readonly<CallExpression>,
    functionDeclaration: FunctionDeclaration
): boolean {
    return symbolDeclarations(callExpression.getExpression().getSymbol()).includes(functionDeclaration);
}

function objectLiteralArgument(
    callExpression: Readonly<CallExpression>,
    parameterIndex: number
): ObjectLiteralExpression | undefined {
    const argument = callExpression.getArguments()[parameterIndex];
    return argument === undefined ? undefined : argument.asKind(SyntaxKind.ObjectLiteralExpression);
}

function directFunctionInitializer(initializer: TsMorphNodeType): readonly ImportingFunction[] {
    const arrowFunction = initializer.asKind(SyntaxKind.ArrowFunction);
    if (arrowFunction !== undefined) {
        return [ arrowFunction ];
    }

    const functionExpression = initializer.asKind(SyntaxKind.FunctionExpression);
    return functionExpression === undefined ? [] : [ functionExpression ];
}

function importingFunctionsForSymbol(symbol: TsMorphSymbol | undefined): readonly ImportingFunction[] {
    return symbolDeclarations(symbol).flatMap(function (declaration) {
        if (TsMorphNode.isFunctionDeclaration(declaration)) {
            return [ declaration ];
        }

        const initializer = declaration
            .asKind(SyntaxKind.VariableDeclaration)
            ?.getInitializer();
        if (initializer === undefined) {
            return [];
        }

        return directFunctionInitializer(initializer);
    });
}

function importingFunctionsForValue(value: TsMorphNodeType): readonly ImportingFunction[] {
    if (TsMorphNode.isArrowFunction(value) || TsMorphNode.isFunctionExpression(value)) {
        return [ value ];
    }

    const identifier = value.asKind(SyntaxKind.Identifier);
    return identifier === undefined ? [] : importingFunctionsForSymbol(identifier.getSymbol());
}

function dynamicImportUsesParameter(
    callExpression: Readonly<CallExpression>,
    parameter: ParameterDeclaration
): boolean {
    if (callExpression.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
        return false;
    }

    const [ firstArgument ] = callExpression.getArguments();
    const importArgument = firstArgument === undefined ? undefined : firstArgument.asKind(SyntaxKind.Identifier);
    return importArgument !== undefined && referencesDeclaration(importArgument, parameter);
}

function isImportingFunction(node: TsMorphNodeType): node is ImportingFunction {
    return TsMorphNode.isArrowFunction(node) ||
        TsMorphNode.isFunctionDeclaration(node) ||
        TsMorphNode.isFunctionExpression(node) ||
        TsMorphNode.isMethodDeclaration(node);
}

function enclosingImportingFunction(node: TsMorphNodeType): ImportingFunction | undefined {
    return node.getFirstAncestor(isImportingFunction);
}

function isReturnedFromFunction(expression: TsMorphNodeType, importingFunction: ImportingFunction): boolean {
    const parent = expression.getParent();
    if (TsMorphNode.isReturnStatement(parent)) {
        return enclosingImportingFunction(parent) === importingFunction;
    }

    return TsMorphNode.isArrowFunction(importingFunction) && importingFunction.getBody() === expression;
}

function returnedImportExpression(callExpression: CallExpression): TsMorphNodeType {
    const parent = callExpression.getParent();
    return TsMorphNode.isAwaitExpression(parent) ? parent : callExpression;
}

function functionReturnsImportedArgument(importingFunction: ImportingFunction, importArgumentIndex: number): boolean {
    return importingFunction.getParameters().some(function (parameter, parameterIndex) {
        return parameterIndex === importArgumentIndex &&
            importingFunction
                .getDescendantsOfKind(SyntaxKind.CallExpression)
                .some(function (callExpression) {
                    const returnedExpression = returnedImportExpression(callExpression);
                    return dynamicImportUsesParameter(callExpression, parameter) &&
                        isReturnedFromFunction(returnedExpression, importingFunction);
                });
    });
}

function expressionImportsArgument(expression: TsMorphNodeType | undefined, importArgumentIndex: number): boolean {
    if (expression === undefined) {
        return false;
    }

    return importingFunctionsForValue(expression).some(function (importingFunction) {
        return functionReturnsImportedArgument(importingFunction, importArgumentIndex);
    });
}

function functionListImportsArgument(
    importingFunctions: readonly ImportingFunction[],
    importArgumentIndex: number
): boolean {
    for (const importingFunction of importingFunctions) {
        if (functionReturnsImportedArgument(importingFunction, importArgumentIndex)) {
            return true;
        }
    }

    return false;
}

function shorthandPropertyImportsArgument(
    property: ObjectLiteralElementLike,
    propertyName: string,
    importArgumentIndex: number
): boolean {
    const shorthand = property.asKind(SyntaxKind.ShorthandPropertyAssignment);
    if (shorthand === undefined) {
        return false;
    }
    if (shorthand.getNameNode().getText() !== propertyName) {
        return false;
    }

    return functionListImportsArgument(
        importingFunctionsForSymbol(shorthand.getValueSymbol()),
        importArgumentIndex
    );
}

function isParameterInjectedImportCall(
    input: Readonly<InjectedImportCall>
): input is Readonly<ParameterInjectedImportCall> {
    return Object.hasOwn(input, 'injectedParameterIndex');
}

function objectLiteralPropertyImportsArgument(
    objectLiteral: Readonly<ObjectLiteralExpression>,
    propertyName: string,
    importArgumentIndex: number
): boolean {
    return objectLiteral.getProperties().some(function (property) {
        if (TsMorphNode.isMethodDeclaration(property)) {
            return property.getName() === propertyName &&
                functionReturnsImportedArgument(property, importArgumentIndex);
        }
        if (TsMorphNode.isPropertyAssignment(property)) {
            return property.getName() === propertyName &&
                expressionImportsArgument(property.getInitializer(), importArgumentIndex);
        }
        return shorthandPropertyImportsArgument(property, propertyName, importArgumentIndex);
    });
}

function callSiteImportsArgument(
    callExpression: Readonly<CallExpression>,
    input: Readonly<InjectedImportCall>
): boolean {
    if (!callTargetsFunctionDeclaration(callExpression, input.functionDeclaration)) {
        return false;
    }

    if (isParameterInjectedImportCall(input)) {
        return expressionImportsArgument(
            callExpression.getArguments()[input.injectedParameterIndex],
            input.importArgumentIndex
        );
    }

    const objectLiteral = objectLiteralArgument(callExpression, input.containerParameterIndex);
    return objectLiteral !== undefined &&
        objectLiteralPropertyImportsArgument(objectLiteral, input.propertyName, input.importArgumentIndex);
}

function sourceFileHasImportingCallSite(
    sourceFile: Readonly<SourceFile>,
    input: Readonly<InjectedImportCall>
): boolean {
    return sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).some(function (callExpression) {
        return callSiteImportsArgument(callExpression, input);
    });
}

function projectHasImportingCallSite(input: Readonly<InjectedImportCall>): boolean {
    return input.functionDeclaration.getProject().getSourceFiles().some(function (sourceFile) {
        return sourceFileHasImportingCallSite(sourceFile, input);
    });
}

export function getInjectedDynamicImportLiterals(sourceFile: Readonly<SourceFile>): readonly StringLiteral[] {
    const literals: StringLiteral[] = [];
    for (const callExpression of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        for (const importCall of collectInjectedImportCalls(callExpression)) {
            if (projectHasImportingCallSite(importCall)) {
                literals.push(importCall.literal);
            }
        }
    }

    return literals;
}
