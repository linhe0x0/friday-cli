export function getEntryFile(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require
  const { entry } = require('@sqrtthree/friday/dist/utilities/entry')

  return entry
}
