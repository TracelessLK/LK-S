const mysql = require('mysql2')
const config = require('../../config')
const {ormModelPromise} = require('./ormModel')

const option = {
  connectionLimit: 5,
  host: 'localhost',
  user: config.db.username,
  password: config.db.password,
  database: config.db.database,
  multipleStatements: true
}
const pool = mysql.createPool(option)

createView()
const sqlAry = [
  'drop view if exists deviceView;create view deviceView as select t2.name,t1.* from device t1 join member t2 where t1.memberId = t2.id',
  `drop view if exists groupMemberView;
  create view groupMemberView as 
  select 
  t3.name groupName, t2.name memberName, t1.* 
  from 
  groupMember t1 
  join member t2 
  join groupChat t3
  where t1.memberId = t2.id
  and t1.gid = t3.id
  `,
  'drop view if exists memberView;create view memberView as select * from member',
  'drop view if exists groupChatView;create view groupChatView as select * from groupChat',
  'drop view if exists ticketView;create view ticketView as select t2.name,t1.* from ticket t1 join member t2 where t1.memberId = t2.id'
].join(';')

async function createView () {
  const ormModel = await ormModelPromise;
  const psAry = []

  for (let ele in ormModel) {
    const {modelSequelized} = ormModel[ele]
    psAry.push(modelSequelized.sync())
  }
  await Promise.all(psAry)
  await asyView(sqlAry)
  // drop and create view
}

async function asyView (sql) {
  return new Promise((resolve, reject) => {
    pool.getConnection(function (err, conn) {
      if (err) {
        resolve(null)
      } else {
        conn.query(sql)
        resolve(conn)
      }
      pool.releaseConnection(conn)
    })
  })
}

module.exports = pool
