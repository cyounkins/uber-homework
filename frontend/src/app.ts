var mapboximport = require('mapbox.js');
import m = require('mithril');
var leaflet_draw = require('leaflet-draw');
var leaflet_geodesy = require('leaflet-geodesy');
import polyline = require('polyline');


L.mapbox.accessToken = 'pk.eyJ1IjoiY3lvdW5raW5zIiwiYSI6ImNpbnFtcGo5bTEwYTd0cWtqZjJnaGdheGcifQ.IoUfEsKhYimOdVDK3ORcOQ';
var map = L.mapbox.map('map', 'mapbox.streets');

var drawnElements = L.featureGroup().addTo(map);
var topPickupsLayer = L.mapbox.featureLayer().addTo(map);
var tripsLayer = L.multiPolyline(new Array<any>(), {color: 'red'}).addTo(map);

topPickupsLayer.on('mouseover', function(e) {
  // TODO cache this or send the trip data down with top_pickups
  var url = '/api/trips_from_start?point=' + e.latlng.lng + ',' + e.latlng.lat;

  m.request({method: "GET", url: url}).then(function(response) {
    var paths = response.trips.map(function(trip) {
      return polyline.decode(trip.path_polyline, 6);
    });

    tripsLayer.setLatLngs(paths);
  });
});

topPickupsLayer.on('mouseout', function(e) {
  tripsLayer.clearLayers();
});

var drawControl = new L.Control.Draw({
  edit: {
    featureGroup: drawnElements
  },
  draw: {
    polygon: true,
    polyline: false,
    rectangle: false,
    circle: false,
    marker: false
  }
}).addTo(map);

map.on('draw:created', showTopPickups);
map.on('draw:edited', showTopPickupsEdited);

function showTopPickupsEdited(e) {
  e.layers.eachLayer(function(layer) {
    showTopPickups({ layer: layer });
  });
}

function showTopPickups(e) {
  drawnElements.clearLayers();
  drawnElements.addLayer(e.layer);

  var qs = '';
  var points = e.layer.getLatLngs();
  for (var i = 0; i < points.length; i++) {
    qs += 'points=' + points[i].lng + ',' + points[i].lat + '&';
  }

  // Remove the trailing '&'
  qs = qs.substr(0, qs.length-1)

  var url = '/api/top_pickups?' + qs;
  m.request({method: "GET", url: url}).then(function(response) {
    var points = response.points.map(function(point) {
      point.properties['marker-symbol'] = point.rank.toString();
      point.properties.description = point.count + ' ' + (point.count > 1 ? 'trips' : 'trip') + ' from here';
      return point;
    });

    topPickupsLayer.setGeoJSON(points);
  });
}

map.setView([40.78885994449482, -73.88374328613281], 12);

