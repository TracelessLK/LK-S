const serverUtil = require('./unitTest/serverUtil.test')

const ping = serverUtil.ping()
ping.then( (event)=> {
    if(event.data !== 'undefined'){
        console.log(event.data)
        console.log("ping successfully!")
    }
})