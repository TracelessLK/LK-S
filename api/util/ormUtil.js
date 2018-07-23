const Sequelize = require('sequelize')
const uuidV4 = require('uuid/v4')
const  _ = require("lodash")
const commonUtil = require('./commonUtil')
const sequelizeUtil = require('./sequelizeUtil')



const ormUtil = {
    getOrmModel(option){
        const {modelAry,dict,database} = option
        function getModelWrapper(model){
            let {key,modelContent,classification,tableTitle,afterSync} = model

            const tableName = key

            const modelObj = {
                id: {
                    type: Sequelize.STRING,
                    primaryKey:true,
                    displayPage:[]
                },
                ...modelContent,
                extra:{
                    type: Sequelize.JSON,
                    allowNull:true,
                    title:"额外信息或者用于改变表结构",
                    displayPage:[]
                }
            }

            sequelizeUtil.preProcessModelObj({
                modelObj,
                dict
            })
            let modelObjParam  = _.cloneDeep(modelObj)

            let modelSequelized =   database.define(tableName,modelObjParam, {
                paranoid:false,
                freezeTableName:true
            })
            modelSequelized.sync().then(()=>{
                if(afterSync){
                    afterSync(modelSequelized)
                }
            })
            return {
                modelObj,
                modelSequelized,
                classification,
                tableTitle,
                tableName,
            }
        }

        let result = {}

        for(let model of modelAry){
            let {key} = model
            result[key] = getModelWrapper(model)
        }
        return result
    },
    getOrmService(option){
        let {ormModel,uniqueServiceAry} = option
        if(!uniqueServiceAry){
            uniqueServiceAry = []
        }
        const ormService = {}

        for(let item of uniqueServiceAry){
            ormService[item.key] = item
        }
        for(let key in ormModel){
            const {modelObj} = ormModel[key]

            if(!ormService[key]){
                ormService[key] = {}
            }

            ormService[key] = {
                ...ormService[key],
                addRecord(record){
                    preProcess(record,modelObj)

                    if(!record.id){
                        record.id = uuidV4()
                    }
                    return ormModel[key].modelSequelized.create(record)
                },
                addRecordMultiple(recordAry){
                    let promiseAry = []
                    for(let record of recordAry){
                        promiseAry.push(this.addRecord(record))
                    }
                    return Promise.all(promiseAry)
                },
                deleteRecord(record){
                    ormModel[key].modelSequelized.destroy({
                        where:{
                            id:record.id
                        }
                    })
                },
                deleteRecordMultiple(ary){
                    let promises = []
                    for(let record of ary){
                        let promise = this.deleteRecord(record)
                        promises.push(promise)
                    }
                    return Promise.all(promises)
                },
                getAllRecords(){
                    return ormModel[key].modelSequelized.findAll({
                            order:sequelizeUtil.defaultOrder
                        }
                    )
                },
                getFirstRecord(){
                    return ormModel[key].modelSequelized.findOne({
                            where:{

                            }
                        }
                    )
                },
                queryByCondition(queryCondition){
                    let where = {}
                    for(let key in queryCondition){
                        let value = queryCondition[key]
                        if(value){
                            let fieldObj = modelObj[key]
                            const {isCascade,isInteger,isDouble} = fieldObj
                            if(fieldObj.isDateFormat || fieldObj.isTimeFormat){
                                let valueTemp = _.cloneDeep(value)

                                if(valueTemp[0] && valueTemp[1]){
                                    if(typeof valueTemp[0] === 'object'){
                                        valueTemp[1] = new Date(valueTemp[1].getFullYear(),valueTemp[1].getMonth(),valueTemp[1].getDate()+1)
                                    }else{
                                        console.log('in query condition value of date format is string')
                                    }
                                    where[key] = {
                                        [Op.between]:valueTemp
                                    }
                                }else if(!valueTemp[0] && valueTemp[1]){
                                    valueTemp[1] = new Date(valueTemp[1].getFullYear(),valueTemp[1].getMonth(),valueTemp[1].getDate()+1)
                                    where[key] = {
                                        [Op.lte]:valueTemp[1]
                                    }
                                }else if(valueTemp[0] && !valueTemp[1]){
                                    where[key] = {
                                        [Op.gte]:valueTemp[0]
                                    }
                                }
                            }else if(fieldObj.dictType && !isCascade || isInteger) {
                                where[key] = value
                            }else if(isDouble){
                                let intVal = parseInt(value)
                                where[key] = {
                                    [Op.between]:[intVal,intVal+1]
                                }
                            }else if(!fieldObj.isArray){
                                where[key] = {
                                    [Op.like]:`%${value}%`
                                }
                            }
                        }
                    }


                    return new Promise((resolve,reject)=>{
                        ormModel[key].modelSequelized.findAll({
                            where,
                            order:sequelizeUtil.defaultOrder
                        }).then(records=>{
                            for(let key in queryCondition) {
                                let value = queryCondition[key]
                                if (value) {
                                    let fieldObj = modelObj[key]
                                    const {isArray,isDateRange,isCascade} = fieldObj
                                    if(isArray){
                                        if(isDateRange){
                                            records = records.filter((record)=>{
                                                let timeRangeAry = record[key]
                                                if(typeof timeRangeAry === 'string'){
                                                    timeRangeAry = JSON.parse(timeRangeAry)
                                                    console.log(timeRangeAry)
                                                    console.log(key)
                                                    console.log('should be array,not string')
                                                }


                                                let condition1 = true
                                                let condition2 = true
                                                if(value[0]){
                                                    condition1 = new Date(timeRangeAry[0]).getTime() >= value[0].getTime()
                                                }
                                                if(value[1]){
                                                    condition2 = new Date(timeRangeAry[1]).getTime() <= value[1].getTime()
                                                }
                                                return  condition1 && condition2

                                            })
                                        }else if(isCascade && value.length > 0){
                                            records = records.filter((record)=>{
                                                let valTem = record[key]
                                                return valTem.join(',') === value.join(',')
                                            })
                                        }else{
                                            records = records.filter((record)=>{
                                                let valTem = record[key]
                                                return valTem.join(',').includes(value)
                                            })
                                        }
                                    }
                                }
                            }
                            resolve(records)
                        })
                    })
                },
                queryExact(queryCondition){

                   return ormModel[key].modelSequelized.findAll({
                        where:queryCondition,
                        order:sequelizeUtil.defaultOrder
                    })
                },
                updateRecord(record){
                    preProcess(record,modelObj)


                    return ormModel[key].modelSequelized.update(record,{
                        where:{
                            id:record.id
                        }
                    })
                },
                updateRecordById(record,id){
                    if(!id && record.id){
                        id = record.id
                    }
                    preProcess(record,modelObj)
                    return ormModel[key].modelSequelized.update(record,{
                        where:{
                            id
                        }
                    })
                }
            }
        }


        return ormService


    }
}


function preProcess(record,modelObj){
    for(let key in modelObj){
        let value = record[key]
        if(modelObj.hasOwnProperty(key)){
            const fieldObj = modelObj[key]
            if(!value){
                if(fieldObj.isDateFormat || fieldObj.isTimeFormat ){
                    record[key] = null
                }
            }
            const {computed} = fieldObj
            if(computed){
                record[key] = computed(record)
            }
        }
    }
}


function notNullCondition(value){
    let result = value && !Array.isArray(value)
    result = result || (value && Array.isArray(value) && (value[0]||value[1]))

    return result
}

function compare(record,queryCondition){
    let result = true
    for(let keyInqueryCondition in queryCondition){
        if(!record[keyInqueryCondition] || !queryCondition[keyInqueryCondition]){
            result = false
            break
        }
        const isSame = JSON.stringify(queryCondition[keyInqueryCondition]).trim() !== JSON.stringify(record[keyInqueryCondition]).trim()
        if(isSame){
            result = falsecrypto.createHash('md5')
            break
        }
    }

    return result
}

module.exports = ormUtil
