import got = require('got');
import parse = require('csv-parse');
import r = require('rethinkdb');
// import heapdump = require('heapdump');
import memwatch = require('memwatch-next');

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


function ensure_database_exists(): Promise<void> {
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
      r.table(config.rethink.table)
      .indexWait(config.rethink.geo_index).run(conn)
      .catch(function() {
        console.log("IndexWait threw error");
      })
      .then(function() {
        return r.table(config.rethink.table).delete().run(conn);
      })
      .catch(function() {
        console.log("Clearing table threw error");
      })
      .then(function() {
        console.log("Table and index are available");
        conn.close();
        resolve();
      })
      .catch(function(err) {
        // The database/table/index was not available, create them
        r.dbCreate(config.rethink.connection_params.db).run(conn)
        .catch(function() {
          console.log("Database already exists");
        })
        .then(function() {
          return r.tableCreate(config.rethink.table).run(conn);
        })
        .catch(function() {
          console.log("Table already exists");
        })
        .then(function() {
          return r.table(config.rethink.table).indexCreate(config.rethink.geo_index, {geo: true}).run(conn);
        })
        .catch(function() {
          console.log("Table index already exists");
        })
        .then(function() {
          return r.table(config.rethink.table).indexWait(config.rethink.geo_index).run(conn);
        })
        .catch(function() {
          console.log("IndexWait threw error");
        })
        .then(function() {
          return r.table(config.rethink.table).delete().run(conn);
        })
        .catch(function() {
          console.log("Clearing table threw error");
        })
        .then(function() {
          console.log("Table and index are available");
          conn.close();
          resolve();
        })
        .catch(function(err) {
          console.log("Could not wait for the completion of the index");
          console.log(err);
          process.exit(1);
        });
      });
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

      function firstHandler() {
        // Eat the first line because it's the header
        parser.read();
        parser.removeListener('readable', firstHandler);
        parser.on('readable', mainHandler);
      }

      let numberProcessed = 0;
      let recordBuffer = new Array<Object>();
      let inserts_in_flight = 0;
      const max_inserts_in_flight = 100;
      let old_heap;

      function mainHandler() {
        let record;

        while ((inserts_in_flight <= max_inserts_in_flight) && (record = parser.read())) {
          // console.log(record);
          recordBuffer.push(record);
          numberProcessed += 1;

          if (numberProcessed % 1000 == 0) {
            // if (old_heap != undefined) {
            //   let diff = old_heap.end();
            //   console.log(diff);
            //   for (let i = 0; i < diff.change.details.length; i++) {
            //     console.log(diff.change.details[i]);
            //   }
            // }
            // old_heap = new memwatch.HeapDiff();

            console.log(process.memoryUsage());
            console.log(numberProcessed);
          }

          while (recordBuffer.length >= 2) {
            const record_start = recordBuffer.shift();
            const record_end = recordBuffer.shift();

            // Don't make routes that are from point A to A
            if (record_start[2] != record_end[2] || record_start[1] != record_end[1]) {
              inserts_in_flight += 1;

              r.table('trips').insert({
                date: new Date(Date.parse(record_start[0])),
                path: r.line([parseFloat(record_start[2]), parseFloat(record_start[1])],
                             [parseFloat(record_end[2]), parseFloat(record_end[1])]),
                base: record_start[3]
              }).run(conn, {durability: "soft"})
              .then(function() {
                inserts_in_flight -= 1;

                parser.emit('readable');
              })
            }
          }
        }
      }

      parser.on('readable', firstHandler);
      parser.on('finish', function() {
        resolve();
      });

      got
        .stream(url)
        .pipe(parser);
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

ensure_database_exists()
.then(function() {
  return series(foo)
});


