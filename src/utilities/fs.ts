import { accessSync, constants, createReadStream, createWriteStream } from 'fs'
import { access, mkdir } from 'fs/promises'
import path from 'path'
import rimraf from 'rimraf'

export function exists(target: string): Promise<boolean> {
  return access(target, constants.W_OK)
    .then(() => {
      return true
    })
    .catch(() => {
      return false
    })
}

export function existsSync(target: string): boolean {
  try {
    accessSync(target, constants.W_OK)
    return true
  } catch (err) {
    return false
  }
}

export function mkdirIfNotExists(dir: string): Promise<string> {
  return exists(dir)
    .then((result) => {
      if (result) {
        return null
      }

      return mkdir(dir, {
        recursive: true,
      })
    })
    .then(() => dir)
}

export function copyFile(from: string, to: string): Promise<string> {
  const dir = path.dirname(to)

  return mkdirIfNotExists(dir).then(() => {
    return new Promise((resolve, reject) => {
      const reader = createReadStream(from)
      const writer = createWriteStream(to)

      reader.on('error', (err) => {
        reject(err)
      })

      reader.on('end', () => {
        resolve(to)
      })

      reader.pipe(writer)
    })
  })
}

export function removeFiles(target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    rimraf(target, (err: Error) => {
      if (err) {
        reject(err)
        return
      }

      resolve()
    })
  })
}

export function isTsFile(filepath: string): boolean {
  const ext = path.extname(filepath)

  return ext === '.ts'
}

export function relative(filepath: string, base?: string): string {
  const b = base || process.cwd()

  return path.relative(b, filepath)
}

export function getMirrorFile(
  filepath: string,
  base: string,
  output: string,
  ext?: string
): string {
  const file = relative(filepath, base)
  const { dir, name, ext: originalExt } = path.parse(file)
  const extension = ext || originalExt
  const filename = `${name}${extension}`

  const result = path.join(output, dir, filename)

  return result
}
