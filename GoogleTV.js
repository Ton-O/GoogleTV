//const path = require('path');
//const metacontrol = require(path.join(__dirname,'metaController'));
//const logger = require('logger').createLogger();

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
const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');


var Connections = []
var MyandroidRemote;
var MyHost;
var MyCert = {cert: "",key:""}
var NewCode
//const rl = readline.createInterface(process.stdin);

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

    _this.MyandroidRemote.on('secret', async () => {
        logger.info("Request received to enter secret code")
        while (NewCode == undefined)
            {
                 await ReadCode()
            }

        _this.MyandroidRemote.sendCode(NewCode);
        logger.info(`Request answered with  secret code ${NewCode}`)
        let NewCert = MyCert;
        if (NewCert.key.length == 0)  { 
            logger.info("Need to get new certificate")
            NewCert = _this.MyandroidRemote.getCertificate();
            logger.info(`Writing certificates to .ssh`)    
            fs.writeFile('/opt/meta/.ssh/GoogleCert.pem',  JSON.stringify(NewCert.cert), function(err) {
                if (err) throw err;
                logger.info('Write cert complete');
                });  
            fs.writeFile('/opt/meta/.ssh/GoogleKey.pem',    JSON.stringify(NewCert.key), function(err) {
                if (err) throw err;
                logger.info('Write key complete');
                });  
        }
    });

    _this.MyandroidRemote.on('powered', (powered) => {
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

async function ReadCode()
{
try {
    logger.info(`Obtaining secret Code (either from console or through post)`)
    const ac = new AbortController();
    const signal = ac.signal;
    
      const rl = readline.createInterface({ input, output });
      const timeoutInSeconds = 10;
      setTimeout(() => ac.abort(), timeoutInSeconds * 1000);
      try {
        const answer = await rl.question('Please provide the code shown on your TV', { signal });
        NewCode = answer;
        logger.info(`${answer.trim()} received`);
      } catch(err) {
        let message = '';
        if (NewCode != undefined) {
            message = "Received code online"
        }
        else 
            if(err.code === 'ABORT_ERR' ) {
                message = `Timeout waiting for secret code. Try again within ${timeoutInSeconds} seconds.`;
            }
            else
                message = "Error occurred: " + err;
        logger.info(message);
      } finally {
        rl.close();
      }
    }
    catch(err) {logger.info(`Error in Readcode ${err}`)}
}


async function LoadCert()
{
    fs.access('/opt/meta/.ssh/GoogleCert.pem', fs.constants.F_OK | fs.constants.W_OK, (err) => {
        if (err) {
            logger.info("No certificates to load")
        } else {
            logger.info("Certificates available, we can load them")
            let cert = fs.readFileSync('/opt/meta/.ssh/GoogleCert.pem')
            let key = fs.readFileSync('/opt/meta/.ssh/GoogleKey.pem')
            MyCert.cert = JSON.parse(cert)
            MyCert.key = JSON.parse(key)
            logger.info("Certificates loaded")            }
        });
/*    fs.exists('./.ssh/GoogleCert.pem', function(exists) {

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
    )*/
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
    server.post("/secret", async (req, res, next) => {
	logger.info(`Received secret code: ${req.body.secret}`);
        NewCode=req.body.secret
        res.json({"Status": "Thank you"});
    });

    server.get("/api",  (req, res, next) => {
        logger.info(`GTV: ${req.body}`)
        MyHost = req.body.host
        logger.info(`GET GoogleTV Call for ${MyHost}`)
         HandleApi(req,res,next)
    });
    server.post("/api",  (req, res, next) => {
        logger.info(`GTV: ${req.body}`)
        MyHost = req.body.host
        logger.info(`POST GoogleTV Call for ${MyHost}`)
         HandleApi(req,res,next)
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
 function HandleApi(req,res,next)
{
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
                logger.info(`resolve default`)
 //               resolve()
                return;
                break;
    }
    res.json({"Status": "Ok"});
}

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
