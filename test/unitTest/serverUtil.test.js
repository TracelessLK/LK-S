const WebSocket = require('ws');
const uuid = require('uuid')

function _req(action, content, option) {
    const {userId,deviceId} = option
    console.log('option:',{option})
    let msg = {
        header: {
            version: "1.0",
            id: uuid(),
            action,
            uid:userId,
            did:deviceId,

            //target:_target
            // targets:_targets,
            time: Date.now(),
            timeout: null
        },
        body: {
            // content:_content
            // chatId:chatId,
            // relativeMsgId:relativeMsgId,
            // order:order
        }
    }
    msg.body.content = content
    console.log({msg})
    console.log(msg.body.content)
    return msg
}
const ws = new WebSocket('ws://172.18.1.198:3001')

let userId = '61e1241a-f8d5-4942-9801-9fbfc7e6e78e'
let deviceId = '9ca10f5a-8873-4eab-af38-c929b9eff818'
let orgMCode = '023a9b2c2b2c43647aa76bc58294ba71'
let memberMCode = '0b9055e73271219d5dee9bfd8ef3442d'

class serverUtil{
    static ping(){
        return new Promise((resolve, reject) => {
            let content = {orgMCode, memberMCode}
            let option = {userId,deviceId}
            let msg = _req("ping", content,option)
            // ws.onopen = function(e) {
            //     console.log("Connection open...");
            //     ws.send(JSON.stringify(msg))
            // }
            ws.onopen = (e) => {
                console.log("Connection open...")
                ws.send(JSON.stringify(msg))
                ws.onmessage = function(e) {
                    if(e.data !== 'undefined'){
                        // console.log("String message received", e, e.data)
                        resolve(e)
                    }else{
                        reject(e)
                    }
                }
            }
            ws.onerror = (e) => {
                reject(e)
            }
        })
    }

    static util(action){
        return new Promise((resolve, reject) => {
            let content = {}
            let option = {userId,deviceId}
            let msg = _req(action, content,option)
            ws.onopen = (e) => {
                ws.send(JSON.stringify(msg))
                ws.onmessage = function(e) {
                    if(e.data !== 'undefined'){
                        resolve(e)
                    }else{
                        reject(e)
                    }
                }
            }
            ws.onerror = (e) => {
                reject(e)
            }
        })
    }
}

module.exports = serverUtil