import * as koa from "koa"
import serve = require("koa-static");
import mount = require("koa-mount");
import * as koa_router from 'koa-router';
import request = require('request');
import parse = require('csv-parse');
import r = require('rethinkdb');

const app = new koa();
var router = new koa_router();

// x-response-time

app.use(function *(next){
  var start = new Date().getTime();
  yield next;
  var ms = new Date().getTime() - start;
  this.set('X-Response-Time', ms + 'ms');
});


// logger

app.use(function *(next){
  var start = new Date().getTime();
  yield next;
  var ms = new Date().getTime() - start;
  console.log('%s %s - %s', this.method, this.url, ms);
});


// static

app.use(mount('/static', serve('../frontend/build')));


// responses under /api

router.get('/load', function *(next) {

  r.connect({
    host: '127.0.0.1',
    port: 28015,
    db: 'uber'
  }).then(function(connection) {
    const parser = parse({delimiter: ','})  
      .on('error', function(err){
        console.log(err.message);
      })

    function firstHandler () {
      // Eat the first line because it's the header
      parser.read();
      parser.removeListener('readable', firstHandler);
      parser.on('readable', mainHandler);
    }

    function mainHandler() {
      let record;
      while (record = parser.read()) {
        console.log(record);

        r.table('trips').insert({
          date: record[0],
          location: r.point(parseFloat(record[2]), parseFloat(record[1])),
          base: record[3]
        }).run(connection);
      }
    }

    parser.on('readable', firstHandler);
    parser.on('finish', function() {
      r.table('trips').indexCreate('location', {geo: true}).run(connection);
    });

    request
      .get('https://github.com/fivethirtyeight/uber-tlc-foil-response/raw/master/uber-trip-data/uber-raw-data-aug14.csv')
      .pipe(parser);
  });
});

app
  .use(mount('/api', router.routes()))
  .use(mount('/api', router.allowedMethods()));


app.listen(3000);


