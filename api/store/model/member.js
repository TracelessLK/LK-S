const Sequelize = require('sequelize')
const uuidV4 = require('uuid/v4')
const config = require('../../../config')

const key = 'member'

const tableTitle = ''


module.exports = {
    key,
    modelContent:{
        name:{
            title:"姓名",
        },
        pic:{
            allowNull:true,
            displayPage:[],
            type:Sequelize.TEXT,
            title:"头像"
        },
        orgId:{
            allowNull:true,
            title:"组织ID"
        },
        mCode:{ //name,pic => hash
            allowNull:true,
            title:"节点hash值"
        },
        reserve1:{
            allowNull:true,
            type:Sequelize.TEXT,
        }
    },

    tableTitle,
}


