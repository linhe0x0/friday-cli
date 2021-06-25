import chalk from 'chalk'
import { readFileSync } from 'fs'
import _ from 'lodash'

import { codeFrameColumns } from '@babel/code-frame'

import { relative } from './fs'
import logger, { blankLine, divider } from './logger'

export function outputCodeFrameColumns(
  filename: string,
  line: number,
  column: number,
  message: string
): string {
  let content = ''

  try {
    content = readFileSync(filename, 'utf8')
  } catch (err) {
    logger.warn(`Cannot read file ${filename}: ${err.message}`)
  }

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

interface OutputCodeOption {
  filename: string
  line: number
  column: number
  message: string
}

export function outputCode(results: OutputCodeOption[]): void {
  _.forEach(results, (item) => {
    let output = ''

    if (item.filename) {
      output = outputCodeFrameColumns(
        item.filename,
        item.line,
        item.column,
        item.message
      )
    } else {
      output = item.message
    }

    if (item.filename) {
      const relativeFilename = relative(item.filename)

      divider(`File: ${relativeFilename}`)
    } else {
      divider()
    }

    blankLine()
    // eslint-disable-next-line no-console
    console.log(output)
    blankLine()
  })
}
