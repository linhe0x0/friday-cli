import chalk from 'chalk'
import consola, { LogLevel } from 'consola'
import _ from 'lodash'

const isVerbose = _.includes(process.argv, '--verbose')

const logger = consola.create({
  level: isVerbose ? LogLevel.Verbose : LogLevel.Info,
})

export default logger

export function blankLine(): void {
  // eslint-disable-next-line no-console
  console.log('')
}

export function list(data: string[], padding = 2): void {
  const padString = _.repeat(' ', padding)

  _.forEach(data, (item) => {
    // eslint-disable-next-line no-console
    console.log(`${padString} - ${item}`)
  })
}

export function divider(title?: string): void {
  const len = (process.stdout.columns || 80) - (title ? title.length + 1 : 0)
  const heading = title ? `${title} ` : ''
  const dash = chalk.grey(`${_.repeat('-', len)}`)

  // eslint-disable-next-line no-console
  console.log(`${heading}${dash}`)
}
