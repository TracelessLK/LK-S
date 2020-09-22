
const Pool = require('../store/pool');
const Log = require('./Log');
let ticket = {
    asyGetTicket:function (id) {
        return new Promise((resolve,reject)=>{
            let sql = `
                select (unix_timestamp(startTime)*1000) as startTime,timeout,checkCode from ticket
                where id=?
            `;
            Pool.query(sql,[id], (error,results,fields) =>{
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
    asyGetTicketByMemberId:function (id) {
        return new Promise((resolve,reject)=>{
            let sql = `
                select (unix_timestamp(startTime)*1000) as startTime,timeout,checkCode from ticket
                where memberId=?
            `;
            Pool.query(sql,[id], (error,results,fields) =>{
                if(error){
                    resolve(null);
                }else if(results.length==0){
                    resolve(null);
                }else{
                    resolve(results[0]);
                }
            });
        });
    }
}
module.exports = ticket;
