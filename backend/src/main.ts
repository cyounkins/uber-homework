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
const redirect_router = new koa_router();

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

// Redirect

redirect_router.redirect('/', '/static/main.html');
app.use(redirect_router.routes());
app.use(redirect_router.allowedMethods());

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
    linestring += (points[i][0] + // lon
      ' ' + points[i][1] + ',');  // lat
  }

  linestring += points[0][0] + ' ' + points[0][1] + ')';

  return linestring;
}


router.get('/top_pickups', function *(next) {
  var linestring = query_to_linestring(this.request.query.points);

  try {
    var data = yield db.many("SELECT ST_AsGeoJSON(start_point) as start_point, count(*) as count FROM trips WHERE ST_Within (start_point, ST_Polygon(ST_GeomFromText($1), 4326)) GROUP BY start_point ORDER BY count DESC LIMIT $2", 
      [linestring, this.request.query.limit || 10]);
    var obj = {status: 'ok', points: []};
    var rank = 1;

    for (var i = 0; i < data.length; i++) {
      obj.points.push({
        type: 'Feature',
        geometry: JSON.parse(data[i].start_point),
        properties: {},
        count: parseInt(data[i].count),
        rank: rank
      });

      rank += 1;
    }

    this.response.body = JSON.stringify(obj);
  }
  catch (err) {
    // no rows
    this.response.body = JSON.stringify({
      status: 'ok',
      points: []
    });
  }
});

router.get('/trips_from_start', function *(next) {
  var lngLat = this.request.query.point.split(',');

  try {
    var data = yield db.many("SELECT ST_AsGeoJSON(end_point) as end_point, path_polyline FROM trips WHERE start_point = ST_SetSRID(ST_Point($1, $2),4326)", 
      [lngLat[0], lngLat[1]]);
    var obj = {status: 'ok', trips: []};

    for (var i = 0; i < data.length; i++) {
      obj.trips.push({
        end_point: JSON.parse(data[i].end_point),
        path_polyline: data[i].path_polyline
      });
    }

    this.response.body = JSON.stringify(obj);
  }
  catch (err) {
    // no rows
    this.response.body = JSON.stringify({
      status: 'ok',
      trips: []
    });
  }
});


router.get('/trips_in_polygon', function *(next) {
  var linestring = query_to_linestring(this.request.query.points);

  try {
    var data = db.many("SELECT id, ST_AsGeoJSON(start_point) as start_point, ST_AsGeoJSON(end_point) as end_point, path_polyline FROM trips WHERE ST_Within (start_point, ST_Polygon(ST_GeomFromText($1), 4326)) AND ST_Within (end_point, ST_Polygon(ST_GeomFromText($1), 4326))", 
      [linestring]);

    var data = data.map(function(row) {
      row.start_point = JSON.parse(row.start_point);
      row.end_point = JSON.parse(row.end_point);
      return row;
    });

    this.response.body = JSON.stringify(data);
  }
  catch (err) {
    console.log("SELECT statement threw error");
    console.log(err);
  }
});


router.get('/all_trips', function *(next) {
  try {
    var data = yield db.many("SELECT id, ST_AsGeoJSON(start_point) as start_point, ST_AsGeoJSON(end_point) as end_point, path_polyline FROM trips")
    
    data = data.map(function(row) {
      row.start_point = JSON.parse(row.start_point);
      row.end_point = JSON.parse(row.end_point);
      return row;
    });

    this.response.body = JSON.stringify(data);
  }
  catch (err) {
    console.log("SELECT statement threw error");
    console.log(err);
  }
});

app
  .use(mount('/api', router.routes()))
  .use(mount('/api', router.allowedMethods()));


app.listen(3000);


