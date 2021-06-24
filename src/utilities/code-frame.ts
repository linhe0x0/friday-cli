import chalk from 'chalk'
import { readFileSync } from 'fs'

import { codeFrameColumns } from '@babel/code-frame'

export function outputCodeFrameColumns(
  filename: string,
  line: number,
  column: number,
  message: string
): string {
  const content = readFileSync(filename, 'utf8')

  if (!content) {
    return `${chalk.red.bold('>')} ${chalk.gray('1 |')}\n    ${chalk.gray(
      '|'
    )} ${chalk.red.bold(`^ ${message}`)}`
  }

  const result = codeFrameColumns(
    content,
    {
      start: {
        line,
        column,
      },
    },
    {
      highlightCode: true,
      message,
    }
  )

  return result
}
