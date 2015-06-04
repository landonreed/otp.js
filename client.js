
$(document).ready(function() {

  var OTP = require('otpjs');
  var log = OTP.log('client');

  // set up the leafet map object
  L.mapbox.accessToken = 'pk.eyJ1IjoiYXRscmVnaW9uYWwiLCJhIjoiQmZ6d2tyMCJ9.oENm3NSf--qHrimdm9Vvdw';
  var map = L.mapbox.map('map', window.OTP_config.osmMapKey).setView(window.OTP_config.initLatLng, (window.OTP_config
    .initZoom || 13));
  // var map = L.map('map').setView(window.OTP_config.initLatLng, (window.OTP_config
  //   .initZoom || 13));
  map.attributionControl.setPrefix('');

  // create OpenStreetMap tile layers for streets and aerial imagery
  // var osmLayer = L.tileLayer('http://{s}.tiles.mapbox.com/v3/' + window.OTP_config
  //   .osmMapKey + '/{z}/{x}/{y}.png' + '?access_token=pk.eyJ1IjoiYXRscmVnaW9uYWwiLCJhIjoiQmZ6d2tyMCJ9.oENm3NSf--qHrimdm9Vvdw', {
  //     subdomains: ['a', 'b', 'c', 'd'],
  //     attribution: 'Street Map <a href="//mapbox.com/about/maps">Terms & Feedback</a>'
  //   });
  // var aerialLayer = L.tileLayer('http://{s}.tiles.mapbox.com/v3/' + window.OTP_config
  //   .aerialMapKey + '/{z}/{x}/{y}.png'  + '?access_token=pk.eyJ1IjoiYXRscmVnaW9uYWwiLCJhIjoiQmZ6d2tyMCJ9.oENm3NSf--qHrimdm9Vvdw', {
  //     subdomains: ['a', 'b', 'c', 'd'],
  //     attribution: 'Satellite Map <a href="//mapbox.com/about/maps">Terms & Feedback</a>'
  //   });

  // create a leaflet layer control and add it to the map
  // var baseLayers = {
  //   'Street Map': osmLayer,
  //   'Satellite Map': aerialLayer
  // };
  // L.control.layers(baseLayers).addTo(map);

  // display the OSM street layer by default
  // osmLayer.addTo(map);

  // disable map drag on mobile
  if( /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ) {
    map.dragging.disable();
  }

  // create the main OTP trip plan request model and point it to the API
  var requestModel = new OTP.models.PlanRequest();
  requestModel.urlRoot = window.OTP_config.otpApi + 'plan';

  // create and render the main request view, which displays the trip
  // preference form
  var requestView = new OTP.RequestView({
    model: requestModel,
    map: map,
    el: $('#request')
  });

  // create and render the request map view, which handles the map-specific
  // trip request elements( e.g. the start and end markers)
  var requestMapView = new OTP.map_views.RequestMapView({
    model: requestModel,
    map: map
  });

  // create the main response view, which refreshes the trip narrative display
  // and map elements as the underlying OTP response changes
  var responseView = new OTP.PlanResponseView({
    narrative: $('#narrative'),
    map: map,
  });

  // instruct the response view to listen to relevant request model events

  var Router = Backbone.Router.extend({
    routes: {
      'start/:lat/:lon/:zoom': 'start',
      'start/:lat/:lon/:zoom/:routerId': 'startWithRouterId',
      'plan(?*querystring)': 'plan'
    },
    start: function(lat, lon, zoom) {
      map.setView(L.latLng(lat, lon), zoom);
    },
    startWithRouterId: function(lat, lon, zoom, routerId) {
      window.OTP_config.routerId = routerId;

      requestModel.urlRoot = window.OTP_config.otpApi + routerId + '/plan';
      map.setView(L.latLng(lat, lon), zoom);
    },
    plan: function(querystring) {
      log('loading plan from querystring');
      requestModel.fromQueryString(querystring);
    }
  });

  var router = new Router();

  requestModel.on('change', function() {
    log('replacing url');
    router.navigate('plan' + requestModel.toQueryString(), { trigger: false });
  });
  requestModel.on('success', function(response) {
    responseView.newResponse(null, response);
  });
  requestModel.on('failure', function(error) {
    log('handling failure');
    responseView.newResponse(error, false);
  });

  log('rendering request views');

  requestMapView.render();
  requestView.render();

  log('starting router');

  Backbone.history.start();

  // make the UI responsive to resizing of the containing window
  var resize = function() {
    var height = $(window).height();
    $('#map').height(height);
    $('#sidebar').height(height);
    map.invalidateSize();
  };
  $(window).resize(resize);
  resize();
});
