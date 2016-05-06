import got      = require('got');
import parse    = require('csv-parse');
import highland = require('highland');
import * as pgPromise from 'pg-promise';

var pgp = pgPromise();

var db = pgp({
  host: '127.0.0.1', 
  port: 5432,
  database: 'uber',
  user: 'uber',
  password: 'moo'
});

function reset_database(): Promise<void> {
  return new Promise<void>(function(resolve, reject) {
    db.none("DROP TABLE IF EXISTS trips")
    .catch(function (error) {
        console.log("DROP TABLE statement threw error");
        console.log(error);
    })
    .then(function () {
        return db.none("CREATE TABLE trips (id SERIAL PRIMARY KEY, start_time timestamp, start_point geometry(POINT,4326), end_time timestamp, end_point geometry(POINT,4326), duration_sec int4, path_polyline text)");
    })
    .catch(function (error) {
        console.log("CREATE TABLE statement threw error");
        console.log(error);
    })
    .then(function () {
        resolve();
    });
  });
}


function load_csv(url:string): Promise<void> {
  return new Promise<void>(function(resolve, reject) {
    console.log("starting to process " + url);
    const parser = parse({delimiter: ','})  
    .on('error', function(err){
      console.log(err.message);
    });

    let total_processed = 0;

    function points_not_same(elements) {
      if (elements.length < 1) {
        console.log("err what");
        process.exit(1);
      }
      else if (elements.length == 1) {
        // don't pass
        return false;
      }
      else {
        const record_start = elements[0];
        const record_end = elements[1];
        // pass if start and end locations are not the same
        return (record_start[2] != record_end[2] || record_start[1] != record_end[1]);
      }
    }

    function convert_pair_to_object(elements) {
      if (elements.length != 2) {
        console.log("err what");
        process.exit(1);
      }

      const record_start = elements[0];
      const record_end = elements[1];

      return {
        start_time: new Date(Date.parse(record_start[0])),
        start_lat:  parseFloat(record_start[1]),
        start_lng:  parseFloat(record_start[2]),
        end_time:   undefined,
        end_lat:    parseFloat(record_end[1]),
        end_lng:    parseFloat(record_end[2]),
        path:       undefined
      };
    }

    function add_directions(obj) {
      return highland(new Promise<any>(function(resolve, reject) {
        url = "https://api.mapbox.com/v4/directions/mapbox.driving/" + obj.start_lng + ',' + obj.start_lat + 
          ';' + obj.end_lng + ',' + obj.end_lat + '.json' + '?access_token=pk.eyJ1IjoiY3lvdW5raW5zIiwiYSI6ImNpbnFtcGo5bTEwYTd0cWtqZjJnaGdheGcifQ.IoUfEsKhYimOdVDK3ORcOQ' +
          '&steps=false&geometry=polyline';
          
        got
        .get(url, {json: true})
        .then(function(response) {
          obj.duration_sec = response.body.routes[0].duration;
          obj.end_time = new Date(obj.start_time.getTime() + obj.duration_sec * 1000);
          obj.path = response.body.routes[0].geometry;

          resolve(obj);
        });
      }));
    }

    function insert(obj) {
      return highland(new Promise<any>(function(resolve, reject) {
        total_processed += 1;
        if (total_processed % 100 == 0) {
          console.log(total_processed);
        }

        db.none("INSERT INTO trips(start_time, start_point, end_time, end_point, duration_sec, path_polyline) VALUES($1, ST_SetSRID(ST_Point($2, $3),4326), $4, ST_SetSRID(ST_Point($5, $6),4326), $7, $8)", 
          [obj.start_time, obj.start_lng, obj.start_lat, obj.end_time, obj.end_lng, obj.end_lat, obj.duration_sec, obj.path])
        .then(function () {
          resolve(obj);
        })
        .catch(function (error) {
          // error;
          console.log(error);
          reject(error);
        });
      }));
    }

    highland(
      got
        .stream(url)
        .pipe(parser)
    ) // convert to highland stream
    .drop(1)  // drop the header
    .batch(2) // 2 records at a time
    .filter(points_not_same) // make sure the start and end are not the same
    .map(convert_pair_to_object)
    .ratelimit(50, 100)
    .flatMap(add_directions)
    .flatMap(insert)
    .done(function() {
      resolve();
    });
  });
}

function series(methods) {
  var promise = Promise.resolve();

  return Promise.all(methods.map(method => {
    return promise = promise.then(method);
  }));
}

let foo = [
  load_csv.bind(undefined, 'https://github.com/fivethirtyeight/uber-tlc-foil-response/raw/master/uber-trip-data/uber-raw-data-apr14.csv'),
  load_csv.bind(undefined, 'https://github.com/fivethirtyeight/uber-tlc-foil-response/raw/master/uber-trip-data/uber-raw-data-may14.csv'),
  load_csv.bind(undefined, 'https://github.com/fivethirtyeight/uber-tlc-foil-response/raw/master/uber-trip-data/uber-raw-data-jun14.csv'),
  load_csv.bind(undefined, 'https://github.com/fivethirtyeight/uber-tlc-foil-response/raw/master/uber-trip-data/uber-raw-data-jul14.csv'),
  load_csv.bind(undefined, 'https://github.com/fivethirtyeight/uber-tlc-foil-response/raw/master/uber-trip-data/uber-raw-data-aug14.csv')
];

reset_database()
.then(function() {
  return series(foo)
})
.then(function() {
  pgp.end();
});




