const express = require('express')
const router = express.Router()
let password = 'hfs'
let shutdown = false
const push = require('../push')
const os = require('os-utils')
let count = 0
const childProcess = require('child_process')
const admin = 'zcy'
const Pool = require('../store/pool')

setCpuMonitor()

router.get('/send', async (req, res) => {
  const {name, code, msg, badge = 1, isProduction = true, payload = {}} = req.query
  let result
  if (code === password || shutdown) {
    const nameStr = name.trim()
    if (nameStr) {
      try {
        await sendMsgByName({nameStr, msg, badge, isProduction, payload})
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
  const {nameStr, msg, badge, isProduction, payload} = option
  const did = await getDeviceIdByName(nameStr)
  const param = {alert: msg, badge, deviceTokenAry: [did], isProduction, payload}
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
                where memberId=?
       `
        Pool.query(sql, [id], (errorInner, resultsInner) => {
          const device = resultsInner[0]
          if (errorInner) {
            reject(errorInner)
          } else if (device) {
            const {venderDid} = device
            resolve(venderDid)
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
sendMsgByName(admin, `LK2 server重启了`)
function setCpuMonitor () {
  const f = () => {
    os.cpuUsage(function (v) {
      if (v > 0.8) {
        if (count > 10) {
          sendMsgByName(admin, `cpu超标了${v}`).then(() => {
            try {
              kill()
            } catch (error) {
              sendMsgByName(admin, `kill失败${error}`)
            }
          })
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
  const result = childProcess.execSync('lsof -i :3001').toString().trim()
  const ary = result.split('node')[1].split(' ')
  const pid = ary.find(ele => {
    return Boolean(ele)
  })

  childProcess.execSync(`kill ${pid}`)
}

module.exports = router