
const Pool = require('../store/pool');
const Log = require('./Log');
let Member = {
    asyGetMember:function (uid) {
        return new Promise((resolve,reject)=>{
            let sql = `
                select * from member
                where id=? and orgId is not null
            `;
            Pool.query(sql,[uid], (error,results,fields) =>{
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
    asyGetMemberByName:function (name) {
        return new Promise((resolve,reject)=>{
            let sql = `
                select * from member
                where name=? and orgId is not null
            `;
            Pool.query(sql,[name], (error,results,fields) =>{
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
    asyGetAll:function () {
        return new Promise((resolve,reject)=>{
            let sql = `
                select * from member where orgId is not null order by id
            `;
            Pool.query(sql,[], (error,results,fields) =>{
                if(error){
                    resolve(null);
                }else{
                    resolve(results);
                }
            });
        });
    },
    asyGetAllMCodes:function () {
        return new Promise((resolve,reject)=>{
            let sql = `
                select id,mCode from member where orgId is not null
            `;
            Pool.query(sql,[], (error,results,fields) =>{
                if(error){
                    resolve(null);
                }else{
                    resolve(results);
                }
            });
        });
    },
    asyGetMembers:function (ids) {
        return new Promise((resolve,reject)=>{
            if(ids&&ids.length>0){
                let sql = "select * from member where id in(";
                for(let i=0;i<ids.length;i++){
                    sql += "?";
                    if(i<ids.length-1){
                        sql+=","
                    }
                }
                sql+=")";
                Pool.query(sql,ids, (error,results,fields) =>{
                    if(error){
                        console.info("asyGetMembers error:"+error.toString());
                        resolve(null);
                    }else{
                        resolve(results);
                    }
                });

            }else{
                resolve(null);
            }
        });
    },
    asyGetContact:function (uid) {
        return new Promise((resolve,reject)=>{
            let sql = `
                select * from member
                where id=?
            `;
            Pool.query(sql,[uid], (error,results,fields) =>{
                if(error){
                    reject();
                }else{
                    resolve(results[0]);
                }
            });
        });
    },

    asyAddContact:function (id,name,pic,serverIP,serverPort,mCode) {
        return new Promise((resolve,reject)=>{
            let sql = `
                insert into member
                set ?
            `;
            Pool.query(sql,{id:id,name:name,pic:pic,serverIP:serverIP,serverPort:serverPort,mCode:mCode}, (error,results,fields) =>{
                if(error){
                    reject(error);
                }else{
                    resolve();
                }
            });
        });
    },
    setUserName:function (id,name) {
        return new Promise((resolve,reject)=>{
            let sql = " update member set name=? where id=? ";
            Pool.query(sql,[name,id], (error,results,fields) =>{
                if(error){
                    reject(error);
                }else{
                    resolve();
                }
            });
        });
    },
    setUserPic:function (id,pic) {
        return new Promise((resolve,reject)=>{
            let sql = " update member set pic=? where id=? ";
            Pool.query(sql,[pic,id], (error,results,fields) =>{
                if(error){
                    reject(error);
                }else{
                    resolve();
                }
            });
        });
    },
    setMCode:function (id,mCode) {
        return new Promise((resolve,reject)=>{
            let sql = " update member set mCode=? where id=? ";
            Pool.query(sql,[mCode,id], (error,results,fields) =>{
                if(error){
                    reject(error);
                }else{
                    resolve();
                }
            });
        });
    }
}
module.exports = Member;
