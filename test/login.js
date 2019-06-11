const serverUtil = require('./unitTest/serverUtil.test')

const login = serverUtil.util('login')
login.then( (event)=> {
    if(event.data !== 'undefined'){
        console.log("login successfully!")
        console.log(event.data)
    }
})