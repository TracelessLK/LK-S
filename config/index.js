/* eslint-disable global-require */
const _ = require('lodash')
const txServerIp = '192.144.200.234'
const fs = require('fs')
const path = require('path')
const debug = require('debug')('configIndex')
const debugLevel = require('../constant/debugLevel')
const rootDir = path.resolve(__dirname, '../')

const config = {
  admin: 'zcy',
  db: {
    database: 'LK_S',
    dialect: 'mysql',
    username: 'root',
    password: '',
    metaDatabase: 'LK_S_META'
  },
  superDefaultPassword: '1b3231655cebb7a1f783eddf27d254ca',
  encrypt: {
    publicKeyFormat: 'pkcs8-public-der',
    privateKeyFormat: 'pkcs1-der',
    signatureFormat: 'hex',
    sourceFormat: 'utf8',
    aesKey: [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 ],
    counter: 5
  },
  txServerIp,
  ip: txServerIp,
  port: 3000,
  wsPort: 3001,
  repo: 'https://github.com/tracelessman/LK-S.git',
  branch: 'master',
  http: true,
  sshInfo: {
    username: 'root'
  },
  msgTimeout: 10 * 1000,
  isDebugging: false,
  bundleId: 'com.hfs.LK-M',
  appId: 'LK_M',
  appName: 'LK',
  serverRoot: '/opt/testing/LK-S',
  updateJsonPath: 'static/public/updateMeta.json',
  pushTimeInterval: 1000,
  debugLevel: debugLevel.verbose,
  push: {
    LK_M: {
      keyId: 'XA79Y94CD8',
      teamId: '355R83R4YL',
      key: path.resolve(rootDir, 'certificate/serviceKey_LK_M.p8')
    },
    traceless: {
      keyId: 'P5T562567F',
      teamId: '355R83R4YL',
      key: path.resolve(rootDir, 'certificate/serviceKey_traceless.p8')
    }
  },
  serverHostAry: ['62.234.46.12', '192.144.200.234']
}
config.manifestUrl = 'itms-services://?action=download-manifest&url=https://raw.githubusercontent.com/tracelessman/LK-M/master/ios/manifest.plist'

debug({isOther: process.env.isOther})
if (process.env.isOther) {
  config.db.database = 'LK_S_other'
  config.db.metaDatabase = 'LK_S_META_other'
  config.port = 4000
  config.wsPort = 4001
}

let protocol
if (config.http) {
  protocol = 'http'
} else {
  protocol = 'https'
}

const unversionedPath = path.resolve(__dirname, 'unversioned.js')
if (fs.existsSync(unversionedPath)) {
  _.merge(config, require(unversionedPath))
}
config.url = `${protocol}://${config.ip}:${config.port}`
config.txServerUrl = `${protocol}://${config.txServerIp}:${config.port}`

debug({ip: config.ip, url: config.url})
Object.freeze(config)

module.exports = config
