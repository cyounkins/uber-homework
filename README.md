
Story
-----

At first I figured I would import all the data into RethinkDB, then query it using the included [geospatial operators](http://rethinkdb.com/api/javascript/#polygon).

Off I went to set up my development environment. Best practices suggest using Docker containers with 1 service per container, so I set up Dockerfiles for node and rethinkdb. But wait, how does one handle file 'watching' with webpack/gulp/nodemon? Use those utilities within the container or outside the container to rebuild the container? The first makes dev diffirent from production, and the second is slow. 

I used Vagrant to set up an Ubuntu VM to host the docker containers. I think I encountered an issue with bridged networking and combined with the above file 'watching' issue I decided to scrap the containers and just run the services on the VM. I had already spent too much time setting this environment up.

I knew I wanted to use JavaScript on both frontend and backend, so I got to setting up an environment with those. I had previously read an opinion piece on [state of the art JavaScript in 2016](https://medium.com/javascript-and-opinions/state-of-the-art-javascript-in-2016-ab67fc68eb0b#.g196zzyle) and agreed with most of what it said. Webpack is the new hotness, replacing gulp? OK I might as well learn that now. I get TypeScript and the webpack plugin for TypeScript.

I tried to get this Typescript -> Webpack build [pattern for backend code](http://jlongster.com/Backend-Apps-with-Webpack--Part-I) working for about an hour. I ran into issues with TypeScript's emitted module types coupled with webpacks bundling mechanism and some other issue I don't recall at this point. Frustrated at lack of progress, I scrapped webpack and used gulp.

Finally, some code! The import script is working, but what's this? It slows to a crawl and then halts due to heap allocation? Weird, I guess there's a memory leak? I tried and failed to get node-inspector working (just crashes when attempting to profile??). I decide to use the heapdump module instead. OK, looks like there are massive arrays of strings of code being made? What on earth? Thinking on it, I had a hunch, and I was right. The streaming CSV parser ripped through the files quickly before the entries could be inserted into the database. Because I was inserting them asynchronously, memory filled with inserts in flight being tracked. Backpressure was needed.

I learned a bit more about stream processing in node and decide to use stream utility library [highland](http://highlandjs.org/), which is quite wonderful. I refactored to make the pipeline cleaner, batch inserts, then pause the pipeline until that write request had succeeded. Not perfect, but much better.

To the mapping! I guess I'll use Google Maps, right? Nice, a heatmap tool built-in for client-side rendering. I did some quick math and figured it was too much data to process client side. I'll need to process it server-side.

Oh I see, I just need to build the tile images myself. I go off looking for how to do this, finding a few crappy tile server implementations in node. It looks like everyone uses the OpenStreetMaps data connected to PostGIS. If there's an existing solution I might as well use it, so I move the Uber data into Postgres, install PostGIS, etc. I used osm2pgsql to import the OSM data. Digging more into PostGIS, it looks great with the power I need for this application. 

Oh, pg-routing! That looks perfect for routing pickup to dropoff since we don't know the actual route taken. Much better to have the actual path than just an impossible straight line. [OSM data isn't routable](https://gis.stackexchange.com/questions/30183/how-to-get-started-with-pgrouting-and-osm)? Ughh, fine I'll use osm2pgrouting. ["unknown maxspeed value: xx mph"](https://github.com/pgRouting/osm2pgrouting/issues/29)? Fine, I'll build it from source and spend 20 mins chasing down dependencies.

So I get the data in and browse it a little. Now it should be routable, but what about travel time? Looks like the data includes the speed limit, so we can make a first order approximation. Oh. [Speed defaults to 50 kph](https://github.com/pgRouting/osm2pgrouting/blob/master/src/OSMDocumentParserCallback.cpp#L184). In NYC.

Approximately concurrently with setting up pg-routing, I was trying to set up Mapnik to render the tiles. [Infinite build recursion??](https://github.com/mapnik/node-mapnik/issues/640) I don't even know what I expected...

As I poke more around the GIS community, Mapbox comes up multiple times, so I check it out. They have some good tutorials and documentation, and they have some APIs for directions. Scrapping all the OSM data, pg-routing, and Mapnik, I decide to just use their web API to maintain my sanity. It gives me the routing as well as the travel time estimates, but it's a rate limited HTTP API. I change my load script to use it, rate limit, and store the results in PostGIS.

I get started with the Mapbox tools using Mapbox GL. Mapbox GL, unlike Mapbox JS, does not use the Leaflet JS framework. Unable to find an existing implementation, I create a component to draw polygons on the map. Wait, what's [this example?](https://www.mapbox.com/mapbox.js/example/v1.0.0/show-polygon-area/). Ah, Mapbox JS with Leaflet components. OK let's do that instead.

From there everything was pretty smooth. I got the frontend connected to the backend and displaying all the trips with their polyline routes, then the selecting the top pickups from within the polygon. 


Conclusions
-----------

I spent a long time setting up a proper dev environment, with things like Docker, webpack, and Typescript. These things were not necessary for this project, but I wanted to show what I would do/use for a real project that was expected to be maintained and built upon.

The JavaScript ecosystem changes preferences faster than a teenager.


Problems
--------

Ubuntu VM would sometimes consume all CPU it could and lock up. No response via SSH or HTTP. Did not pursue. Possibly Virtualbox issue?

OSM dataset has incomplete speed limits.


Future work
-----------

To show a heatmap of the pickup locations or the routes, some pre-processing must be done on the server. There is too much data for either frontend or backend to process quickly enough for the system to be responsive. I thought about bucketing the points, and found [a nice article](http://www.sebastianmeier.eu/2014/06/01/heattile-a-new-method-for-heatmap-implementations-for-mobile-web-based-cartographic-applications/) describing exactly what I was thinking.

Add ability to control query LIMIT.

Show end markers of routes on hover.

Add filters for time of day.

Type interfaces for JSON structures going over HTTP.

Move SQL queries in main.ts out into separate files.

Abstract interface to data instead of forced through HTTP.

After abstract interface, unit testing.
