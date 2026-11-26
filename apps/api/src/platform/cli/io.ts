import { createInterface } from 'node:readline/promises'

/** How commands talk to the operator. Tests pass answers in and read the output back. */
export type Io = {
  print(line: string): void
  error(line: string): void
  confirm(question: string): Promise<boolean>
}

// Control characters (except line breaks) and direction overrides, which could repaint the
// operator's terminal or disguise an organization name. Shown as \u{…} instead.
const UNPRINTABLE = /[\p{Cc}\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu

/** Text safe to write to a terminal: data from the database is never trusted to be printable. */
export function printable(line: string): string {
  return line.replace(UNPRINTABLE, (c) =>
    c === '\n' ? c : `\\u{${c.codePointAt(0)?.toString(16).padStart(4, '0')}}`,
  )
}

export function terminalIo(): Io {
  return {
    print: (line) => process.stdout.write(`${printable(line)}\n`),
    error: (line) => process.stderr.write(`${printable(line)}\n`),
    confirm: async (question) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      try {
        const answer = await rl.question(`${question} (y/N) `)
        return /^y(es)?$/i.test(answer.trim())
      } finally {
        rl.close()
      }
    },
  }
}

export type MemoryIo = Io & { output: string[]; errors: string[]; questions: string[] }

/** Answers each confirm with the next answer (default no). */
export function memoryIo(answers: boolean[] = []): MemoryIo {
  const output: string[] = []
  const errors: string[] = []
  const questions: string[] = []
  return {
    output,
    errors,
    questions,
    print: (line) => output.push(line),
    error: (line) => errors.push(line),
    confirm: async (question) => {
      questions.push(question)
      return answers.shift() ?? false
    },
  }
}
