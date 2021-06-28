import chalk from 'chalk'

export function text(value: string): string {
  return chalk.gray(value)
}

export function tips(value: string): string {
  return chalk.cyan(value)
}

export function info(value: string): string {
  return chalk.blue(value)
}

export function success(value: string): string {
  return chalk.green(value)
}

export function warn(value: string): string {
  return chalk.yellow(value)
}

export function danger(value: string): string {
  return chalk.red.bold(value)
}

export function error(value: string): string {
  return chalk.red(value)
}

export function strong(value: string): string {
  return chalk.bold(value)
}

export function link(value: string): string {
  return chalk.underline(value)
}
