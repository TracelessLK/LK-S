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
class serverUtil{
    static ping(userId,deviceId,orgMCode,memberMCode){
        return new Promise((resolve, reject) => {
            let content = {orgMCode, memberMCode}
            let option = {userId,deviceId}
            let msg = _req("ping", content,option)
            ws.onopen = function(e) {
                console.log("Connection open...");
                ws.send(JSON.stringify(msg))
            }
        })
    }
}

module.exports = serverUtil