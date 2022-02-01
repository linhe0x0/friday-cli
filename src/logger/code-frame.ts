import { readFileSync } from 'fs'
import _ from 'lodash'

import { codeFrameColumns } from '@babel/code-frame'

import { relative } from '../utilities/fs'
// eslint-disable-next-line import/no-useless-path-segments
import logger, { blankLine, divider } from './'
import { danger, text } from './colorful'

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
    if (err instanceof Error) {
      logger.warn(`Cannot read file ${filename}: ${err.message}`)
    } else {
      logger.warn(`Cannot read file ${filename}`)
    }
  }

  if (!content) {
    return `${danger('>')} ${text('1 |')}\n    ${text('|')} ${danger(
      `^ ${message}`
    )}`
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
