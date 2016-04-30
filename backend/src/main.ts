import * as koa from "koa"
import serve = require("koa-static");
import mount = require("koa-mount");
import * as koa_router from 'koa-router';
import request = require('request');
import parse = require('csv-parse');
import r = require('rethinkdb');

const app = new koa();
const router = new koa_router();

// x-response-time

app.use(function *(next){
  const start = new Date().getTime();
  yield next;
  const ms = new Date().getTime() - start;
  this.set('X-Response-Time', ms + 'ms');
});


// logger

app.use(function *(next){
  const start = new Date().getTime();
  yield next;
  const ms = new Date().getTime() - start;
  console.log('%s %s - %s', this.method, this.url, ms);
});


// static

app.use(mount('/static', serve('../frontend/build')));


// responses under /api

router.get('/hello', function *(next) {
  this.body = 'hello';
});

app
  .use(mount('/api', router.routes()))
  .use(mount('/api', router.allowedMethods()));


app.listen(3000);


