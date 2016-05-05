import * as koa from "koa"
import serve = require("koa-static");
import mount = require("koa-mount");
import * as koa_router from 'koa-router';
import parse = require('csv-parse');
import * as pgPromise from 'pg-promise';

var pgp = pgPromise();


var db = pgp({
  host: '127.0.0.1', 
  port: 5432,
  database: 'uber',
  user: 'uber',
  password: 'moo'
});

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


function query_to_linestring(points) {
  // Coerce to array
  if (points.constructor === String) {
    points = [points];
  }

  // Split lat/long and convert to float
  points = points.map(function(point) {
    return point.split(',').map(parseFloat);
  });

  var linestring = "LINESTRING(";
  for (var i = 0; i < points.length; i++) {
    linestring += (points[i][0] +
      ' ' + points[i][1] + ',');
  }

  linestring += points[0][0] + ' ' + points[0][1] + ')';

  return linestring;
}


router.get('/containedTrips', function *(next) {
  var linestring = query_to_linestring(this.request.query.points);

  db.many("SELECT start_point, count(*) as count FROM trips WHERE ST_Within (start_point, ST_Polygon(ST_GeomFromText($1), 4326)) AND ST_Within (end_point, ST_Polygon(ST_GeomFromText($1), 4326)) GROUP BY start_point ORDER BY count DESC LIMIT $2", 
    [linestring, this.request.query.limit || 10])
  .then(function(data) {
    console.log(data);
  })
  .catch(function (error) {
      console.log("SELECT statement threw error");
      console.log(error);
  })
});

router.get('/commonStart', function *(next) {
  var linestring = query_to_linestring(this.request.query.points);

  db.many("SELECT ST_AsGeoJSON(start_point), count(*) as count FROM trips WHERE ST_Within (start_point, ST_Polygon(ST_GeomFromText($1), 4326)) GROUP BY start_point ORDER BY count DESC LIMIT $2", 
    [linestring, this.request.query.limit || 10])
  .then(function(data) {
    console.log(data);
  })
  .catch(function (error) {
      console.log("SELECT statement threw error");
      console.log(error);
  })
});


router.get('/trips_in_polygon', function *(next) {
  var linestring = query_to_linestring(this.request.query.points);
  var that = this;

  yield db.many("SELECT id, ST_AsGeoJSON(start_point) as start_point, ST_AsGeoJSON(end_point) as end_point, path_polyline FROM trips WHERE ST_Within (start_point, ST_Polygon(ST_GeomFromText($1), 4326)) AND ST_Within (end_point, ST_Polygon(ST_GeomFromText($1), 4326))", 
    [linestring])
  .then(function(data) {
    data = data.map(function(row) {
      row.start_point = JSON.parse(row.start_point);
      row.end_point = JSON.parse(row.end_point);
      return row;
    })
    that.response.body = JSON.stringify(data);
  })
  .catch(function (error) {
      console.log("SELECT statement threw error");
      console.log(error);
  })
});

router.get('/all_trips', function *(next) {
  var that = this;

  yield db.many("SELECT id, ST_AsGeoJSON(start_point) as start_point, ST_AsGeoJSON(end_point) as end_point, path_polyline FROM trips")
  .then(function(data) {
    data = data.map(function(row) {
      row.start_point = JSON.parse(row.start_point);
      row.end_point = JSON.parse(row.end_point);
      return row;
    })
    that.response.body = JSON.stringify(data);
  })
  .catch(function (error) {
      console.log("SELECT statement threw error");
      console.log(error);
  })
});

app
  .use(mount('/api', router.routes()))
  .use(mount('/api', router.allowedMethods()));


app.listen(3000);


