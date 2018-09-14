const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const xHub = require('koa-x-hub');

const fs = require('fs');
const exec = require('child_process').execSync;
const path = require('path');

const winston = require('winston');
const md = require('markdown-it')({});

const generateHTML = require('./generateHTML');

md.use(require('markdown-it-emoji'));
md.use(require('markdown-it-anchor'), {
  slugify: s => s.replace(/^Version ([\w\.]+)$/, 'v$1')
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

const port = 1337;
const host = 'localhost';

const xhubSecret = process.env.X_HUB_SECRET;
const projectPath = process.env.PROJECT_PATH;

const app = new Koa();
const router = new Router();

const content = fs.readFileSync(path.join(projectPath, 'CHANGELOG.md'), 'utf8');
const changelog = md.render(content);

// logger
app.use(async (ctx, next) => {
  await next();
  const rt = ctx.response.get('X-Response-Time');
  logger.info(`${ctx.method} ${ctx.url} - ${rt}`);
});

// x-response-time
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  ctx.set('X-Response-Time', `${ms}ms`);
});

app.use(bodyParser()).use(xHub({ algorithm: 'sha1', secret: xhubSecret }));

router.get('/', (ctx, next) => {
  try {
    ctx.body = generateHTML(changelog);
  } catch (e) {
    ctx.throw(500, e);
  }
});

router.post('/webhook', (ctx, next) => {
  if (!ctx.request.isXHub) {
    ctx.throw(400, 'Missing X-Hub parameter');
  }

  if (!ctx.request.isXHubValid()) {
    ctx.throw(403, 'Invalid X-Hub parameter');
  }

  const command = ctx.request.get('x-github-event');

  switch (command) {
    case 'ping':
      ctx.body = { result: 'OK' };
      logger.info('Webhook received. Ping OK');
      break;
    case 'push':
      ctx.body = { result: 'OK' };
      logger.info('Webhook received. Pulling last changes');
      exec(`git -C ${translationsDir} pull origin master`);
      fetchingLocales();
      break;
    default:
      ctx.throw(400, `Event '${command}' not supported`);
  }
});

// error handler
app.on('error', (err, ctx) => {
  logger.error(err.message);
});

app.use(router.routes()).use(router.allowedMethods());

app.listen(port);
