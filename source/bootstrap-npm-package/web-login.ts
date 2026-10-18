type WebLoginInput = {
    readonly registryAddress: string;
    readonly hostname: string;
};

type WebLoginResult = {
    readonly token: string;
    readonly username: string | undefined;
};

type LoginWebOpener = (loginAddress: string) => Promise<void>;
type LoginWebOptions = {
    readonly registry: string;
    readonly hostname: string;
    readonly authType: 'web';
};

type LoginWebFunction = (opener: LoginWebOpener, options: LoginWebOptions) => Promise<WebLoginResult>;
type OpenInBrowser = (loginAddress: string) => Promise<void>;

export type WebLoginDependencies = {
    readonly loginWeb: LoginWebFunction;
    readonly openInBrowser: OpenInBrowser;
};

export type WebLogin = {
    readonly login: (input: WebLoginInput) => Promise<WebLoginResult>;
};

export function createWebLogin(dependencies: Readonly<WebLoginDependencies>): WebLogin {
    const { loginWeb, openInBrowser } = dependencies;

    return {
        async login(input) {
            return loginWeb(openInBrowser, {
                registry: input.registryAddress,
                hostname: input.hostname,
                authType: 'web'
            });
        }
    };
}
