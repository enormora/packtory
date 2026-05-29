type WebLoginInput = {
    readonly registryUrl: string;
    readonly hostname: string;
};

type WebLoginResult = {
    readonly token: string;
    readonly username: string;
};

type LoginWebOpener = (loginUrl: string) => Promise<void>;
type LoginWebOptions = {
    readonly registry: string;
    readonly hostname: string;
    readonly authType: 'web';
};

type LoginWebFunction = (opener: LoginWebOpener, opts: LoginWebOptions) => Promise<WebLoginResult>;
type OpenInBrowser = (loginUrl: string) => Promise<void>;

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
                registry: input.registryUrl,
                hostname: input.hostname,
                authType: 'web'
            });
        }
    };
}
