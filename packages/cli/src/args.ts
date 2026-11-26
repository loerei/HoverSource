export type ParsedCliArgs = {
  args: Record<string, string | boolean>;
  subcommand?: string;
  positionals: string[];
};

const SHORT_VALUE_OPTIONS: Record<string, string> = {
  p: "port",
  t: "target",
  e: "exec",
  r: "root",
};

const SHORT_BOOLEAN_FLAGS: Record<string, string> = {
  d: "dashboard",
  h: "help",
  v: "vue",
  V: "version",
  s: "solid",
  a: "angular",
  y: "yes",
  q: "quiet",
};

const LONG_VALUE_OPTIONS = new Set([
  "port",
  "target",
  "exec",
  "root",
  "debug-port",
  "proxy-port",
  "dev-port",
]);

function isNegativeNumber(arg: string): boolean {
  return /^-\d+(\.\d+)?$/.test(arg);
}

function canConsumeAsValue(nextArg: string | undefined): nextArg is string {
  if (nextArg === undefined) return false;
  return !nextArg.startsWith("-") || isNegativeNumber(nextArg);
}

function parseLongOption(
  arg: string,
  args: Record<string, string | boolean>,
  argv: string[],
  indexRef: { index: number }
): void {
  const eqIdx = arg.indexOf("=");
  if (eqIdx !== -1) {
    const key = arg.slice(2, eqIdx);
    const value = arg.slice(eqIdx + 1);
    args[key] = value;
    return;
  }

  const key = arg.slice(2);
  if (LONG_VALUE_OPTIONS.has(key)) {
    const nextArg = argv[indexRef.index + 1];
    if (canConsumeAsValue(nextArg)) {
      indexRef.index++;
      args[key] = nextArg;
      return;
    }
  }

  args[key] = true;
}

function parseShortOption(
  arg: string,
  args: Record<string, string | boolean>,
  argv: string[],
  indexRef: { index: number }
): void {
  const raw = arg.slice(1);
  const eqIdx = raw.indexOf("=");
  const optionChar = eqIdx === -1 ? raw : raw.slice(0, eqIdx);
  const val = eqIdx === -1 ? undefined : raw.slice(eqIdx + 1);

  if (optionChar in SHORT_BOOLEAN_FLAGS) {
    args[SHORT_BOOLEAN_FLAGS[optionChar]] = true;
  } else if (optionChar in SHORT_VALUE_OPTIONS) {
    const key = SHORT_VALUE_OPTIONS[optionChar];
    if (val !== undefined) {
      args[key] = val;
    } else {
      const nextArg = argv[indexRef.index + 1];
      if (canConsumeAsValue(nextArg)) {
        indexRef.index++;
        args[key] = nextArg;
      }
    }
  }
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const args: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  const indexRef = { index: 0 };
  let endOfOptions = false;

  for (; indexRef.index < argv.length; indexRef.index++) {
    const arg = argv[indexRef.index];

    if (endOfOptions) {
      positionals.push(arg);
      continue;
    }

    if (arg === "--") {
      endOfOptions = true;
      continue;
    }

    if (arg.startsWith("--")) {
      parseLongOption(arg, args, argv, indexRef);
    } else if (arg.startsWith("-") && arg.length > 1 && !isNegativeNumber(arg)) {
      parseShortOption(arg, args, argv, indexRef);
    } else {
      positionals.push(arg);
    }
  }

  return {
    args,
    subcommand: positionals[0],
    positionals,
  };
}
