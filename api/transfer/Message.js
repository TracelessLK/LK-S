const Pool = require('../store/pool');
const Log = require('./Log');
let Message = {

    _checkRemoveMsg:function (msgId) {
        let sql = `delete from message where id=? and 1>(select count(*) from flow where msgId=?)`;
        Pool.query(sql,[msgId,msgId],function (error,results,fields) {
            if(error){
                console.error("_checkRemoveMsg:"+error.toString())
            }

        });
    },

    receiveReport:function (flowId) {
        let sql1 = "select * from flow where id=?";
        Pool.query(sql1,[flowId], (error,results,fields) =>{
            if(error){
                console.error("receiveReport:"+error.toString())
            }else if(results.length>0){
                let sql2 = "delete from flow where id=?";
                let msgId = results[0].msgId;
                Pool.query(sql2,[flowId], (error,results,fields) =>{
                    if(error){
                        console.error("receiveReport:"+error.toString())
                    }else{
                        this._checkRemoveMsg(msgId);
                    }
                });
            }
        });

    },

    // transferReceiveReport:function (msgId,targets,target) {
    //     let sql = "delete from flow where msgId=?";
    //     let params = [msgId];
    //     if(target){
    //         sql += " and targetUid=?";
    //         params.push(target.id);
    //     }else if(targets&&targets.length>0){
    //         sql += " and targetDid in(";
    //         targets.forEach((t)=>{
    //             if(t.devices&&t.devices.length>0){
    //                 t.devices.forEach((device)=>{
    //                     params.push(device.id);
    //                 });
    //             }
    //         })
    //         for(let i=1;i<params.length;i++){
    //             sql+="?";
    //             if(i<params.length-1){
    //                 sql+=",";
    //             }
    //         }
    //         sql += ")";
    //     }
    //     Pool.query(sql,params, (error,results,fields) =>{
    //         if(error){
    //
    //         }else{
    //             this._checkRemoveMsg(msgId);
    //         }
    //     });
    // },

    asyPeriodGetLocalMsgByTarget:function (targetUid,targetDid,time) {
        return new Promise((resolve,reject)=>{
            let sql = `
                select message.id as msgId,message.action,message.senderUid,message.senderDid,message.senderServerIP,message.senderServerPort,message.body,message.sendTime,message.timeout,
                flow.id as flowId,flow.targetUid,flow.targetDid,flow.preFlowId,flow.flowType,flow.targetServerIP,flow.targetServerPort,flow.random 
                from message,flow 
                where message.id = flow.msgId 
                and flow.targetUid=?
                and (flow.targetDid=? or flow.targetDid is null)
                and flow.targetServerIP is null
                and flow.lastSendTime is not null 
                and ?-(unix_timestamp(flow.lastSendTime)*1000)>180000
                order by message.sendTime
            `;
            Pool.query(sql,[targetUid,targetDid,time], (error,results,fields) =>{
                if(error){
                    resolve(null);
                }else{
                    resolve(results);
                }
            });
        });

    },

    markSent:function (flowId) {
        return new Promise((resolve,reject)=>{
            let sql = " update flow set lastSendTime=? where id=? ";
            Pool.query(sql,[new Date(),flowId], (error,results,fields) =>{
                resolve();
            });
        });
    },
    asyPeriodGetForeignMsg:function (time) {
        return new Promise((resolve,reject)=>{
            let sql = `
                select message.id as msgId,message.action,message.senderUid,message.senderDid,message.body,message.sendTime,message.timeout,
                flow.id as flowId,flow.preFlowId,flow.flowType,flow.targetServerIP,flow.targetServerPort,flow.targetText 
                from message,flow 
                where message.id = flow.msgId 
                and flow.targetServerIP is not null
                and flow.lastSendTime is not null 
                and ?-(unix_timestamp(flow.lastSendTime)*1000)>180000
                order by message.sendTime
            `;
            Pool.query(sql,[time], (error,results,fields) =>{
                if(error){
                    resolve(null);
                }else{
                    resolve(results);
                }
            });
        });
    },
    asyGetAllLocalRetainMsg:function (uid,did) {
        return new Promise((resolve,reject)=>{
            let sql = `
                select message.id as msgId,message.action,message.senderUid,message.senderDid,message.senderServerIP,message.senderServerPort,message.body,message.sendTime,
                flow.id as flowId,flow.preFlowId,flow.flowType,flow.targetUid,flow.targetDid,flow.targetServerIP,flow.targetServerPort,flow.random 
                from message,flow 
                where message.id = flow.msgId 
                and flow.targetUid=?
                and flow.targetDid=?
                order by message.sendTime
            `;
            Pool.query(sql,[uid,did], (error,results,fields) =>{
                if(error){
                    resolve(null);
                }else{
                    resolve(results);
                }
            });
        });
    },
    deleteFlows:function (did) {
        let sql = `
            delete from flow
            where targetDid=?
        `;
        Pool.query(sql,[did], (error,results,fields) =>{

        });
    },
    asyAddMessage:function (msg,parentMsgId) {
      // console.log({asyAddMessage: JSON.stringify(msg.body)})
        let header = msg.header;
        // let sendTime = new Date();
        // sendTime.setTime(header.time);
        let sendTime = ""+header.time;
        return new Promise((resolve,reject)=>{
            let sql = `
                insert into message
                set ?
            `;
            Pool.query(sql,{
                parentId:parentMsgId,
                id:header.id,action:header.action,senderUid:header.uid,senderDid:header.did,body:JSON.stringify(msg.body),sendTime:sendTime,time:new Date(),timeout:header.timeout,
                senderServerIP:header.serverIP,senderServerPort:header.serverPort
            }, (error,results,fields) =>{
                if(error){
                    reject(error);
                }else{
                    resolve();
                }
            });
        });
    },
    asyAddLocalFlow:function (flowId,msgId,uid,did,random,preFlowId,flowType) {
        return new Promise((resolve,reject)=>{
            let sql = `
                insert into flow
                set ?
            `;
            Pool.query(sql,{id:flowId,msgId:msgId,targetUid:uid,targetDid:did,random:random,preFlowId:preFlowId,flowType:flowType}, (error,results,fields) =>{
                if(error){
                    reject(error);
                }else{
                    if(flowType){
                        this.setLastLocalFlowId(uid,did,flowType,flowId);
                    }
                    resolve();
                }
            });
        });
    },
    asyAddForeignFlow:function (flowId,msgId,targetServerIP,targetServerPort,target,preFlowId,flowType) {
        return new Promise((resolve,reject)=>{
            let sql = `
                insert into flow
                set ?
            `;
            Pool.query(sql,{id:flowId,msgId:msgId,targetServerIP:targetServerIP,targetServerPort:targetServerPort,targetText:JSON.stringify(target),preFlowId:preFlowId,flowType:flowType}, (error,results,fields) =>{
                if(error){
                    reject(error);
                }else{
                    if(flowType){
                        this.setLastForeignFlowId(uid,did,flowType,flowId);
                    }
                    resolve();
                }
            });
        });
    },
    asyGetMsg:function (msgId) {
        return new Promise((resolve,reject)=>{
            let sql = `
                select * 
                from message 
                where message.id = ?
            `;
            Pool.query(sql,[msgId], (error,results,fields) =>{
                if(error){
                    resolve(null);
                }else{
                    resolve(results[0]);
                }
            });
        });
    },
    asyGetMinPreFlowId : async function(targetUid,targetDid,flowType){
        return new Promise((resolve,reject)=>{
            let sql = `select MIN(preFlowId) as preFlowId from flow where targetUid=? and targetDid=? and flowType=?`;
            Pool.query(sql,[targetUid,targetDid,flowType], (error,results,fields) =>{
                if(error){
                    resolve(null);
                }else{
                    resolve(results[0]["preFlowId"]);
                }
            });
        });
    },
    _lastFlowIds:new Map(),
    asyGetLastLocalFlowId: async function (targetUid,targetDid,flowType) {
        let flowId = this._lastFlowIds.get(targetUid+targetDid+flowType);
        if(!flowId){
            flowId = await this._getLastLocalFlowId(targetUid,targetDid,flowType);
            this._lastFlowIds.set(targetUid+targetDid+flowType,flowId);
        }
        return flowId;
    },
    setLastLocalFlowId:function (targetUid,targetDid,flowType,flowId) {
        this._lastFlowIds.set(targetUid+targetDid+flowType,flowId);
    },
    _getLastLocalFlowId:function (targetUid,targetDid,flowType) {
        return new Promise((resolve,reject)=>{
            let sql = `select MAX(preFlowId) as preFlowId from flow where targetUid=? and targetDid=? and flowType=?`;
            Pool.query(sql,[targetUid,targetDid,flowType], (error,results,fields) =>{
                if(error){
                    resolve(null);
                }else{
                    resolve(results[0]["preFlowId"]);
                }
            });
        });
    },
    asyGetLastForeignFlowId: async function (targetServerIP,targetServerPort,flowType) {
        let flowId = this._lastFlowIds.get(targetServerIP+targetServerPort+flowType);
        if(!flowId){
            flowId = await this._getLastForeignFlowId(targetServerIP,targetServerPort,flowType);
            this._lastFlowIds.set(targetServerIP+targetServerPort+flowType,flowId);
        }
        return flowId;
    },
    setLastForeignFlowId:function (targetServerIP,targetServerPort,flowType,flowId) {
        this._lastFlowIds.set(targetServerIP+targetServerPort+flowType,flowId);
    },
    _getLastForeignFlowId:function (targetServerIP,targetServerPort,flowType) {
        return new Promise((resolve,reject)=>{
            let sql = 'select MAX(preFlowId) as preFlowId from flow where targetServerIP=? and targetServerPort=? and flowType=?';
            Pool.query(sql,[targetServerIP,targetServerPort,flowType], (error,results,fields) =>{
                if(error){
                    resolve(null);
                }else{
                    resolve(results[0]["preFlowId"]);
                }
            });
        });
    },
    asyGetLocalFlow:function (msgId,targetUid,targetDid) {
        return new Promise((resolve,reject)=>{
            let sql = `
                select * 
                from flow 
                where flow.msgId = ?
                and targetUid = ?
                and targetDid = ?
            `;
            Pool.query(sql,[msgId,targetUid,targetDid], (error,results,fields) =>{
                if(error){
                    resolve(null);
                }else{
                    resolve(results[0]);

                }
            });
        });
    },
    asyGetForeignFlow:function (msgId,serverIP,serverPort) {
        return new Promise((resolve,reject)=>{
            let sql = `
                select * 
                from flow 
                where flow.msgId = ?
                and targetServerIP = ?
                and targetServerPort = ?
            `;
            Pool.query(sql,[msgId,serverIP,serverPort], (error,results,fields) =>{
                if(error){
                    resolve(null);
                }else{
                    resolve(results[0]);

                }
            });
        });
    },
    asyGetLocalFlowbyParentMsgId:function (parentId,targetUid,targetDid) {
        return new Promise((resolve,reject)=>{
            let sql = `
                select flow.* 
                from message,flow 
                where flow.msgId=message.id 
                and  message.parentId=? 
                and flow.targetUid = ?
                and flow.targetDid = ?
            `;
            Pool.query(sql,[parentId,targetUid,targetDid], (error,results,fields) =>{
                if(error){
                    resolve(null);
                }else{
                    resolve(results[0]);

                }
            });
        });
    },
    asyGetForeignFlowbyParentMsgId:function (parentId,serverIP,serverPort) {
        return new Promise((resolve,reject)=>{
            let sql = `
                select flow.* 
                from message,flow 
                where flow.msgId=message.id 
                and  message.parentId=? 
                and flow.targetServerIP = ?
                and flow.targetServerPort = ?
            `;
            Pool.query(sql,[parentId,serverIP,serverPort], (error,results,fields) =>{
                if(error){
                    resolve(null);
                }else{
                    resolve(results[0]);

                }
            });
        });
    },
    clearTimeoutMsgs:function () {
        return new Promise((resolve,reject)=>{
            let sql = `
                select id from message where (?-(unix_timestamp(time)*1000))>3*24*60*60*1000
            `;
            Pool.query(sql,[Date.now()], (error,results,fields) =>{
                if(error){
                    resolve();
                }else{
                    if(results.length>0){
                        let scope = "(";
                        for(let i=0;i<results.length;i++){
                            scope+="'"+results[i].id+"'";
                            if(i<results.length-1){
                                scope+=",";
                            }
                        }
                        scope+=")";
                        let sql1 = "delete from message where id in "+scope;
                        Pool.query(sql1,[],function (error,results,fields) {
                            if(error){
                                console.error("clearTimeoutMsgs delete messages:"+error.toString())
                            }

                        });
                        let sql2 = "delete from flow where msgId in "+scope;
                        Pool.query(sql2,[],function (error,results,fields) {
                            if(error){
                                console.error("clearTimeoutMsgs delete flows:"+error.toString())
                            }

                        });
                    }else{
                        resolve();
                    }

                }
            });
        });
    },
}
module.exports = Message;
