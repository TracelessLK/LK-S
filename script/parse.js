const fs = require('fs')
const path = require('path')
const moment = require('moment')

const initTxtPath = path.resolve(__dirname, '../local/init.txt')
const initTxtFormattedPath = path.resolve(__dirname, '../local/initFormatted.json')

const content = fs.readFileSync(initTxtPath).toString()

const ary = content.split('\n')
const firstline = ary[0]
const ary2 = firstline.split(',')
const firstOne = ary2[0].trim()
const secondOne = ary2[1].trim()

const contentAry = []

for (let i = 1; i < ary.length; i++) {
  const ele = ary[i]
  if (ele) {
    const ary3 = ele.split(',')
    // const ary4 = ary3[1].trim().split('-')

    const time = moment(ary3[1].trim(), 'YYYY-MM-DD-HH-mm-ss').toDate().getTime()
    // time.setDate(2019)
    // time.setMonth(parseInt(ary4[1]) - 1)
    // time.setDate(ary4[2])
    // time.setMinutes(ary4[3])
    // time.setSeconds(ary4[4])
    // time.setMilliseconds(ary4[5])

    const obj = {
      sender: ary3[0].trim() === '1' ? firstOne : secondOne,
      time,
      content: ary3.slice(2).join(',')
    }
    contentAry.push(obj)
  }
}

console.log(contentAry)
console.log(contentAry.length)

fs.writeFileSync(initTxtFormattedPath, JSON.stringify(contentAry, null, 2))
