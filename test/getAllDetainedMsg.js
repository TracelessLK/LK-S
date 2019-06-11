const serverUtil = require('./unitTest/serverUtil.test')

const getAllDetainedMsg = serverUtil.util('getAllDetainedMsg')
getAllDetainedMsg.then( (event)=> {
    if(event.data !== 'undefined'){
        console.log("getAllDetainedMsg successfully!")
        console.log(event.data)
    }
})