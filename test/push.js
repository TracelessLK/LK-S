const push = require('../api/push')
const config = require('../config')

let uuid = '515fa5421f4bf889e05d1b8ddf780f164df3474d1a8b4e12e293acc3ddd13207'
const zcy = 'b73bf19d52bef8ad5af0d307eb8c4204f156f97f34e435bd4c6587fa85313929'
const zcy2 = '0eff8b634faa408a1d4a83446d2a315035d41e60c7f62befd75d4757b7e4d53f'
// uuid = '32b713f56b56db6b5aa8524b67aed8da2bd2058e8ee66f31963a15dcb9a5419e'
const option = {
  alert: 'this is a notification test', badge: 2, deviceTokenAry: [zcy2], isProduction: true,
  token: config.push.LK_M
}
const sth = push._pushIOS(option)
sth.then(() => {
  console.log('Push successfully!')
  process.exit(0)
})
