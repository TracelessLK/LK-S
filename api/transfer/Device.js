

const Pool = require('../store/pool');
const Log = require('./Log');
let Device = {
    asyGetDevice:function (did) {
        return new Promise((resolve,reject)=>{
            let sql = `
                select * from device
                where id=?
            `;
            Pool.query(sql,[did], (error,results,fields) =>{
                if(error){
                    resolve(null);
                }else if(results.length==0){
                    resolve(null);
                }else{
                    resolve(results[0]);
                }
            });
        });
    },
    asyAddDevice:function (uid,did,venderDid,pk,des) {
        return new Promise((resolve,reject)=>{
            let sql = `
                insert into device
                set ?
            `;
            Pool.query(sql,{id:did,memberId:uid,venderDid:venderDid,pk:pk,description:des,lastActiveTime:new Date(),alive:1}, (error,results,fields) =>{
                if(error){
                    reject(error);
                }else{
                    resolve();
                }
            });
        });
    },
    asyUpdateVenderDid:function (uid,did,venderDid) {
        return new Promise((resolve,reject)=>{
            let sql = `
                update device
                set venderDid=?
                where id=? and memberId=?
            `;
            Pool.query(sql,[venderDid,did,uid], (error,results,fields) =>{
                if(error){
                    reject(error);
                }else{
                    resolve();
                }
            });
        });
    },
    asyRemoveDevice:function (uid,did) {
        return new Promise((resolve,reject)=>{
            let sql = `
                delete from device
                where id=?
            `;
            Pool.query(sql,[did], (error,results,fields) =>{
                if(error){
                    reject(error);
                }else{
                    resolve();
                }
            });
        });
    },
    asyGetDevices:function (uid) {
        return new Promise((resolve,reject)=>{
            let sql = `
                select * from device
                where memberId=?
            `;
            Pool.query(sql,[uid], (error,results,fields) =>{
                if(error){
                    resolve(null);
                }else{
                    resolve(results);
                }
            });
        });
    }
}
module.exports = Device;
