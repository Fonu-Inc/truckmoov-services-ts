import { LoggerService } from "@nestjs/common";

const RESERVED_KEYS = new Set(["time", "level", "service", "msg", "context", "stack"]);

export class JsonLogger implements LoggerService {
  constructor(private readonly service: string) {}

  log(message: unknown, ...params: unknown[]) {
    this.write("info", message, params);
  }

  warn(message: unknown, ...params: unknown[]) {
    this.write("warn", message, params);
  }

  error(message: unknown, ...params: unknown[]) {
    this.write("error", message, params);
  }

  debug(message: unknown, ...params: unknown[]) {
    this.write("debug", message, params);
  }

  verbose(message: unknown, ...params: unknown[]) {
    this.write("debug", message, params);
  }

  fatal(message: unknown, ...params: unknown[]) {
    this.write("fatal", message, params);
  }

  private write(level: string, message: unknown, params: unknown[]) {
    const entry: Record<string, unknown> = {
      time: new Date().toISOString(),
      level,
      service: this.service,
      msg: message instanceof Error ? message.message : message,
    };
    if (message instanceof Error) {
      entry.stack = message.stack;
    }

    const rest = [...params];
    // Nest appends the logger context as the last string param
    if (rest.length && typeof rest[rest.length - 1] === "string") {
      entry.context = rest.pop();
    }
    for (const param of rest) {
      if (param instanceof Error) {
        entry.stack = param.stack;
      } else if (typeof param === "string") {
        // Nest error(message, stack, context) passes the stack as a string
        entry.stack = entry.stack ?? param;
      } else if (param && typeof param === "object") {
        for (const [key, value] of Object.entries(param)) {
          if (!RESERVED_KEYS.has(key)) entry[key] = value;
        }
      }
    }

    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }
}
