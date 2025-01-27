import { spawn } from "child_process";
import ffmpeg from "ffmpeg-static";
import got from "got";
import { ffmpegArgs, genericUserAgent } from "../config.js";
import { metadataManager, msToTime } from "../sub/utils.js";

export function streamDefault(streamInfo, res) {
    try {
        let format = streamInfo.filename.split('.')[streamInfo.filename.split('.').length - 1];
        let regFilename = !streamInfo.mute ? streamInfo.filename : `${streamInfo.filename.split('.')[0]}_mute.${format}`;
        res.setHeader('Content-disposition', `attachment; filename="${streamInfo.isAudioOnly ? `${streamInfo.filename}.${streamInfo.audioFormat}` : regFilename}"`);
        const stream = got.get(streamInfo.urls, {
            headers: {
                "user-agent": genericUserAgent
            },
            isStream: true
        });
        stream.pipe(res).on('error', () => {
            res.end();
        });
        stream.on('error', () => {
            res.end();
        });
    } catch (e) {
        res.end();
    }
}
export function streamLiveRender(streamInfo, res) {
    try {
        if (streamInfo.urls.length !== 2) {
            res.end();
            return;
        }
        let audio = got.get(streamInfo.urls[1], { isStream: true });

        let format = streamInfo.filename.split('.')[streamInfo.filename.split('.').length - 1], args = [
            '-loglevel', '-8',
            '-i', streamInfo.urls[0],
            '-i', 'pipe:3',
            '-map', '0:v',
            '-map', '1:a',
        ];
        args = args.concat(ffmpegArgs[format])
        if (streamInfo.time) args.push('-t', msToTime(streamInfo.time));
        args.push('-f', format, 'pipe:4');
        let ffmpegProcess = spawn(ffmpeg, args, {
            windowsHide: true,
            stdio: [
                'inherit', 'inherit', 'inherit',
                'pipe', 'pipe'
            ],
        });
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Content-Disposition', `attachment; filename="${streamInfo.filename}"`);
        res.on('error', () => {
            ffmpegProcess.kill();
            res.end();
        });
        ffmpegProcess.stdio[4].pipe(res).on('error', () => {
            ffmpegProcess.kill();
            res.end();
        });;
        audio.pipe(ffmpegProcess.stdio[3]).on('error', () => {
            ffmpegProcess.kill();
            res.end();
        });

        ffmpegProcess.on('disconnect', () => ffmpegProcess.kill());
        ffmpegProcess.on('close', () => ffmpegProcess.kill());
        ffmpegProcess.on('exit', () => ffmpegProcess.kill());
        res.on('finish', () => ffmpegProcess.kill());
        res.on('close', () => ffmpegProcess.kill());
        ffmpegProcess.on('error', () => {
            ffmpegProcess.kill();
            res.end();
        });

    } catch (e) {
        res.end();
    }
}
export function streamAudioOnly(streamInfo, res) {
    try {
        let args = [
            '-loglevel', '-8',
            '-i', streamInfo.urls
        ]
        if (streamInfo.metadata) {
            if (streamInfo.metadata.cover) { // currently corrupts the audio
                args.push('-i', streamInfo.metadata.cover, '-map', '0:a', '-map', '1:0')
            } else {
                args.push('-vn')
            }
            args = args.concat(metadataManager(streamInfo.metadata))
        }
        let arg = streamInfo.copy ? ffmpegArgs["copy"] : ffmpegArgs["audio"]
        args = args.concat(arg)
        if (ffmpegArgs[streamInfo.audioFormat]) args = args.concat(ffmpegArgs[streamInfo.audioFormat]);
        args.push('-f', streamInfo.audioFormat === "m4a" ? "ipod" : streamInfo.audioFormat, 'pipe:3');
        const ffmpegProcess = spawn(ffmpeg, args, {
            windowsHide: true,
            stdio: [
                'inherit', 'inherit', 'inherit',
                'pipe'
            ],
        });
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Content-Disposition', `attachment; filename="${streamInfo.filename}.${streamInfo.audioFormat}"`);
        ffmpegProcess.stdio[3].pipe(res);

        ffmpegProcess.on('disconnect', () => ffmpegProcess.kill());
        ffmpegProcess.on('close', () => ffmpegProcess.kill());
        ffmpegProcess.on('exit', () => ffmpegProcess.kill());
        res.on('finish', () => ffmpegProcess.kill());
        res.on('close', () => ffmpegProcess.kill());
        ffmpegProcess.on('error', () => {
            ffmpegProcess.kill();
            res.end();
        });
    } catch (e) {
        res.end();
    }
}
export function streamVideoOnly(streamInfo, res) {
    try {
        let format = streamInfo.filename.split('.')[streamInfo.filename.split('.').length - 1], args = [
            '-loglevel', '-8',
            '-i', streamInfo.urls,
            '-c', 'copy', '-an'
        ]
        if (format === "mp4") args.push('-movflags', 'faststart+frag_keyframe+empty_moov')
        args.push('-f', format, 'pipe:3');
        const ffmpegProcess = spawn(ffmpeg, args, {
            windowsHide: true,
            stdio: [
                'inherit', 'inherit', 'inherit',
                'pipe'
            ],
        });
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Content-Disposition', `attachment; filename="${streamInfo.filename.split('.')[0]}_mute.${format}"`);
        ffmpegProcess.stdio[3].pipe(res);

        ffmpegProcess.on('disconnect', () => ffmpegProcess.kill());
        ffmpegProcess.on('close', () => ffmpegProcess.kill());
        ffmpegProcess.on('exit', () => ffmpegProcess.kill());
        res.on('finish', () => ffmpegProcess.kill());
        res.on('close', () => ffmpegProcess.kill());
        ffmpegProcess.on('error', () => {
            ffmpegProcess.kill();
            res.end();
        });
    } catch (e) {
        res.end();
    }
}
