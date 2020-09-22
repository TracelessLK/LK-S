const WebSocket = require('ws');
const path = require('path');
const fse = require('fs-extra')
const UUID = require('uuid/v4')
const _ = require('lodash')
const {ErrorUtil} = require('@ys/collection')
const EventEmitter = require('events')

// fixme: supress MaxListenersExceededWarning workaround
EventEmitter.defaultMaxListeners = 1000


const debugLevel = require('../../constant/debugLevel')
const config = require('../../config')
const Message = require('./Message');
const Log = require('./Log');
const Transfer = require('./Transfer');
const MCodeManager = require('./MCodeManager');
const DeviceManager = require('./DeviceManager');
const Member = require('./Member');
const Device = require('./Device');
const Friend = require('./Friend');
const Group = require('./Group');
const Org = require('./Org');
const rootPath = path.resolve(__dirname,'../../')
const rootDir = rootPath
const {isDebugging} = config
const {ormServicePromise} = require(path.resolve(rootPath,'api/store/ormService'))
const TransferFlowCursor = require('./TransferFlowCursor');
const {exitOnUnexpected} = ErrorUtil
const Push = require('../push')
const UploadSchedular = require("./upload/Schedular")
const Ticket = require("./Ticket")
const CryptoUtil = require('../util/CryptoUtil')

function  wsSend (ws, content, callback) {
  //log
  const objs = _.cloneDeep(JSON.parse(content))
    function print(obj) {
        if (obj && obj.header) {
            if (!obj.header.response) {
                if(obj.body) {
                    if (obj.body.content ){
                        let contentObj
                        try {
                            // log(typeof obj.body.content, debugLevel.verbose)
                            // log(JSON.stringify(obj, null, 2), debugLevel.verbose)
                            contentObj = JSON.parse(obj.body.content)
                            if (contentObj.type != 0) {
                                contentObj.data = Boolean(contentObj.data)
                            }
                            obj.body.content = contentObj
                        }catch(err) {
                            // log(typeof obj.body.content, debugLevel.verbose)
                            // log(JSON.stringify(obj.body.content, null, 2), debugLevel.verbose)
                        }
                    }
                }
                log(JSON.stringify(obj, null, 2), debugLevel.info)
            }
        }
    }
    if(objs&&objs.forEach){
        log("start send multi", debugLevel.info)
      objs.forEach(function (obj) {
          print(obj)
      })
        log("end send multi", debugLevel.info)
    }else{
        print(objs)
    }

  //
  ws.send(content, err => {
    if (err) {
        if(ws.readyState!==WebSocket.OPEN&&ws.readyState!==WebSocket.CONNECTING){
            ws.close();
        }
    }
    if (callback) {
      callback(err)
    }
  })
}

function log (msg, level) {
  if (level <= config.debugLevel) {
    const folderName = _.findKey(debugLevel, val => {
      return val === level
    })
    const d = new Date()
    const absolutePath = path.resolve(rootDir, 'log', folderName, `${d.toLocaleDateString()}.log`)
    fse.ensureFileSync(absolutePath)
    fse.appendFileSync(absolutePath, `${d.toLocaleTimeString()}:\n    ${msg}\n\n`)
  }
}

let LKServer = {
    _hbTimeout: 3 * 60 * 1000,
    _flowSeqSeed:Date.now(),
    _wsIdSeed: 1,
    generateWsId: function () {
        return this._wsIdSeed++;
    },
    generateFlowId:function () {
      return (this._flowSeqSeed++);
    },
    clients: new Map(),//ws uid:{_did:ws}

    //the receiving end,flow pool
    _transferFlowPool : new Map(),
    _transferWS:new Map(),
    _putTransferFlowPool:function(serverIP,serverPort,preFlowId,msg,ws){
        this._transferWS.set(serverIP+serverPort,ws);
        let ary = this._transferFlowPool.get(serverIP+serverPort+preFlowId);
        if(!ary){
            ary = [];
            this._transferFlowPool.set(serverIP+serverPort+preFlowId,ary);
        }
        ary.push(msg);
    },

    _resolveTransferFlowPool:function(serverIP,serverPort,lastFlowId){
        let ary = this._transferFlowPool.get(serverIP+serverPort+lastFlowId);
        if(ary){
            ary.forEach((msg)=>{
                let action = msg.header.action;
                if(this[action]){
                    this[action](msg, this._transferWS.get(serverIP+serverPort));
                }
            });
        }
    },

    newResponseMsg: function (msgId,content,flowId,serverIP,serverPort,flowType) {
        if(serverIP&&serverPort&&flowType){
            //notify the pool a flow from the transfer has been finished,so next flow from the transfer can be dealt
            TransferFlowCursor.setLastFlowId(serverIP,serverPort,flowType,flowId).then(()=>{
                this._resolveTransferFlowPool(serverIP,serverPort,flowId);
            });
        }
        let res= {
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
        if(flowId){
            res.header.flowId = flowId;
        }
        return res;
    },

    _checkValid:function (ws,action) {
        let isValid = false;
        if (ws._uid) {
            var wsS = LKServer.clients.get(ws._uid);
            if (wsS&&wsS.has(ws._did)) {
                isValid = true;
            }
        }else if (action == "ping" || action == "login" || action == "register" || action === 'updateRegister') {
            isValid = true;
        }
        //非法请求或需要重新登录的客户端请求
        if(!isValid){
            let date = new Date();
            Log.info(action+" fore close invalid ws:" + ws._uid + "," + ws._did + "," + (date.getMonth() + 1) + "月" + date.getDate() + "日 " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds());
            ws.close();
        }else{
            if(ws.readyState!==WebSocket.OPEN&&ws.readyState!==WebSocket.CONNECTING){
                let date = new Date();
                Log.info(action+ " fore close bad state ws:" + ws._uid + "," + ws._did + "," + (date.getMonth() + 1) + "月" + date.getDate() + "日 " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds());
                ws.close();
                isValid=false;
            }
        }
        return isValid;
        //return true

    },
    init: function (port) {
        LKServer.wss = new WebSocket.Server({port: port});
        LKServer.wss.on('connection', function connection(ws) {
            ws.on('message', function incoming(message) {
                try{
                    let msg = JSON.parse(message);
                    let header = msg.header;
                    let action = header.action;

                  //log
                  //console.log('msg:', {msg})
                  //console.log('msg.body.content:', msg.body.content)
                  if (action === 'sendMsg') {
                    const obj = _.cloneDeep(msg)
                    if(obj.body) {
                      if (obj.body.content ){
                        const contentObj = JSON.parse(obj.body.content)

                        if (contentObj.type === 1) {
                          contentObj.data = Boolean(contentObj.data)
                        }
                        obj.body.content = contentObj
                      }
                    }


                    log(JSON.stringify(obj, null, 2), debugLevel.debug)
                  }

                  //log

                    let isValid = LKServer._checkValid(ws,action);
                  //console.log('action',action)
                  //console.log('isValid:',isValid)
                    if(isValid){
                        let isResponse = header.response;
                        let isExist = LKServer._allAction(action,true)
                        //console.log('isExist:',isExist)
                        if (isResponse) {
                            Message.receiveReport(header.flowId);
                        }
                        else if (isExist) {
                            // console.log('LKServer[action]:',LKServer[action])
                            if(header.preFlowId){//from another server
                                TransferFlowCursor.getLastFlowId(header.serverIP,header.serverPort,header.flowType).then((lastFlowId)=>{
                                    if(lastFlowId){
                                        if(header.preFlowId===lastFlowId){
                                            // LKServer[action](msg, ws);
                                            LKServer._allAction(action,false,msg, ws)
                                        }else{
                                            this._putTransferFlowPool(header.serverIP,header.serverPort,header.preFlowId,msg,ws);
                                        }
                                    }else{
                                        // LKServer[action](msg, ws);
                                        LKServer._allAction(action,false,msg, ws)
                                    }
                                });
                            }else{
                                // LKServer[action](msg, ws);
                                LKServer._allAction(action,false,msg, ws)
                            }

                        } else {
                            let content = JSON.stringify(LKServer.newResponseMsg(header.msgId, {err: "invalid request"}));
                            wsSend(ws, content)
                        }
                    }
                }catch(e){
                    console.info("handle message err:"+e);
                }
            });

            ws.on('close', function () {
                if (ws._uid) {
                    let wsS = LKServer.clients.get(ws._uid);
                    if (wsS&&wsS.has(ws._did)) {
                        wsS.delete(ws._did);
                        let date = new Date();
                        if (wsS.size===0) {
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
       this._asyCheckTimeoutRetainMsgs();
       this._clearTimeoutMsgs();
    },

    _allAction:function (action,local,msg, ws){
        let existFlag = false
        switch (action) {
            case 'ping':
                if(local){
                    existFlag = true
                }else{
                    this.ping(msg,ws)
                }
                break
            case 'fetchMembers':
                if(local){
                    existFlag = true
                }else{
                    this.fetchMembers(msg,ws)
                }
                break
            case 'login':
                if(local){
                    existFlag = true
                }else{
                    this.login(msg,ws)
                }
                break
            case 'getAllDetainedMsg':
                if(local){
                    existFlag = true
                }else{
                    this.getAllDetainedMsg(msg,ws)
                }
                break
            case 'register':
                if(local){
                    existFlag = true
                }else{
                    this.register(msg,ws)
                }
                break
            case 'unRegister':
                if(local){
                    existFlag = true
                }else{
                    this.unRegister(msg,ws)
                }
                break
            case 'applyUploadChannel':
                if(local){
                    existFlag = true
                }else{
                    this.applyUploadChannel(msg,ws)
                }
                break
            case 'sendMsg':
                if(local){
                    existFlag = true
                }else{
                    this.sendMsg(msg,ws)
                }
                break
            case 'sendMsg2':
                if(local){
                    existFlag = true
                }else{
                    this.sendMsg2(msg,ws)
                }
                break
            case 'readReport':
                if(local){
                    existFlag = true
                }else{
                    this.readReport(msg,ws)
                }
                break
            case 'applyMF':
                if(local){
                    existFlag = true
                }else{
                    this.acceptMF(msg,ws)
                }
                break
            case 'addGroupChat':
                if(local){
                    existFlag = true
                }else{
                    this.addGroupChat(msg,ws)
                }
                break
            case 'addGroupMembers':
                if(local){
                    existFlag = true
                }else{
                    this.addGroupMembers(msg,ws)
                }
                break
            case 'setGroupName':
                if(local){
                    existFlag = true
                }else{
                    this.setGroupName(msg,ws)
                }
                break
            case 'leaveGroup':
                if(local){
                    existFlag = true
                }else{
                    this.leaveGroup(msg,ws)
                }
                break
            case 'setUserName':
                if(local){
                    existFlag = true
                }else{
                    this.setUserName(msg,ws)
                }
                break
            case 'setUserPic':
                if(local){
                    existFlag = true
                }else{
                    this.setUserPic(msg,ws)
                }
                break
            default:
                existFlag = false
                break
        }
        return existFlag;
    },

    getIP:function () {
        return config.ip

    },

    getPort:function () {
        return config.wsPort

    },
    async asyGetPK(encoding) {
       const ormService =  await ormServicePromise
        const record = await ormService.user.getFirstRecord()
      let result = record.publicKey
      if(encoding) {
        result = result.toString(encoding)
      }
        return result
    },
    _newMsgFromRow:function (row,local) {
        let msg = {
            header:{target:{}}
        };
        let header = msg.header;
        header.version = "1.0";
        header.id = row.msgId;
        header.flowId = row.flowId;
        header.action = row.action;
        header.uid = row.senderUid;
        header.did = row.senderDid;
        header.time = parseInt(row.sendTime);
        header.timeout = row.timeout;
        header.preFlowId = row.preFlowId;
        header.flowType = row.flowType;
        if(local){
            header.serverIP = row.senderServerIP;
            header.serverPort = row.senderServerPort;
            header.target.id = row.targetUid;
            header.target.did = row.targetDid;
            header.target.random = row.random;
        }else{
            let target = JSON.parse(row.targetText);
            if(target.forEach){
                header.targets = target;
            }else{
                header.target = target;
            }
        }
        msg.body = JSON.parse(row.body);
        return msg;
    },
    _sendLocalRetainMsgs:async function (ws,rows) {
        if(rows&&rows.length>0){
            let msgs = [];
            //check relative flow exist
            let relativeMsgIds = new Map();
            for(let i=0;i<rows.length;i++){
                let row = rows[i];
                let msg = this._newMsgFromRow(row,true);

                msgs.push(msg);

                let relativeMsgId = msg.body.relativeMsgId;
                if(relativeMsgId){
                    relativeMsgIds.set(relativeMsgId,false);
                }
            }
            let ps = [];
            relativeMsgIds.forEach((v,k)=>{
                ps.push(Message.asyGetLocalFlow(k,ws._uid,ws._did));
            })
            if(ps.length>0){
                let rs = await Promise.all(ps);
                for(let i=0;i<rs.length;i++){
                    let relativeFlow = rs[i];
                    if(relativeFlow){
                        relativeMsgIds.set(relativeFlow.msgId,true)
                    }
                }
            }

            msgs.forEach(function (msg) {
                if(msg.body.relativeMsgId&&relativeMsgIds.get(msg.body.relativeMsgId)===false){
                    msg.header.RFExist=0;
                }
            })
            wsSend(ws, JSON.stringify(msgs),function () {
              msgs.forEach(function (msg) {
                Message.markSent(msg.header.flowId);
              })
            })
        }

    },
    _checkSingalWSTimeoutMsgs:function (ws,time) {
        return new Promise((resolve)=>{
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
         this.clients.forEach( (wsS)=>{
            wsS.forEach((ws)=>{
                ps.push(this._checkSingalWSTimeoutMsgs(ws,time))
            })
        })
        let results = await Promise.all(ps);
        //foreign contact's retain msg
        let foreignMsgs = results[0];

        if(foreignMsgs){
            foreignMsgs.forEach( (row) =>{
                let msg = this._newMsgFromRow(row,false);
                Transfer.send(msg,row.targetServerIP,row.targetServerPort);
            })
        }
        setTimeout(()=>{this._asyCheckTimeoutRetainMsgs()}, 3 * 60 * 1000);
    },
    _clearTimeoutMsgs:function () {
        Message.clearTimeoutMsgs();
        setTimeout(()=>{this._clearTimeoutMsgs()}, 60 * 60 * 1000);
    },
    ping: async function(msg,ws){
        try{
            ws._lastHbTime = Date.now();
            let respContent = {};
            if(msg.body.content){
                let result = await Promise.all([MCodeManager.asyGetOrgMagicCode(),MCodeManager.asyGetMemberMagicCode()]);
                let orgMCode = result[0];
                let memberMCode = result[1];
                let ps = [];
                if(msg.body.content.orgMCode!==orgMCode){
                    ps.push(Org.asyGetBaseList());
                }else{
                    ps.push(null)
                }
                if(msg.body.content.memberMCode!==memberMCode){
                    ps.push(Member.asyGetAllMCodes())
                }else{
                    ps.push(null)
                }
                result = await Promise.all(ps)
                respContent = LKServer.newResponseMsg(msg.header.id,
                    {
                        orgMCode:orgMCode,
                        memberMCode:memberMCode,
                        orgs:msg.body.content.orgMCode!==orgMCode?result[0]:null,
                        members:msg.body.content.memberMCode!==memberMCode?result[1]:null
                    }

                );
            }else{
                respContent = LKServer.newResponseMsg(msg.header.id);
            }
            wsSend(ws, JSON.stringify(respContent));
        }catch (e){
            console.info("ping:"+e);
        }

    },
    fetchMembers:function (msg,ws) {
        let ids = msg.body.content.members;
        Member.asyGetMembers(ids).then(function (members) {
            let content = JSON.stringify(LKServer.newResponseMsg(msg.header.id,{members:members}));
            wsSend(ws, content);
        });
    },
    login: async function (msg,ws) {
        let uid = msg.header.uid;
        let did = msg.header.did;
        let venderDid = msg.body.content.venderDid;
        let result = await Promise.all([Member.asyGetMember(uid),Device.asyGetDevice(did)]);
        let content = {};
        let isValid = false;
        // console.info(uid+","+did+" login,"+JSON.stringify(result[0]))
        // console.info(uid+","+did+" login,"+JSON.stringify(result[1]))

        if(result[0]&&result[1]){
            let wsS = this.clients.get(uid);
            if (!wsS) {
                wsS = new Map();
                this.clients.set(uid,wsS);
            }
            if(wsS.has(ws._did)){
                let old = wsS.get(ws._did);
                wsS.delete(ws._did);
                if(old!==ws){
                    old.close();
                }
            }
            ws._uid = uid;
            ws._did = did;
            ws._lastHbTime = Date.now();
            wsS.set(did,ws);
            if(venderDid)
                Device.asyUpdateVenderDid(uid,did,venderDid);
            let ps =  [Message.asyGetMinPreFlowId(uid,did,'deviceDiffReport'),Message.asyGetMinPreFlowId(uid,did,'group'),Group.asyGetAllGroupDetail(uid)];
            let rs = await Promise.all(ps);
            let minPreFlows = {};
            minPreFlows["deviceDiffReport"]=rs[0];
            minPreFlows["group"]=rs[1];
            content["minPreFlows"] = minPreFlows;
            content["groups"] = rs[2];
            isValid = true;
        }else{
            content.err="invalid user";
        }
        // console.info(uid+","+did+" login,"+isValid)
        let rep = JSON.stringify(LKServer.newResponseMsg(msg.header.id,content));
        wsSend(ws, rep, ()=> {
            // if(isValid)
            //     this.sendAllDetainedMsg(msg, ws)
        });

    },
    async getAllDetainedMsg (msg, ws) {
       await this.sendAllDetainedMsg(msg, ws)
      let rep = JSON.stringify(LKServer.newResponseMsg(msg.header.id,{}))
      wsSend(ws, rep)
    },
    sendAllDetainedMsg (msg, ws) {
      let uid = msg.header.uid;
      let did = msg.header.did;
      return Message.asyGetAllLocalRetainMsg(uid,did).then((rows)=>{
          // console.info("sendAllDetainedMsg:"+uid+","+rows.length+":"+JSON.stringify(rows));
        this._sendLocalRetainMsgs(ws,rows);
      });
    },
    register:async function (msg,ws) {
        // console.log(msg)
        let content = msg.body.content;
        let did = content.did;
        let venderDid = content.venderDid;
        let pk = content.pk;
        let description = content.description;
        const {name, checkCode} = content;
        if(name && checkCode){
            //验证是否存在该人员
            let member = await Member.asyGetMemberByName(name);
            if (!member) {
                let content = JSON.stringify(LKServer.newResponseMsg(msg.header.id,{error:"成员不存在"}));
                wsSend(ws, content);
                return
            }
            const uid = member.id

            const ticket = await Ticket.asyGetTicketByMemberId(uid)
            // console.log(ticket)
            if (checkCode !== ticket.checkCode) {
                let content = JSON.stringify(LKServer.newResponseMsg(msg.header.id,{error:"验证码错误"}));
                wsSend(ws, content);
                return
            }
            //设备id是否重复
            let device = await Device.asyGetDevice(did);
            if(device){
                let content = JSON.stringify(LKServer.newResponseMsg(msg.header.id,{error:"设备已经存在"}));
                wsSend(ws, content);
            }else{

                try{
                    await Device.asyAddDevice(uid,did,venderDid,pk,description);
                    DeviceManager.deviceChanged(uid);
                    //返回全部org、members、该人的好友

                    let ps = [MCodeManager.asyGetOrgMagicCode(),MCodeManager.asyGetMemberMagicCode(),Org.asyGetBaseList(),Member.asyGetAll(),Friend.asyGetAllFriends(uid),Group.asyGetGroupContacts(uid),Group.asyGetAllGroupDetail(uid)];
                    let result = await Promise.all(ps);
                    const publicKey = await this.asyGetPK('base64')
                    let content = JSON.stringify(LKServer.newResponseMsg(msg.header.id,{
                        uid, publicKey:publicKey,orgMCode:result[0],memberMCode:result[1],orgs:result[2],members:result[3],friends:result[4],groupContacts:result[5],groups:result[6]}));
                    wsSend(ws, content);
                }catch(error){
                    console.log(error)

                    let content = JSON.stringify(LKServer.newResponseMsg(msg.header.id,{error:error.toString()}));
                    wsSend(ws, content);
                }

            }
        }else{
            let content = JSON.stringify(LKServer.newResponseMsg(msg.header.id,{error:"非法注册"}));
            wsSend(ws, content);
        }



        //注册设备
    },
  // 用于LK1升级LK2
   async updateRegister(msg, ws) {
     let content = msg.body.content;
     let uid = content.uid;
     let did = content.did;
     let venderDid = content.venderDid;
     let pk = content.pk;
     let description = content.description;

     //验证是否存在该人员
     let member = await Member.asyGetMember(uid);
     if(member){
       //设备id是否重复
       let device = await Device.asyGetDevice(did);
       if(device){
         let content = JSON.stringify(LKServer.newResponseMsg(msg.header.id,{error:"device id already exist"}));
         wsSend(ws, content);
       }else{
         try{
           await Device.asyAddDevice(uid,did,venderDid,pk,description);
           DeviceManager.deviceChanged(uid);
           //返回全部org、members、该人的好友

           let ps = [MCodeManager.asyGetOrgMagicCode(),MCodeManager.asyGetMemberMagicCode(),Org.asyGetBaseList(),Member.asyGetAll(),Friend.asyGetAllFriends(uid),Group.asyGetGroupContacts(uid),Group.asyGetAllGroupDetail(uid)];
           let result = await Promise.all(ps);
           const publicKey = await this.asyGetPK('base64')
           let content = JSON.stringify(LKServer.newResponseMsg(msg.header.id,{publicKey:publicKey,orgMCode:result[0],memberMCode:result[1],orgs:result[2],members:result[3],friends:result[4],groupContacts:result[5],groups:result[6]}));
           wsSend(ws, content);
         }catch(error){
           console.log(error)
           let content = JSON.stringify(LKServer.newResponseMsg(msg.header.id,{error:error.toString()}));
           wsSend(ws, content);
         }
       }
     }else{
       let content = JSON.stringify(LKServer.newResponseMsg(msg.header.id,{error:"member not exist"}));
       wsSend(ws, content);
     }
   },
    unRegister: function (msg,ws) {
        let header = msg.header;
        let uid = header.uid;
        let did = header.did;
        Device.asyRemoveDevice(uid,did).then(function () {
            DeviceManager.deviceChanged(uid);
            let content = JSON.stringify(LKServer.newResponseMsg(msg.header.id));
            wsSend(ws, content);
            Message.deleteFlows(did);
        });
    },
    _checkDeviceDiff:async function (uid,localDevices,excludeDevice) {

        let curDevices = await DeviceManager.asyGetDevices(uid);
        let newCurDevices = [];
        newCurDevices = newCurDevices.concat(curDevices);
        let removed = [];
        let added = [];
        for(let j=0;j<localDevices.length;j++){
            let device = localDevices[j];
            let exists = false;
            for(let i=0;i<newCurDevices.length;i++){
                let curDevice = newCurDevices[i];
                if(curDevice.id===device.id){
                    exists = true;
                    newCurDevices.splice(i,1);
                    break;
                }
            }
            if(!exists){
                removed.push(device.id);
            }
        }
        newCurDevices.forEach(function (device) {
            if(device.id!==excludeDevice){
                added.push({id:device.id,pk:device.pk});
            }
        });
        let result = null;
        if(added.length>0||removed.length>0)
            result = {id:uid,added:added,removed:removed};
        return result;
    },


    sendMsg2:function (msg,ws) {
        this.sendMsg(msg,ws,true);
    },

    sendMsg: async function (msg,ws,send2) {
        let nCkDiff = send2;
        let header = msg.header;
        let msgId = header.id;
        let curMsg = await Message.asyGetMsg(msgId);
        if(!curMsg){
            await Message.asyAddMessage(msg);
        }
        if(!nCkDiff){
            let f = null;
            if(header.transfer) {
               f = await Message.asyGetForeignFlowbyParentMsgId(msgId, msg.header.serverIP, msg.header.serverPort);
            }else{
               f = await Message.asyGetLocalFlowbyParentMsgId(msgId,msg.header.uid,msg.header.did);//check if  there is a deviceDiff msg to the specified msg
            }

            if(f){
                nCkDiff = true;
            }

        }
        let targets = header.targets;
        let senderUid = header.uid;
        let senderDid = header.did;
        let diffs = [];
        let ckDiffPs = [];
        let member = await Member.asyGetMember(senderUid);
        // let pushMsg = '发来新的消息,请注意查收'
        let pushMsg = ''
        if(msg.body !==null && msg.body !=='undefined'){
            let content = JSON.parse(msg.body.content);
            if(msg.body.isGroup){
                let groups = await Group.asyGetGroup(msg.body.chatId);
                if(content.type===3){
                    pushMsg = "群:"+groups.name + ","+member.name +"\n"+"发来了一条语音"
                }else if(content.type===1){
                    pushMsg = "群:"+groups.name + ","+member.name +"\n"+"发来了一张图片"
                }else{
                    pushMsg = "群:"+groups.name + ","+member.name +"\n"+"发来了一条消息"
                }
            }
            else{
                if(content.type===3){
                    pushMsg = member.name+"\n"+"发来了一条语音"
                }else if(content.type===1){
                    pushMsg = member.name+"\n"+"发来了一张图片"
                }else{
                    pushMsg = member.name+"\n"+"发来了一条消息"
                }
            }
        }
        let targetsNeedTrasfer = new Map();

        let localFlowsPs = [];

        targets.forEach((target)=>{
            if(target.serverIP&&(target.serverIP!==this.getIP()||target.serverPort!==this.getPort())){//to another server
                let targets2 = targetsNeedTrasfer.get(target.serverIP+":"+target.serverPort);
                if(!targets2){
                    targets2 = [];
                    targetsNeedTrasfer.set(target.serverIP+":"+target.serverPort,targets2);
                }
                targets2.push(target);
            }else{
                let devices = target.devices;
                if(!nCkDiff)
                    ckDiffPs.push(this._checkDeviceDiff(target.id,devices,senderDid));
                devices.forEach((device)=>{
                    localFlowsPs.push(
                        new Promise((resolve,reject)=>{
                            Message.asyGetLocalFlow(msgId,target.id,device.id).then((f)=>{
                                if(!f){
                                    let flowId = this.generateFlowId();
                                    Message.asyAddLocalFlow(flowId,msgId,target.id,device.id,device.random).then(()=>{
                                        resolve();
                                        if(senderUid!==target.id){
                                            Device.asyGetDevice(device.id).then((d)=>{
                                                if(d&&d.venderDid){
                                                    setTimeout(()=>{
                                                        // let content = JSON.parse(msg.body.content);
                                                        // let pushMsg = "新消息:"+(content.type==0?content.data:"图片或语音")
                                                        Push.pushIOS(pushMsg,d.venderDid);
                                                        let date = new Date();
                                                        console.log(`pushIOS: ${d.venderDid}`)
                                                        // Log.info("pushIOS:msgId "+msg.header.id+",target "+target.id+","+send2+","+(content.type==0?content.data:"图片或语音") + "," + (date.getMonth() + 1) + "月" + date.getDate() + "日 " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds());
                                                    },2000);
                                                }
                                            })
                                        }

                                        let wsS = this.clients.get(target.id);
                                        if (wsS) {
                                            let ws = wsS.get(device.id);
                                            if(ws){
                                                let flowMsg = this._newMsgFromMsg(msg,{flowId:flowId,target:{
                                                    id:target.id,
                                                    did:device.id,
                                                    random:device.random,
                                                }})
                                                //TODO relative msg may not reach as crossing servers, so transfer should sync relative msg and msgs follow it

                                                let relativeMsgId = msg.body.relativeMsgId;
                                                if(relativeMsgId){
                                                    Message.asyGetLocalFlow(relativeMsgId,target.id,device.id).then((relativeFlow)=>{
                                                        if(!relativeFlow){
                                                            flowMsg.header.RFExist=0;
                                                        }
                                                        wsSend(ws, JSON.stringify(flowMsg),()=> {
                                                            Message.markSent(flowId);
                                                        });
                                                    });
                                                }else{
                                                    wsSend(ws, JSON.stringify(flowMsg),()=> {
                                                        Message.markSent(flowId);
                                                    });
                                                }
                                            }
                                        }
                                    });
                                }else{
                                    resolve();
                                }
                            })
                        })

                    );

                })
            }
        });

        targetsNeedTrasfer.forEach((v,k)=>{
            let key = k.split(":");
            let ip = key[0];
            let port = key[1];
            Message.asyGetForeignFlow(msgId,ip,port).then((f)=>{
                if(!f){
                    let flowId = this.generateFlowId();
                    Message.asyAddForeignFlow(flowId,msgId,ip,port,v).then(()=>{
                        let flowMsg = this._newMsgFromMsg(msg,{flowId:flowId,targets : v})
                        Transfer.send(flowMsg,ip,port);
                    })
                }
            })

        })

        if(!nCkDiff&&ckDiffPs.length>0){
            diffs = await Promise.all(ckDiffPs);
            let dffRes = [];
            diffs.forEach(function (res) {
                if(res){
                    dffRes.push(res);
                }
            })

            if(dffRes.length>0){
                if(header.transfer){
                    Message.asyGetLastForeignFlowId(msg.header.serverIP,msg.header.serverPort,'deviceDiffReport').then((preFlowId)=>{
                        this._sendForeignNewAction(msgId,UUID(),"msgDeviceDiffReport",{diff:dffRes,msgId:msgId,chatId:msg.body.chatId},{id:header.uid,did:header.did},preFlowId,"deviceDiffReport");
                    })
                }else{
                    Message.asyGetLastLocalFlowId(msg.header.uid,msg.header.did,'deviceDiffReport').then((preFlowId)=>{
                        this._sendLocalNewAction(msgId,UUID(),"msgDeviceDiffReport",{diff:dffRes,msgId:msgId,chatId:msg.body.chatId},msg.header.uid,msg.header.did,preFlowId,"deviceDiffReport");
                    })
                }
            }

        }
        Promise.all(localFlowsPs).then(()=>{
            let content = JSON.stringify(this.newResponseMsg(msgId,null,header.flowId));
            wsSend(ws, content);
        }).catch((err)=>{
            console.info(err);
        })

    },
    msgDeviceDiffReport:async function (msg,ws) {
        let header = msg.header;
        let msgId = header.id;
        let target = header.target;
        let curMsg = await Message.asyGetMsg(msgId);
        if(!curMsg){
            await Message.asyAddMessage(msg);
        }
        let srcFlowId = header.flowId;
        if(header.transfer){
            let content = JSON.stringify(this.newResponseMsg(msgId,null,srcFlowId,header.serverIP,header.serverPort,header.flowType));
            wsSend(ws, content);
            Message.asyGetLocalFlow(msgId,target.id,target.did).then((f)=>{
                if(!f){
                    let flowId = this.generateFlowId();
                    Message.asyAddLocalFlow(flowId,msgId,target.id,target.did).then(()=>{
                        let wsS = this.clients.get(target.id);
                        if (wsS) {
                            let ws = wsS.get(target.did);
                            if(ws){
                                header.flowId = flowId;
                                wsSend(ws, JSON.stringify(msg),()=> {
                                    Message.markSent(flowId);
                                });
                            }
                        }
                    });
                }
            })

        }

    },

    _sendLocalNewAction:async function(parentMsgId,newMsgId,action,content,targetUid,targetDid,preFlowId,flowType){
        let flowId = this.generateFlowId();
        let msg = {header:{
            version:"1.0",
            id:newMsgId,
            flowId:flowId,
            preFlowId:preFlowId,
            flowType:flowType,
            action:action
        },body:{
            content:content
        }};
        await Message.asyAddMessage(msg,parentMsgId);

        Message.asyAddLocalFlow(flowId,newMsgId,targetUid,targetDid,null,preFlowId,flowType).then(()=>{
            let wsS = this.clients.get(targetUid);

            if (wsS) {
                let ws = wsS.get(targetDid);
                if(ws){
                    wsSend(ws, JSON.stringify(msg),()=> {
                        Message.markSent(flowId);
                    });
                }
            }
        });
    },
    _sendForeignNewAction:async function(parentMsgId,newMsgId,action,content,targetServerIP,targetServerPort,target,preFlowId,flowType,ws){
        let flowId = this.generateFlowId();
        let msg = {header:{
            version:"1.0",
            id:newMsgId,
            flowId:flowId,
            preFlowId:preFlowId,
            flowType:flowType,
            action:action
        },body:{
            content:content
        }};
        await Message.asyAddMessage(msg,parentMsgId);
        Message.asyAddForeignFlow(flowId,newMsgId,targetServerIP,targetServerPort,target,preFlowId,flowType).then(()=>{
            Transfer.send(msg,targetServerIP,targetServerPort);
        });
    },
//TODO 定时清理滞留消息 设备处于激活状态下时，如其未收到元消息，元消息始终保持在库；所以还是要有个激活状态管理，或者还是超时删除元信息，但是当再次激活时需要更新设备的元信息

    readReport:async function (msg,ws) {
        let header = msg.header;
        let msgId = header.id;
        let curMsg = await Message.asyGetMsg(msgId);
        if(!curMsg){
            await Message.asyAddMessage(msg);
        }
        let srcFlowId = header.flowId;
        let target = header.target;
        if(target.serverIP&&(target.serverIP!==this.getIP()||target.serverPort!==this.getPort())) {//to another server
            let f = await Message.asyGetForeignFlow(msgId,target.serverIP,target.serverPort);
            if(!f){
                let flowId = this.generateFlowId();
                Message.asyAddForeignFlow(flowId,msgId,target.serverIP,target.serverPort,target).then(()=>{
                    msg.header.flowId = flowId;
                    Transfer.send(msg,target.serverIP,target.serverPort,this);
                })
            }
        }else{
            let devices = await Device.asyGetDevices(target.id);
            let ps = [];
            if(devices){
                devices.forEach((device)=>{
                    ps.push(
                        new Promise((resolve,reject)=>{
                            Message.asyGetLocalFlow(msgId,target.id,device.id).then((f)=>{
                                if(!f){
                                    let flowId = this.generateFlowId();
                                    Message.asyAddLocalFlow(flowId,msgId,target.id,device.id).then(()=>{
                                        resolve();
                                        let wsS = this.clients.get(target.id);
                                        if (wsS) {
                                            let ws = wsS.get(device.id);
                                            if(ws){
                                                msg.header.flowId = flowId;
                                                wsSend(ws, JSON.stringify(msg),()=> {
                                                    Message.markSent(flowId);
                                                });
                                            }
                                        }
                                    });
                                }else{
                                    resolve();
                                }
                            })
                        })

                    );
                });
            }
            if(ps.length>0){
                await Promise.all(ps);
            }

        }
        let content = JSON.stringify(this.newResponseMsg(msgId,null,srcFlowId));
        wsSend(ws, content);

    },
    _transRemote:async function(msg,ws){
        let header = msg.header;
        let msgId = header.id;
        let target = header.target;
        let curMsg = await Message.asyGetMsg(msgId);
        if(!curMsg){
            await Message.asyAddMessage(msg);
        }
        let srcFlowId = header.flowId;
        if(header.transfer){
            let devices = await Device.asyGetDevices(target.id);
            if(devices){
                devices.forEach((device)=>{
                    Message.asyGetLocalFlow(msgId,target.id,device.id).then((f)=>{
                        if(!f){
                            let flowId = this.generateFlowId();
                            Message.asyAddLocalFlow(flowId,msgId,target.id,device.id).then(()=>{
                                let wsS = this.clients.get(target.id);
                                if (wsS) {
                                    let ws = wsS.get(device.id);
                                    if(ws){
                                        header.flowId = flowId;
                                        wsSend(ws, JSON.stringify(msg),()=> {
                                            Message.markSent(flowId);
                                        });
                                    }
                                }
                            });
                        }
                    })
                });
            }
        }else{
            Message.asyGetForeignFlow(msgId,target.serverIP,target.serverPort).then((f)=>{
                if(!f){
                    let newFlowId = this.generateFlowId();
                    Message.asyAddForeignFlow(newFlowId,msgId,target.serverIP,target.serverPort,target).then(()=>{
                        header.flowId = newFlowId;
                        Transfer.send(msg,target.serverIP,target.serverPort);
                    });
                }
            });
        }
        let content = JSON.stringify(this.newResponseMsg(msgId,null,srcFlowId));
        wsSend(ws, content);
    },
    applyMF:function(msg,ws){
        this._transRemote(msg,ws);
    },
    acceptMF:async function(msg,ws){
        let header = msg.header;
        let content = msg.body.content;

        this._transRemote(msg,ws).then(()=>{
            if(header.transfer){
                Member.asyGetContact(header.uid).then((contact)=>{
                    if(!contact){
                        Member.asyAddContact(header.uid,content.accepter.name,content.accepter.pic,header.serverIP,header.serverPort);
                    }
                })
                Friend.asyGetFriend(header.target.id,header.uid).then((friend)=>{
                    if(!friend){
                        Friend.asyAddFriend(header.target.id,header.uid);
                    }
                });
            }else{
                Device.asyGetDevices(header.uid).then((devices)=>{
                    if(devices){
                        devices.forEach((device)=>{
                            if(device.id!==header.did){
                                Message.asyGetLocalFlow(header.id,header.uid,device.id).then((f)=> {
                                    if (!f) {
                                        let flowId = this.generateFlowId();
                                        Message.asyAddLocalFlow(flowId,header.id,header.uid,device.id).then(()=>{
                                            let wsS = this.clients.get(header.uid);
                                            if (wsS) {
                                                let ws = wsS.get(device.id);
                                                if(ws){
                                                    header.flowId = flowId;
                                                    wsSend(ws, JSON.stringify(msg),()=> {
                                                        Message.markSent(flowId);
                                                    });
                                                }
                                            }
                                        });
                                    }
                                });

                            }

                        });
                    }
                });

                Member.asyGetContact(header.target.id).then((contact)=>{
                    if(!contact){
                        Member.asyAddContact(header.target.id,content.applyer.name,content.applyer.pic,header.target.serverIP,header.target.serverPort);
                    }
                })
                Friend.asyGetFriend(header.uid,header.target.id).then((friend)=>{
                    if(!friend){
                         Friend.asyAddFriend(header.uid,header.target.id);
                    }
                });
            }
        });
    },
    addGroupChat:async function (msg,ws) {
        let header = msg.header;
        let msgId = header.id;
        let curMsg = await Message.asyGetMsg(msgId);
        if(!curMsg){
            await Message.asyAddMessage(msg);
        }
        let members = msg.body.content.members;

        let chatId = msg.body.content.chatId;
        let group = await Group.asyGetGroup(chatId);
        if(!group){
            let ps = [];
            ps.push(Group.asyAddGroup(chatId,msg.body.content.name));
            members.forEach((member)=>{
                ps.push(Member.asyGetContact(member.id).then((contact)=>{
                    if(!contact){
                        Member.asyAddContact(member.id,member.name,member.pic,member.serverIP,member.serverPort);
                    }
                }))
                ps.push(Group.asyGetGroupMember(chatId,member.id).then((m)=>{
                    if(!m){
                        Group.asyAddGroupMember(chatId,member.id);
                    }
                }))
            });
            await Promise.all(ps);
            if(header.transfer){
                let targets = header.targets;
                targets.forEach((target)=>{
                    Device.asyGetDevices(target.id).then((devices)=>{
                        if(devices){
                            devices.forEach((device)=>{
                                Message.asyGetLocalFlow(msgId,target.id,device.id).then((f)=>{
                                    if(!f){
                                        Message.asyGetLastLocalFlowId(target.id,device.id,'group').then((preFlowId)=>{
                                            let flowId = this.generateFlowId();
                                            Message.asyAddLocalFlow(flowId,msgId,target.id,device.id,null,preFlowId,"group").then(()=>{
                                                let wsS = this.clients.get(target.id);
                                                if (wsS) {
                                                    let ws = wsS.get(device.id);
                                                    if(ws){
                                                        //msg.header.flowId = flowId;
                                                        let newMsg = this._newMsgFromMsg(msg,{flowId:flowId,preFlowId:preFlowId,flowType:"group"});
                                                        wsSend(ws, JSON.stringify(newMsg),()=> {
                                                            Message.markSent(flowId);
                                                        });
                                                    }
                                                }
                                            });
                                        });
                                    }
                                })
                            });
                        }
                    });
                });
            }else{
                let targetsNeedTrasfer = new Map();
                members.forEach((target)=>{
                    if(target.serverIP&&(target.serverIP!==this.getIP()||target.serverPort!==this.getPort())){//to another server
                        let targets2 = targetsNeedTrasfer.get(target.serverIP+":"+target.serverPort);
                        if(!targets2){
                            targets2 = [];
                            targetsNeedTrasfer.set(target.serverIP+":"+target.serverPort,targets2);
                        }
                        targets2.push(target);
                    }else{
                        Device.asyGetDevices(target.id).then((devices)=>{
                            if(devices){
                                devices.forEach((device)=>{
                                    if(device.id!==header.did){
                                        Message.asyGetLocalFlow(msgId,target.id,device.id).then((f)=>{
                                            if(!f){
                                                Message.asyGetLastLocalFlowId(target.id,device.id,'group').then((preFlowId)=>{
                                                    let flowId = this.generateFlowId();
                                                    Message.asyAddLocalFlow(flowId,msgId,target.id,device.id,null,preFlowId,"group").then(()=>{
                                                        let wsS = this.clients.get(target.id);
                                                        if (wsS) {
                                                            let ws = wsS.get(device.id);
                                                            if(ws){
                                                                let newMsg = this._newMsgFromMsg(msg,{flowId:flowId,preFlowId:preFlowId,flowType:"group"});
                                                                wsSend(ws, JSON.stringify(newMsg),()=> {
                                                                    Message.markSent(flowId);
                                                                });
                                                            }
                                                        }
                                                    });
                                                });
                                            }
                                        })
                                    }
                                });
                            }
                        });

                    }
                });
                targetsNeedTrasfer.forEach((v,k)=>{
                    let key = k.split(":");
                    let ip = key[0];
                    let port = key[1];
                    Message.asyGetForeignFlow(msgId,ip,port).then((f)=>{
                        if(!f){
                            Message.asyGetLastForeignFlowId(ip,port,"group").then((preFlowId)=>{
                                let flowId = this.generateFlowId();
                                Message.asyAddForeignFlow(flowId,msgId,ip,port,v,preFlowId,"group").then(()=>{
                                    let newMsg = this._newMsgFromMsg(msg,{flowId:flowId,preFlowId:preFlowId,flowType:"group",targets:v});
                                    Transfer.send(newMsg,ip,port,this);
                                })
                            });
                        }
                    })
                })

            }
        }

        let content = JSON.stringify(this.newResponseMsg(msgId,null,header.flowId));
        wsSend(ws, content);
    },
    addGroupMembers: async function (msg,ws) {
        //TODO just deal with local trasation for now
        //split msg to 2 msgs one for old members and one for new members
        let header = msg.header;
        let msgId = header.id;
        let curMsg = await Message.asyGetMsg(msgId);
        if(!curMsg){
            await Message.asyAddMessage(msg);
        }
        let members = msg.body.content.members;

        let chatId = msg.body.content.chatId;

        if(header.transfer){

        }else{
            let group = await Group.asyGetGroup(chatId);
            if (group) {
                let curMembers = await Group.asyGetGroupMembers(chatId);
                if(curMembers){
                    //msg
                    curMembers.forEach((target)=>{
                        Device.asyGetDevices(target.id).then((devices)=>{
                            if(devices){
                                devices.forEach((device)=>{
                                    if(device.id!==header.did){
                                        Message.asyGetLocalFlow(msgId,target.id,device.id).then((f)=>{
                                            if(!f){
                                                Message.asyGetLastLocalFlowId(target.id,device.id,'group').then((preFlowId)=>{
                                                    let flowId = this.generateFlowId();
                                                    Message.asyAddLocalFlow(flowId, msgId, target.id, device.id,null,preFlowId,"group").then(() => {
                                                        let wsS = this.clients.get(target.id);
                                                        if (wsS) {
                                                            let ws = wsS.get(device.id);
                                                            if (ws) {
                                                                let newMsg = this._newMsgFromMsg(msg,{flowId:flowId,preFlowId:preFlowId,flowType:"group"});
                                                                wsSend(ws, JSON.stringify(newMsg),()=> {
                                                                    Message.markSent(flowId);
                                                                });
                                                            }
                                                        }
                                                    });
                                                });
                                            }
                                        })

                                    }
                                });
                            }
                        });
                    });
                    //msg2
                    let newMembers = msg.body.content.members;
                    let newMsgId = header.msgId+"_2";
                    let msg2 = this._newMsgFromMsg(msg,{msgId:newMsgId});
                    msg2.body.content.oldMembers = curMembers;
                    let cutMsg2 = await Message.asyGetMsg(newMsgId);
                    if(!cutMsg2){
                        Message.asyAddMessage(msg2,msgId);
                    }

                    newMembers.forEach((target)=>{
                        Device.asyGetDevices(target.id).then((devices)=>{
                            if(devices){
                                devices.forEach((device)=>{
                                    Message.asyGetLocalFlow(newMsgId,target.id,device.id).then((f)=>{
                                        if(!f){
                                            Message.asyGetLastLocalFlowId(target.id,device.id,'group').then((preFlowId)=>{
                                                let flowId = this.generateFlowId();
                                                Message.asyAddLocalFlow(flowId,newMsgId,target.id,device.id,preFlowId,"group").then(()=>{
                                                    let wsS = this.clients.get(target.id);
                                                    if (wsS) {
                                                        let ws = wsS.get(device.id);
                                                        if(ws){
                                                            let newMsg = this._newMsgFromMsg(msg2,{flowId:flowId,preFlowId:preFlowId,flowType:"group"});
                                                            wsSend(ws, JSON.stringify(newMsg),()=> {
                                                                Message.markSent(flowId);
                                                            });
                                                        }
                                                    }
                                                });
                                            });
                                        }
                                    })


                                });
                            }
                        });
                    });

                }

                members.forEach((member) => {
                    Group.asyAddGroupMember(chatId, member.id);
                });
            }

        }
        let content = JSON.stringify(this.newResponseMsg(msgId,null,header.flowId));
        wsSend(ws, content);
    },

    leaveGroup:async function(msg,ws){
        let header = msg.header;
        let msgId = header.id;
        let curMsg = await Message.asyGetMsg(msgId);
        if(!curMsg){
            await Message.asyAddMessage(msg);
        }
        let chatId = msg.body.content.chatId;
        await Group.asyRemoveGroupMember(chatId,header.uid);
        Group.asyGetGroupMembers(chatId).then((curMembers)=> {
            if (curMembers) {
                curMembers.forEach((target) => {
                    Device.asyGetDevices(target.id).then((devices) => {
                        if (devices) {
                            devices.forEach((device) => {
                                if (device.id !== header.did) {
                                    Message.asyGetLocalFlow(msgId,target.id,device.id).then((f)=>{
                                        if(!f){
                                            Message.asyGetLastLocalFlowId(target.id,device.id,'group').then((preFlowId)=>{
                                                let flowId = this.generateFlowId();
                                                Message.asyAddLocalFlow(flowId, msgId, target.id, device.id,null,preFlowId,"group").then(() => {
                                                    let wsS = this.clients.get(target.id);
                                                    if (wsS) {
                                                        let ws = wsS.get(device.id);
                                                        if (ws) {
                                                            let newMsg = this._newMsgFromMsg(msg,{flowId:flowId,preFlowId:preFlowId,flowType:"group"});
                                                            wsSend(ws, JSON.stringify(newMsg),()=> {
                                                                Message.markSent(flowId);
                                                            });
                                                        }
                                                    }
                                                });
                                            })
                                        }
                                    })
                                }
                            });
                        }
                    });
                });
            }
        });
        let content = JSON.stringify(this.newResponseMsg(msgId,null,header.flowId));
        wsSend(ws, content);
    },

    setGroupName:async function(msg,ws){
        let header = msg.header;
        let msgId = header.id;
        let curMsg = await Message.asyGetMsg(msgId);
        if(!curMsg){
            await Message.asyAddMessage(msg);
        }
        let chatId = msg.body.content.chatId;
        let name = msg.body.content.name;
        Group.setGroupName(chatId,name).then( ()=> {
            Group.asyGetGroupMembers(chatId).then((curMembers)=> {
                if (curMembers) {
                    curMembers.forEach((target) => {
                        Device.asyGetDevices(target.id).then((devices) => {
                            if (devices) {
                                devices.forEach((device) => {
                                    if (device.id !== header.did) {
                                        Message.asyGetLocalFlow(msgId,target.id,device.id).then((f)=>{
                                            if(!f){
                                                Message.asyGetLastLocalFlowId(target.id,device.id,'group').then((preFlowId)=>{
                                                    let flowId = this.generateFlowId();
                                                    Message.asyAddLocalFlow(flowId, msgId, target.id, device.id,null,preFlowId,"group").then(() => {
                                                        let wsS = this.clients.get(target.id);
                                                        if (wsS) {
                                                            let ws = wsS.get(device.id);
                                                            if (ws) {
                                                                let newMsg = this._newMsgFromMsg(msg,{flowId:flowId,preFlowId:preFlowId,flowType:"group"});
                                                                wsSend(ws, JSON.stringify(newMsg),()=> {
                                                                    Message.markSent(flowId);
                                                                });
                                                            }
                                                        }
                                                    });
                                                })
                                            }
                                        })


                                    }
                                });
                            }
                        });
                    });
                }
            });
            let content = JSON.stringify(this.newResponseMsg(msgId,null,header.flowId));
            wsSend(ws, content);
        });

    },
    setUserName: async function (msg,ws) {
        let uid = msg.header.uid;
        let msgId = msg.header.id;
        await Member.setUserName(uid,msg.body.content.name);
        MCodeManager.resetSingleMemberMagicCode(uid);
        let content = JSON.stringify(this.newResponseMsg(msgId));
        wsSend(ws, content);
    },
    setUserPic: async function (msg,ws) {
        let uid = msg.header.uid;
        let msgId = msg.header.id;
        await Member.setUserPic(uid,msg.body.content.pic);
        MCodeManager.resetSingleMemberMagicCode(uid);
        let content = JSON.stringify(this.newResponseMsg(msgId));
        wsSend(ws, content);
    },
    //option {senderUid,senderDid,msgId,action,flowId,preFlowId,flowType}
    _newMsgFromMsg:function (srcMsg,option) {
        let msg = {
            header:{}
        };
        let header = msg.header;
        let srcHeader = srcMsg.header;
        header.version = "1.0";
        header.id = option.msgId||srcHeader.id;
        header.flowId = option.flowId||srcHeader.flowId;
        header.action = option.action||srcHeader.action;
        header.uid = option.senderUid||srcHeader.uid;
        header.did = option.senderDid||srcHeader.did;
        header.time = srcHeader.time;
        header.timeout = srcHeader.timeout;
        header.preFlowId = option.preFlowId;
        header.flowType = option.flowType;
        header.targets = option.targets;
        header.target = option.target;
        msg.body = srcMsg.body;
        return msg;
    },
    applyUploadChannel:function (msg,ws) {
        let postfix = msg.body.content.postfix;
        let newName = UUID()+"."+postfix;
        let msgId = msg.header.id;
        UploadSchedular.applyChannel(newName).then(function (port) {
            let content = JSON.stringify(this.newResponseMsg(msgId,{port:port,newName:newName}));
            wsSend(ws, content);
        });
    }
}

LKServer.init(config.wsPort)

if (isDebugging) {
  exitOnUnexpected()
}


module.exports = LKServer
