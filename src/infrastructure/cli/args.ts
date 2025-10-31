export type CliArgs = Record<string, string | boolean>;

export function parseArgs(args: string[] = process.argv.slice(2)): CliArgs {
  const parsedArgs: CliArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2);
    const next = args[i + 1];

    if (next && !next.startsWith('--')) {
      parsedArgs[key] = next;
      i++;
    } else {
      parsedArgs[key] = true;
    }
  }

  return parsedArgs;
}
