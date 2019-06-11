const serverUtil = require('./unitTest/serverUtil.test')
let userId = '61e1241a-f8d5-4942-9801-9fbfc7e6e78e'
let deviceId = '9ca10f5a-8873-4eab-af38-c929b9eff818'
let orgMCode = '023a9b2c2b2c43647aa76bc58294ba71'
let memberMCode = '0b9055e73271219d5dee9bfd8ef3442d'

const ping = serverUtil.ping(userId,deviceId,orgMCode,memberMCode)
ping.then( ()=> {
    console.log("ping successfully!")
})