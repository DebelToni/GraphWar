const FUNCTIONS = {
  sqrt: Math.sqrt,
  log: Math.log10,
  abs: Math.abs,
  sin: Math.sin,
  sen: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  tg: Math.tan,
  ln: Math.log,
  exp: Math.exp
};

export function compileExpression(source) {
  const parser = new ExpressionParser(source.replaceAll(",", "."));
  const fn = parser.parse();
  return (x, y, dy) => fn({ x, y, dy });
}

class ExpressionParser {
  constructor(source) {
    this.tokens = tokenize(source);
    this.index = 0;
  }

  parse() {
    if (!this.tokens.length) throw new Error("empty expression");
    const expr = this.parseAdditive();
    if (this.peek()) throw new Error(`unexpected '${this.peek().value}'`);
    return expr;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.match("+") || this.match("-")) {
      const operator = this.previous().value;
      const right = this.parseMultiplicative();
      const oldLeft = left;
      left = operator === "+" ? (env) => oldLeft(env) + right(env) : (env) => oldLeft(env) - right(env);
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parsePower();
    while (true) {
      if (this.match("*") || this.match("/")) {
        const operator = this.previous().value;
        const right = this.parsePower();
        const oldLeft = left;
        left = operator === "*" ? (env) => oldLeft(env) * right(env) : (env) => oldLeft(env) / right(env);
      } else if (startsPrimary(this.peek())) {
        const right = this.parsePower();
        const oldLeft = left;
        left = (env) => oldLeft(env) * right(env);
      } else {
        break;
      }
    }
    return left;
  }

  parsePower() {
    let left = this.parseUnary();
    if (this.match("^")) {
      const right = this.parsePower();
      const oldLeft = left;
      left = (env) => Math.pow(oldLeft(env), right(env));
    }
    return left;
  }

  parseUnary() {
    if (this.match("+")) return this.parseUnary();
    if (this.match("-")) {
      const value = this.parseUnary();
      return (env) => -value(env);
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.advance();
    if (!token) throw new Error("unexpected end");

    if (token.type === "number") return () => token.value;

    if (token.value === "(") {
      const expr = this.parseAdditive();
      if (!this.match(")")) throw new Error("missing ')'");
      return expr;
    }

    if (token.type === "id") {
      const name = token.value;
      if (name === "x") return (env) => env.x;
      if (name === "y") return (env) => env.y;
      if (name === "dy" || name === "yp" || name === "y'") return (env) => env.dy;
      if (name === "pi") return () => Math.PI;
      if (name === "e") return () => Math.E;
      if (FUNCTIONS[name]) {
        let arg;
        if (this.match("(")) {
          arg = this.parseAdditive();
          if (!this.match(")")) throw new Error("missing ')'");
        } else {
          arg = this.parseUnary();
        }
        return (env) => FUNCTIONS[name](arg(env));
      }
    }

    throw new Error(`unknown token '${token.value}'`);
  }

  match(value) {
    if (this.peek()?.value !== value) return false;
    this.index += 1;
    return true;
  }

  advance() {
    const token = this.peek();
    if (token) this.index += 1;
    return token;
  }

  previous() {
    return this.tokens[this.index - 1];
  }

  peek() {
    return this.tokens[this.index];
  }
}

function tokenize(source) {
  const tokens = [];
  const names = ["sqrt", "log", "abs", "sin", "sen", "cos", "tan", "tg", "ln", "exp", "dy", "yp", "pi", "x", "y", "e"];
  let i = 0;

  while (i < source.length) {
    const char = source[i];
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    if (char === "y" && source[i + 1] === "'") {
      tokens.push({ type: "id", value: "y'" });
      i += 2;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      const match = source.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
      if (!match) throw new Error(`bad number near '${source.slice(i)}'`);
      tokens.push({ type: "number", value: Number(match[0]) });
      i += match[0].length;
      continue;
    }
    if ("+-*/^()".includes(char)) {
      tokens.push({ type: "op", value: char });
      i += 1;
      continue;
    }

    const lower = source.slice(i).toLowerCase();
    const name = names.find((candidate) => lower.startsWith(candidate));
    if (name) {
      tokens.push({ type: "id", value: name });
      i += name.length;
      continue;
    }

    throw new Error(`unsupported character '${char}'`);
  }

  return tokens;
}

function startsPrimary(token) {
  return !!token && (token.type === "number" || token.type === "id" || token.value === "(");
}
