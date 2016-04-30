import got = require('got');
import parse = require('csv-parse');
import r = require('rethinkdb');
import highland = require('highland');

const config = {
  rethink: {
    connection_params: {
      host: '127.0.0.1',
      port: 28015,
      db: 'test'
    },

    table: 'trips',
    geo_index: 'path'
  }
};


function reset_database(): Promise<void> {
  return new Promise<void>(function(resolve, reject) {
    r.connect(config.rethink.connection_params)
    .catch(function(err) {
      if (err) {
        console.log("Could not open a connection to initialize the database");
        console.log(err.message);
        process.exit(1);
      }
    })
    .then(function(conn) {
      console.log("Resetting database")
      r.tableDrop(config.rethink.table).run(conn)
      .catch(function() {
        console.log("tableDrop threw error");
      })
      .then(function() {
        console.log("Creating table");
        return r.tableCreate(config.rethink.table).run(conn);
      })
      .catch(function() {
        console.log("tableCreate threw error");
      })
      .then(function() {
        console.log("ready for insert");
        conn.close();
        resolve();
      })
    });
  });
}


function add_index(): Promise<void> {
  return new Promise<void>(function(resolve, reject) {
    r.connect(config.rethink.connection_params)
    .catch(function(err) {
      if (err) {
        console.log("Could not open a connection to initialize the database");
        console.log(err.message);
        process.exit(1);
      }
    })
    .then(function(conn) {
      console.log("Adding index");
      r.table(config.rethink.table).indexCreate(config.rethink.geo_index, {geo: true}).run(conn)
      .catch(function() {
        console.log("indexCreate threw error");
      })
      .then(function() {
        console.log("Waiting for index to finish building");
        return r.table(config.rethink.table).indexWait(config.rethink.geo_index).run(conn);
      })
      .catch(function() {
        console.log("IndexWait threw error");
      })
      .then(function() {
        console.log("Index created");
        conn.close();
        resolve();
      })
    });
  });
}


function load_csv(url:string): Promise<void> {
  return new Promise<void>(function(resolve, reject) {
    console.log("starting to process " + url);
    r.connect(config.rethink.connection_params)
    .catch(function(err) {
      if (err) {
        console.log("Could not open a connection to initialize the database");
        console.log(err.message);
        process.exit(1);
      }
    })
    .then(function(conn) {
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
          date: new Date(Date.parse(record_start[0])),
          path: r.line([parseFloat(record_start[2]), parseFloat(record_start[1])],
                       [parseFloat(record_end[2]), parseFloat(record_end[1])]),
          base: record_start[3]
        };
      }

      function insert(err, elements, push, next) {
        if (err) {
          // pass errors along the stream and consume next value
          push(err);
          next();
        }
        else if (elements === highland.nil) {
          // pass nil (end event) along the stream
          push(null, highland.nil);
        }
        else {
          total_processed += elements.length;
          console.log(total_processed);

          r.table('trips').insert(elements).run(conn, {durability: "soft"})
          .then(function() {
            next();
          });
        }
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
        .batch(200) // N objects to insert at a time
        .consume(insert)
        .done(function() {
          conn.close();
          resolve();
        });
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
.then(add_index);
