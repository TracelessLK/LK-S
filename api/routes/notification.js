const express = require('express')
const router = express.Router()
let password = 'hfs'
let shutdown = false
const push = require('../push')
const os = require('os-utils')
let count = 0
const childProcess = require('child_process')
const path = require('path')
const rootDir = path.resolve(__dirname, '../../')
const config = require(path.resolve(rootDir, 'config'))
const Pool = require('../store/pool')
const debug = require('debug')('debug')

setCpuMonitor()
// eg. http://62.234.46.12:3000/api/notification/send?name=zcy&msg=test&code=
// eg. http://104.233.169.160:3000/api/notification/send?name=zcy&msg=test&code=
router.get('/send', async (req, res) => {
  let {name, code, msg, badge = 1, isProduction = true, payload} = req.query
 isProduction = isProduction !== '0'
  if (payload) {
    payload = JSON.parse(payload)
  }
  debug({payload})
  let result
  if (code === password || shutdown) {
    const nameStr = name.trim()
    if (nameStr) {
      try {
        const option = {nameStr, msg, badge, isProduction, payload}
        debug({option})
        await sendMsgByName(option)
        result = '消息已发送'
      } catch (err) {
        result = err.toString()
      }
    } else {
      result = '非法请求'
    }
  } else {
    result = '非法请求'
  }
  res.set({ 'content-type': 'application/json; charset=utf-8' })

  res.end(JSON.stringify(result))
})

router.get('/setup', function (req, res) {
  const {code, newCode, shutdown: shutdownSetting} = req.query
  let result = {}

  if (code === password) {
    result = {
      code: password
    }
    if (newCode) {
      password = newCode
      result.codeNew = password
    }
    if (shutdownSetting) {
      shutdown = true
    }
    result = JSON.stringify(result)
  } else {
    result = '非法请求'
  }

  res.end(result)
})

async function sendMsgByName (option) {
  let {nameStr, msg, badge, isProduction, payload} = option
  const didAry = await getDeviceIdByName(nameStr)
  const param = {alert: msg, badge, deviceTokenAry: didAry, payload, isProduction}
  debug({param})

  await push._pushIOS(param)
}
function getDeviceIdByName (name) {
  return new Promise((resolve, reject) => {
    let sql = `
                select * from member
                where name=?
            `
    Pool.query(sql, [name], (error, results) => {
      const member = results[0]
      if (error) {
        reject(error)
      } else if (member) {
        const {id} = member
        sql = `
       select * from device
                where memberId=? and venderDid <> ""
       `
        Pool.query(sql, [id], (errorInner, resultsInner) => {
          if (errorInner) {
            reject(errorInner)
          } else if (resultsInner.length) {
            const result = resultsInner.reduce((c, v) => {
              c.push(v.venderDid)
              return c
            }, [])

            resolve(result)
          } else {
            reject(new Error(`${name}没有iphone设备`))
          }
        })
      } else {
        reject(new Error(`${name} 没有记录`))
      }
    })
  })
}
if (process.env.NODE_ENV === 'production') {
  // sendMsgByName({nameStr: admin, msg: `LK2 server web重启了`, isProduction: true})
}
function setCpuMonitor () {
  const f = () => {
    os.cpuUsage(function (v) {
      if (v > 0.8) {
        if (count > 10) {
          // sendMsgByName({nameStr: admin, msg: `cpu超标了${v}`}).then(() => {
          //   try {
          //     kill()
          //   } catch (error) {
          //     sendMsgByName({nameStr: admin, msg: `kill失败${error}`})
          //   }
          // })
          setTimeout(f, 1000 * 30)
        } else {
          count++
          setTimeout(f, 1000 * 1)
        }
      } else {
        setTimeout(f, 1000 * 10)
      }
    })
  }

  f()
}

function kill () {
  let output
  try {
    output = childProcess.execSync('lsof -i :3001').toString().trim()
  } catch (err) {

  }
  if (output) {
    const ary = output.split('node')[1].split(' ')
    const pid = ary.find(ele => {
      return Boolean(ele)
    })

    childProcess.execSync(`kill ${pid}`)
  }
}

module.exports = router
