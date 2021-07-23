export function getEntryFile(): string {
  const { entry } = require('@sqrtthree/friday/dist/utilities/entry')

  return entry
}
