import { Node as TsMorphNode, SyntaxKind, type BindingElement, type VariableDeclaration } from 'ts-morph';

export type VariableDeclarationBinding = {
    readonly name: string;
    readonly declarationNode: BindingElement | VariableDeclaration;
    readonly referenceNode: VariableDeclaration;
};

export function collectVariableDeclarationBindings(
    declarator: VariableDeclaration
): readonly VariableDeclarationBinding[] {
    type BindingNameNode = ReturnType<BindingElement['getNameNode']>;
    type BindingCollector = (
        nameNode: BindingNameNode,
        declarationNode: BindingElement | VariableDeclaration,
        referenceNode: VariableDeclaration
    ) => readonly VariableDeclarationBinding[];
    const collectBindingsFromNameNode: BindingCollector = function (nameNode, declarationNode, referenceNode) {
        if (TsMorphNode.isIdentifier(nameNode)) {
            return [ { name: nameNode.getText(), declarationNode, referenceNode } ];
        }
        return nameNode.getElements().flatMap(function (element) {
            if (!TsMorphNode.isBindingElement(element)) {
                return [];
            }
            return collectBindingsFromNameNode(
                element.getNameNode(),
                element,
                element.getFirstAncestorByKindOrThrow(SyntaxKind.VariableDeclaration)
            );
        });
    };

    return collectBindingsFromNameNode(declarator.getNameNode(), declarator, declarator);
}

function namesBoundByVariableDeclaration(declarator: VariableDeclaration): readonly string[] {
    return collectVariableDeclarationBindings(declarator).map(function (binding) {
        return binding.name;
    });
}

export function variableDeclarationSurvives(
    declarator: VariableDeclaration,
    survivingNames: ReadonlySet<string>
): boolean {
    return namesBoundByVariableDeclaration(declarator).some(function (name) {
        return survivingNames.has(name);
    });
}
