var express = require('express'),
    morgan = require('morgan'),
    app = express();

app.use(morgan('combined'));
app.use(express.static(__dirname + '/output'));
app.use("/", express.static(__dirname + '/output/index.html'));

var port = process.env.PORT || 5000;
app.listen(port);
console.log("Listening on " + port);
