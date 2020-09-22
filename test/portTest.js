var http = require('http');
var fs = require('fs');

const port = process.argv[2]
console.log(port)

http.createServer(function (req, res) {
    res.end("success");
}).listen(port);