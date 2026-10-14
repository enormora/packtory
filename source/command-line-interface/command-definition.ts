import type { Except } from 'type-fest';
import { command as createLibraryCommand, subcommands as createLibraryCommandGroup } from 'cmd-ts';

type CommandArguments = Readonly<Parameters<typeof createLibraryCommand>[0]['args']>;
type CommandValues<Arguments extends CommandArguments> = Readonly<
    Parameters<
        ReturnType<typeof createLibraryCommand<Arguments, never>>['handler']
    >[0]
>;

type CommandConfiguration<
    Arguments extends CommandArguments,
    Handler extends (values: CommandValues<Arguments>) => unknown
> = Readonly<Except<Parameters<typeof createLibraryCommand<Arguments, Handler>>[0], 'args'>> & {
    readonly arguments: Arguments;
};

type CommandGroup = Readonly<Parameters<typeof createLibraryCommandGroup>[0]['cmds']>;
type CommandGroupOptions<Commands extends CommandGroup> = Readonly<
    Except<Parameters<typeof createLibraryCommandGroup<Commands>>[0], 'cmds'>
>;
type CommandGroupConfiguration<Commands extends CommandGroup> = CommandGroupOptions<Commands> & {
    readonly commands: Commands;
};

export function defineCommand<
    Arguments extends CommandArguments,
    Handler extends (values: CommandValues<Arguments>) => unknown
>(
    configuration: CommandConfiguration<Arguments, Handler>
): ReturnType<typeof createLibraryCommand<Arguments, Handler>> {
    const { arguments: commandArguments, ...options } = configuration;
    return createLibraryCommand({ ...options, args: commandArguments });
}

export function defineCommandGroup<Commands extends CommandGroup>(
    configuration: CommandGroupConfiguration<Commands>
): ReturnType<typeof createLibraryCommandGroup<Commands>> {
    const { commands, ...options } = configuration;
    return createLibraryCommandGroup({ ...options, cmds: commands });
}
