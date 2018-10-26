const apn = require('apn')
const path = require('path')
const rootPath = path.resolve(__dirname, '../../')
const config = require(path.resolve(rootPath, 'config'))
const {bundleId} = config

class Push {
  static _pushIOS ({alert, badge, deviceTokenAry, isProduction}) {
    return new Promise((resolve, reject) => {
      const options = {
        token: {
          key: path.resolve(rootPath, 'certificate/serviceKey.p8'),
          keyId: 'XA79Y94CD8',
          teamId: '355R83R4YL'
        },
        production: isProduction
      }

      const apnProvider = new apn.Provider(options)
      let notification = new apn.Notification()
      notification.alert = alert
      notification.sound = 'ping.aiff'
      notification.badge = badge
      notification.topic = bundleId
      apnProvider.send(notification, deviceTokenAry).then((response) => {
        if (response.failed.length !== 0) {
          for (let ele of response.failed) {
            // TODO: 有可能是开发模式
            console.log(ele.response)
          }
          reject(new Error('send failed'))
        } else {
          resolve(response)
        }
      })
    })
  }
  /**
   * IOS推送通知
   * @param {string} content 发送内容
   * @param {array} deviceTokenAry 需要发送的设备id数组
   * @return {undefined}
   */
  static async pushIOS (content, deviceTokenAry) {
    try {
      await Push._pushIOS({alert: content, deviceTokenAry, badge: 1, isProduction: true})
    } catch (error) {
      Push._pushIOS({alert: content, deviceTokenAry, badge: 1, isProduction: false})
    }
  }
}
module.exports = Push