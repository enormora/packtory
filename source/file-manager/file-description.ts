type BaseDescription = {
    readonly content: string;
    readonly isExecutable: boolean;
};

export type FileDescription = BaseDescription & {
    readonly filePath: string;
};

export type TransferableFileDescription = BaseDescription & {
    readonly sourceFilePath: string;
    readonly targetFilePath: string;
};
