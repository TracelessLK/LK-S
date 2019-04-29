const apn = require('apn')
const path = require('path')
const rootPath = path.resolve(__dirname, '../../')
const config = require(path.resolve(rootPath, 'config'))
const {bundleId, push, appId} = config
const debug = require('debug')('push')

class Push {
  static _pushIOS ({alert, badge, deviceTokenAry, isProduction, payload, token}) {
    return new Promise((resolve, reject) => {
      const options = {
        token,
        production: isProduction
      }

      debug({options})
      const apnProvider = new apn.Provider(options)
      let notification = new apn.Notification()
      notification.alert = alert
      notification.sound = 'ping.aiff'
      notification.badge = badge
      notification.topic = bundleId
      notification.payload = payload
      apnProvider.send(notification, deviceTokenAry).then((response) => {
        // console.log({response})
        resolve(response)

        if (response.failed.length !== 0) {
          for (let ele of response.failed) {
            // TODO: 有可能是开发模式
            // console.log(ele)
            // reject(new Error(JSON.stringify(ele)))
          }
        } else {
        }
      })
    })
  }
  /**
   * IOS推送通知
   * @param {string} content 发送内容
   * @param {array} deviceTokenAry 需要发送的设备id数组
   * @param {object} payload 发送的补充信息
   * @return {undefined}
   */
  static async pushIOS (content, deviceTokenAry, payload = {}) {
    // fixme: push conditionally
    const token = push[appId]
    await Push._pushIOS({alert: content, deviceTokenAry, badge: 1, isProduction: true, payload, token})
    await Push._pushIOS({alert: content, deviceTokenAry, badge: 1, isProduction: false, payload, token})
  }
}
module.exports = Push
