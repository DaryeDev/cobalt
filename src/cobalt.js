import "dotenv/config";

import express from "express";
import cors from "cors";
import * as fs from "fs";
import rateLimit from "express-rate-limit";

import { appName, genericUserAgent, version } from "./modules/config.js";
import { getJSON } from "./modules/api.js";
import renderPage from "./modules/pageRender/page.js";
import { apiJSON, checkJSONPost, languageCode } from "./modules/sub/utils.js";
import { Bright, Cyan, Green, Red } from "./modules/sub/consoleText.js";
import stream from "./modules/stream/stream.js";
import loc from "./localization/manager.js";
import { buildFront } from "./modules/build.js";
import { changelogHistory } from "./modules/pageRender/onDemand.js";
import { sha256 } from "./modules/sub/crypto.js";


const app = express();
app.use(cors());

app.disable('x-powered-by');

if (fs.existsSync('./.env') && process.env.streamSalt) {
    const apiLimiter = rateLimit({
        windowMs: 60000,
        max: 12,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res, next, opt) => {
            res.status(429).json({ "status": "error", "text": loc(languageCode(req), 'ErrorRateLimit') });
        }
    });
    const apiLimiterStream = rateLimit({
        windowMs: 60000,
        max: 12,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res, next, opt) => {
            res.status(429).json({ "status": "error", "text": loc(languageCode(req), 'ErrorRateLimit') });
        }
    });

    await buildFront();
    app.use('/api/', apiLimiter);
    app.use('/api/stream', apiLimiterStream);
    app.use('/', express.static('./min'));
    app.use('/', express.static('./src/front'));

    app.use((req, res, next) => {
        try {
            decodeURIComponent(req.path)
        }
        catch (e) {
            return res.redirect(process.env.selfURL);
        }
        next();
    });
    app.use((req, res, next) => {
        if (req.header("user-agent") && req.header("user-agent").includes("Trident")) {
            res.destroy()
        }
        next();
    });
    app.use('/api/json', express.json({
        verify: (req, res, buf) => {
            try {
                JSON.parse(buf);
                if (buf.length > 720) throw new Error();
                if (String(req.header('Content-Type')) !== "application/json") res.status(500).json({ 'status': 'error', 'text': 'invalid content type header' })
                if (String(req.header('Accept')) !== "application/json") res.status(500).json({ 'status': 'error', 'text': 'invalid accept header' })
            } catch(e) {
                res.status(500).json({ 'status': 'error', 'text': 'invalid json body.' })
            }
        }
    }));

    app.post('/api/:type', async (req, res) => {
        try {
            let ip = sha256(req.header('x-forwarded-for') ? req.header('x-forwarded-for') : req.ip.replace('::ffff:', ''), process.env.streamSalt);
            let lang = languageCode(req);
            switch (req.params.type) {
                case 'json':
                    try {
                        let request = req.body;
                        request.dubLang = request.dubLang ? lang : false;
                        let chck = checkJSONPost(request);
                        if (request.url && chck) {
                            chck["ip"] = ip;
                            let j = await getJSON(chck["url"], lang, chck)
                            res.status(j.status).json(j.body);
                        } else if (request.url && !chck) {
                            let j = apiJSON(0, { t: loc(lang, 'ErrorCouldntFetch') });
                            res.status(j.status).json(j.body);
                        } else {
                            let j = apiJSON(0, { t: loc(lang, 'ErrorNoLink') })
                            res.status(j.status).json(j.body);
                        }
                    } catch (e) {
                        res.status(500).json({ 'status': 'error', 'text': loc(lang, 'ErrorCantProcess') })
                    }
                    break;
                default:
                    let j = apiJSON(0, { t: "unknown response type" })
                    res.status(j.status).json(j.body);
                    break;
            }
        } catch (e) {
            res.status(500).json({ 'status': 'error', 'text': loc(languageCode(req), 'ErrorCantProcess') })
        }
    });

    app.get('/api/:type', (req, res) => {
        try {
            let ip = sha256(req.header('x-forwarded-for') ? req.header('x-forwarded-for') : req.ip.replace('::ffff:', ''), process.env.streamSalt);
            switch (req.params.type) {
                case 'stream':
                    if (req.query.p) {
                        res.status(200).json({ "status": "continue" });
                    } else if (req.query.t && req.query.h && req.query.e) {
                        stream(res, ip, req.query.t, req.query.h, req.query.e);
                    } else {
                        let j = apiJSON(0, { t: "no stream id" })
                        res.status(j.status).json(j.body);
                    }
                    break;
                case 'onDemand':
                    if (req.query.blockId) {
                        let blockId = req.query.blockId.slice(0, 3)
                        let r, j;
                        switch(blockId) {
                            case "0":
                                r = changelogHistory();
                                j = r ? apiJSON(3, { t: r }) : apiJSON(0, { t: "couldn't render this block" })
                                break;
                            default:
                                j = apiJSON(0, { t: "couldn't find a block with this id" })
                                break;
                        }
                        res.status(j.status).json(j.body);
                    } else {
                        let j = apiJSON(0, { t: "no block id" })
                        res.status(j.status).json(j.body);
                    }
                    break;
                case "getVideoInfo":
                    console.log("query");
                    try {
                        let domain = req.query.url.match(
                            /^[\w-]+:\/{2,}\[?([\w\.:-]+)\]?(?::[0-9]*)?/
                        )[1];
                        switch (domain) {
                            case "www.youtube.com":
                                var requestOptions = {
                                    method: 'GET',
                                    redirect: 'follow'
                                };
                                
                                var getYoutubeIdByUrl = function( url ){
                                    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
                                    var match = url.match(regExp);
                                    
                                    if(match&&match[7].length==11){ 
                                        return match[7];
                                    }
                                    
                                    return false;
                                    };

                                fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet&id="+getYoutubeIdByUrl(req.query.url)+"&key="+process.env.G_KEY, requestOptions)
                                    .then(response => response.json())
                                    .then(result => {
                                        res.status(200).json({ 'status': 'data', 'data': result });
                                    })
                                    .catch(error => console.log('error', error));
                                break;
                        
                            default:
                                res.status(400).json({ 'status': 'error', 'data': "platformNotSupported" });
                                break;
                        }
                    } catch (e) {
                        console.log(e)
                        res.status(0).json({ 'status': 'error', 'data': e });
                    }
                    break;
                default:
                    let j = apiJSON(0, { t: "unknown response type" })
                    res.status(j.status).json(j.body);
                    break;
            }
        } catch (e) {
            res.status(500).json({ 'status': 'error', 'text': loc(languageCode(req), 'ErrorCantProcess') })
        }
    });

    app.get("/api", (req, res) => {
        res.redirect('/api/json')
    });
    app.get("/", (req, res) => {
        res.send(renderPage({
            "hash": "",
            "type": "default",
            "lang": languageCode(req),
            "useragent": req.header('user-agent') ? req.header('user-agent') : genericUserAgent,
            "branch": ""
        }))
    });
    app.get("/favicon.ico", (req, res) => {
        res.redirect('/icons/favicon.ico');
    });
    app.get("/*", (req, res) => {
        res.redirect('/')
    });

    app.listen(8080, () => {
        let startTime = new Date();
        console.log(`\n${Cyan(appName)} ${Bright(`v.${version} ()`)}\nStart time: ${Bright(`${startTime.toUTCString()} (${Math.floor(new Date().getTime())})`)}\n\nURL: ${Cyan(`${process.env.selfURL}`)}\n`)
    });
} else {
    console.log(Red(`cobalt hasn't been configured yet or configuration is invalid.\n`) + Bright(`please run the setup script to fix this: `) + Green(`npm run setup`))
}
