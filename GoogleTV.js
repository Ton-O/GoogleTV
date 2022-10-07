//const path = require('path');
//const metacontrol = require(path.join(__dirname,'metaController'));
//const logger = require('logger').createLogger();
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });
const fs = require('fs');
const { createLogger,transports,format} = require('winston');
const { combine, timestamp, json } = format;
const logger = createLogger({
    defaultMeta: { component: 'G-TV' },
    format: format.combine(
        format.timestamp({
            format: 'YYMMDD-HH:mm:ss'
        }),
        format.json(),
        format.printf(info => {
            return `${info.timestamp} ${info.level}: ${info.message}`;
          })
      ),
   transports: [
       new transports.Console({ level: 'debug' })
     ]
 });
// const {userLogger, paymentLogger} = require('./logger');

const {AndroidRemote} = require('androidtv-remote')
const {RemoteKeyCode} = require('androidtv-remote')
const {RemoteDirection} = require('androidtv-remote')

const express = require('express');

const server = express();
const bodyParser = require('body-parser');
var Connections = []
var MyandroidRemote;
var MyHost;
var MyCert = {cert: "",key:""}

async function getSession(MyHost,MyCerts) {
_this = this 
return new Promise(function (resolve, reject) {

let host = MyHost 
let options = {
    pairing_port : 6467,
    remote_port : 6466,
    name : 'androidtv-remote', 
    cert : MyCerts}
    _this.MyandroidRemote = new AndroidRemote(host, options)

    _this.MyandroidRemote.on('secret', () => {
        readline.question("Code : ", async (code) => {
            _this.MyandroidRemote.sendCode(code);
            let NewCert = MyCert;
            if (NewCert.key.length == 0)  { 
                logger.info("Need to get new certificate")
                NewCert = _this.MyandroidRemote.getCertificate();
                logger.info(JSON.stringify(NewCert))
    
            }
            fs.writeFile('./.ssh/GoogleCert.pem',  JSON.stringify(NewCert.cert), function(err) {
                if (err) throw err;
                console.log('Write cert complete');
                });  
            fs.writeFile('./.ssh/GoogleKey.pem',    JSON.stringify(NewCert.key), function(err) {
                if (err) throw err;
                console.log('Write key complete');
                });  
        });
    });

    _this.MyandroidRemote.on('powered', (powered) => {
        //console.debug("Powered : " + powered)        
        logger.debug(`Powered: ${powered}`);
    });

    _this.MyandroidRemote.on('volume', (volume) => {
        logger.debug(`Volume: ${volume.level} / ${volume.maximum} | Muted : " + ${volume.muted}`);
    });

    _this.MyandroidRemote.on('current_app', (current_app) => {
        logger.debug(`Current App : ${current_app}`);
    });

    _this.MyandroidRemote.on('error', (error) => {
        logger.debug(`Error: ${error}`);
    });

    _this.MyandroidRemote.on('unpaired', () => {
        logger.debug(`Unpaired`);
    });

    _this.MyandroidRemote.on('ready',  () => {
        logger.debug(`Connection with GoogleTV is ready`);
        resolve( _this.MyandroidRemote)

        //        await new Promise(resolve => setTimeout(resolve, 2000));
    });
    _this.MyandroidRemote.start().then (() => {
    })
    
  })
}
async function LoadCert()
{
    fs.access('GoogleCert.pem', fs.constants.F_OK | fs.constants.W_OK, (err) => {
        if (err) {
            logger.info("No certificates to load")
        } else {
            logger.info("Certificates available, we can load them")
            }
        });
    fs.exists('GoogleCert.pem', function(exists) {

        if (exists) {
            let cert = fs.readFileSync('./.ssh/GoogleCert.pem')
            let key = fs.readFileSync('./.ssh/GoogleKey.pem')
            MyCert.cert = JSON.parse(cert)
            MyCert.key = JSON.parse(key)
            logger.info("Certificates loaded")
        }
        else   
            logger.info("No certificates to load")

        }
    )
}

async function main() {
    //var Return = getSession()
    await LoadCert();
    logger.info(`Loaded cert: ${MyCert}`)
	server.use(bodyParser.json());
	server.use(bodyParser.urlencoded({
			extended: true
	}));
    let config = {
        "webPort" : 6468,
        "friendlyDeviceName" : "GoogleTV"
        } 

//		server.use(connCheck);   // Always check if connection is established already

	server.listen(config.webPort, () => {
		logger.info(`Webserver running on port: ${config.webPort}`);
        //getSession(); // removed from here, as we now support multiple devices
    });
		
	server.get("/shutdown", (req, res, next) => {
        res.sendFile(__dirname + '/index.html');
    });
    server.get("/api", (req, res, next) => {
        logger.info(`GTV: ${req.body}`)
        logger.info(`GET GoogleTV Call for ${req.body.host}`)
        MyHost = req.body.host;
        switch(req.body.action){
            case 'sendKey':
                sendKey(req.body.key);
                break;						
            case 'sendAction':
                sendKey(req.body.theAction);
                break;            
            case 'sendAppLink':
                sendAppLink(req.body.AppLink);
                break;            
                // am start -a android.intent.action.VIEW -n org.xbmc.kodi/.Splash
            default:
                res.json({"Status": "Error"});
                return;
                break;
        }
        res.json({"Status": "Ok"});
    });


    server.post("/api", (req, res, next) => {
        logger.info(`GoogleTV Call for ${req.body.host}`)
        MyHost = req.body.host;
        switch(req.body.action){
            case 'sendKey':
                logger.info("sending key")
                sendKey(req.body.key);
                break;						
            case 'sendAction':
                sendKey(req.body.theAction);
                break;            
            case 'sendAppLink':
                sendAppLink(req.body.AppLink);
                break;            
                // am start -a android.intent.action.VIEW -n org.xbmc.kodi/.Splash
            default:
                res.json({"Status": "Error"});
                return;
                break;
        }
        res.json({"Status": "Ok"});
    });
}

async function sendKey(key) {
    logger.debug(`Send key: ${key}; ${RemoteKeyCode[key]}`);

    GetConnection(MyHost).then  ((androidRemote) => {
        androidRemote.sendKey(RemoteKeyCode[key], RemoteDirection.SHORT)
    })
};

async function sendAppLink(AppLink) {
    logger.debug(`Send appLink: ${AppLink}`);

    GetConnection(MyHost).then  ((androidRemote) => {
        androidRemote.sendAppLink(AppLink);
    })
};

function GetConnection(MyHost) {
  return new Promise(function (resolve, reject) {

    let Connecton = ""
    logger.debug(`Checking availability of connection`);
    let connectionIndex = Connections.findIndex((con) => {return con.Host == MyHost});
    if  (connectionIndex < 0) {
        logger.debug(`Connection not yet created, doing now for: ${MyHost}`)
        getSession(MyHost,MyCert).then ((Connection) => { 
	        GotSession(Connection);
            //connectionIndex = Connections.findIndex((con) => {return con.Host == MyHost});
            //MyandroidRemote = Connections[connectionIndex].Connector
            MyandroidRemote = Connection;
            resolve(Connection); // MyandroidRemote)
        })
	}
    else {
        MyandroidRemote = Connections[connectionIndex].Connector
        resolve(MyandroidRemote)
    }
    })
 }
function GotSession(Connection) {
    MyandroidRemote = Connection 
    Connections.push({"Host": MyHost, "Connector": Connection});
}
main();








