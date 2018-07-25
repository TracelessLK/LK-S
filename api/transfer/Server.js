var url = require('url');
var WebSocket = require('ws');
var fs = require('fs');
var path = require('path');
const Message = require('./Message');
const Log = require('./Log');
const Transfer = require('./Transfer');

var LKServer = {
    _hbTimeout: 3 * 60 * 1000,
    seed: 1,
    //临时内部id，用于标识ws
    generateWsId: function () {
        return this.seed++;
    },
    clients: new Map(),//对应多个ws uid:{_id:ws}
    newResponseMsg: function (msgId,content) {
        return {
            header:{
                version:"1.0",
                msgId:msgId,
                response:true,
                // orgMCode:"",
                // mCode:""
            },
            body:{
                content:content
            }
        };
    },
    init: function (port) {
        LKServer.wss = new WebSocket.Server({port: port, path: "/transfer"});
        LKServer.wss.on('connection', function connection(ws, req) {
            ws.on('message', function incoming(message) {
                let msg = JSON.parse(message);
                let header = msg.header;
                let action = header.action;
                let isResponse = header.response;
                if (isResponse) {//得到接收应答，删除缓存
                    Message.receiveReport(header.msgId, header.uid, header.did);
                }
                else if (LKServer[action]) {
                    if (action == "ping" || action == "login" || action == "register" || action == "authorize" || action == "errReport") {
                        LKServer[action](msg, ws);
                        return;
                    } else if (ws._uid) {
                        var wsS = LKServer.clients.get(ws._uid);
                        if (wsS&&wsS.has(ws._id)) {
                            LKServer[action](msg, ws);
                            return;
                        }
                    }
                    //非法请求或需要重新登录的客户端请求
                    let date = new Date();
                    Log.info(action + " fore close,非法请求或需要重新登录的客户端请求:" + ws._name + "," + ws._uid + "," + ws._cid + "," + ws._id + "," + (date.getMonth() + 1) + "月" + date.getDate() + "日 " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds());
                    ws.close();
                } else {
                    var content = JSON.stringify(LKServer.newResponseMsg(msg, {err: "无法识别的请求"}));
                    ws.send(content);
                }

            });

            ws.on('close', function (msg) {
                console.info("auto close:" + ws._name + "," + ws._uid + "," + ws._cid + "," + ws._id);
                if (ws._uid) {
                    var wsS = LKServer.clients.get(ws._uid);
                    if (wsS&&wsS.has(ws._id)) {
                        wsS.delete(ws._id);
                        let date = new Date();
                        Log.info("logout:" + ws._name + "," + ws._uid + "," + ws._cid + "," + ws._id + "," + (date.getMonth() + 1) + "月" + date.getDate() + "日 " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds());
                        if (wsS.size==0) {
                            LKServer.clients.delete(ws._uid);
                        }
                    }
                }
            });
            ws.on('error', function (err) {
                console.info("ws error:" + err);
            });

        });
        LKServer.wss.on('error', function (err) {
            console.info("ws server error:" + err);
        });
        setTimeout(()=>{this._asyCheckTimeoutRetainMsgs()}, 3 * 60 * 1000);
    },
    getIP:function () {

    },
    getPort:function () {

    },
    _newMsgFromRow:function (row) {
        let msg = {
            header:{}
        };
        let header = msg.header;
        header.version = "1.0";
        header.id = row.msgId;
        header.action = row.action;
        header.senderUid = row.senderUid;
        header.senderDid = row.senderDid;
        header.senderServerIP = row.senderServerIP;
        header.senderServerPort = row.senderServerPort;
        header.targetUid = row.targetUid;
        header.targetDid = row.targetDid;
        header.targetServerIP = row.targetServerIP;
        header.targetServerPort = row.targetServerPort;
        header.random = row.random;
        header.time = row.sendTime;
        msg.body = row.body;
        return msg;
    },
    _sendLocalRetainMsgs:function (ws,rows) {
        if(rows){
            let msgs = [];
            for(let i=0;i<rows.length;i++){
                let row = rows[i];
                msgs.push(this._newMsgFromRow(row));
            }
            ws.send(JSON.stringify(msgs),function () {
                msgs.forEach(function (msg) {
                    Message.markSent(msg.header.id);
                })
            });
        }

    },
    _checkSingalWSTimeoutMsgs:function (ws,time) {
        return new Promise((resolve,reject)=>{
            if(time-ws._lastHbTime>this._hbTimeout){
                ws.close();
                resolve();
            }else{
                Message.asyPeriodGetLocalMsgByTarget(ws._uid,ws._did,time).then((results)=>{
                    this._sendLocalRetainMsgs(ws,results);
                    resolve();
                })
            }
        });

    },
     _asyCheckTimeoutRetainMsgs:async function () {
        //local members's retain msg
        let time = Date.now();
         let ps = [Message.asyPeriodGetForeignMsg(time)];
         this.clients.forEach( (wsS,uid)=>{
            wsS.forEach((ws,id)=>{
                ps.push(this._checkSingalWSTimeoutMsgs(ws,time))
            })
        })
        let results = await Promise.all(ps);
        //foreign contact's retain msg
        let foreignMsgs = results[0];
        let ps2 = [];
        if(foreignMsgs){
            foreignMsgs.forEach(function (msg) {
                ps2.push(Transfer.asyTrans(msg));
            })
        }
        await Promise.all(ps2);
        setTimeout(()=>{this._asyCheckTimeoutRetainMsgs()}, 3 * 60 * 1000);
    },
    ping:function(msg,ws){
        ws._lastHbTime = Date.now();
        let content = JSON.stringify(LKServer.newResponseMsg(msg.header.id));
        ws.send(content);
    },
}