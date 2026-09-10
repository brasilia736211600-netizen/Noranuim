import { type ConfigPlugin, withDangerousMod } from '@expo/config-plugins'
import fs from 'node:fs'
import path from 'node:path'

const RULE = '-dontwarn javax.xml.stream.XMLResolver'

const withR8OptionalClasses: ConfigPlugin = (config) =>
  withDangerousMod(config, [
    'android',
    (config) => {
      const filePath = path.join(config.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro')
      const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
      if (!existing.split(/\r?\n/).includes(RULE)) {
        const prefix = existing.length && !existing.endsWith('\n') ? '\n' : ''
        fs.writeFileSync(filePath, `${existing}${prefix}${RULE}\n`, 'utf8')
      }
      return config
    },
  ])

export default withR8OptionalClasses
