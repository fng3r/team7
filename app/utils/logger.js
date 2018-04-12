import bunyan from 'bunyan';
import Bunyan2Loggly from 'bunyan-loggly';
import bunyanFormat from 'bunyan-format';
import { sendMessageFor } from 'simple-telegram-message';
import config from '../config';


const bufferLength = 10;
const bufferTimeout = 500;
const requestSerializer = (request) => {
    const { method, url, headers } = bunyan.stdSerializers.req(request);
    const user = request.user || {};

    return {
        method, url, userAgent: headers['user-agent'], user: user.userId || 'Not logged'
    };
};

const consoleStream = {
    level: config.CONSOLE_LOG_LEVEL,
    stream: bunyanFormat({ outputMode: 'long' })
};

const getLevelName = level => ({
    10: 'trace',
    20: 'debug',
    30: 'info',
    40: 'warn',
    50: 'error',
    60: 'fatal'
}[level]);

const getTelegramStream = (chatId) => {
    const tg = sendMessageFor(config.TELEGRAM_BOT_TOKEN, chatId);
    const stream = {
        write(obj) {
            const {
                name, hostname, pid, level, err, request, msg
            } = obj;
            const lines = [`[${getLevelName(level)}] <i>${name}/${pid} on ${hostname}:</i>`];
            if (err) {
                lines.push(`<code>${err.name}</code> was thrown: <code>${err.message}</code>`);
            } else {
                lines.push(`<code>${msg}</code>`);
            }
            if (request) {
                lines.push(`<pre>${JSON.stringify(request, null, 2)}</pre>`);
            }
            tg(lines.join('\n')).catch(() => {
                // eslint-disable-next-line no-console
                console.error(`Failed to send telegram log (chatId=${chatId})`);
            });
        }
    };

    return {
        type: 'raw',
        level: 'error',
        stream
    };
};

const getTelegramStreams = () => config.TELEGRAM_CHAT_IDS.map(getTelegramStream);

const getLogglyStream = name => ({
    type: 'raw',
    stream: new Bunyan2Loggly({
        token: config.LOGGLY_TOKEN,
        subdomain: config.LOGGLY_SUBDOMAIN,
        tags: ['nodejs-server', `env-${config.IS_PRODUCTION ? 'production' : 'test'}`, name]
    }, bufferLength, bufferTimeout)
});

export default (name) => {
    const streams = [consoleStream];
    if (config.TELEGRAM_BOT_TOKEN) {
        streams.push(...getTelegramStreams());
    }
    if (config.LOGGLY_SUBDOMAIN) {
        streams.push(getLogglyStream(name));
    }

    return bunyan.createLogger({
        name,
        streams,
        serializers: {
            err: bunyan.stdSerializers.err,
            res: bunyan.stdSerializers.res,
            request: requestSerializer
        }
    });
};
