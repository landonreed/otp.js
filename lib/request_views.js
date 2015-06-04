var Handlebars = require('handlebars');
var haversine = require('haversine');
var log = require('./log')('request-views');
var select2 = require('select2');

var BikeView = require('./bike_views');
var geocoder = require('./geocoder');

var requestFormTemplate = Handlebars.compile(require('./request-form.html'));

var RequestFormView = module.exports = Backbone.View.extend({

  events: {
    'change .apiParam': 'changeForm',
    'click .reverse-direction': 'reverseDirection',
    'click .search-button': 'changeForm',
    'change #mode': 'updateModeControls',
    'click .toggleSettings': 'toggleSettings',
    'click .first': 'first',
    'click .previous': 'previous',
    'click .next': 'next',
    'click .last': 'last'
  },

  first: function() {
    this.model.set({
      arriveBy: false,
      time: '12:01 am'
    });
  },

  previous: function() {
    var active = this.itineraries.activeItinerary;
    var date = moment(active.get('endTime')).subtract(1, 'minute');

    this.model.set({
      arriveBy: true,
      date: date.format('MM-DD-YYYY'),
      time: date.format('hh:mm a')
    });
  },

  next: function() {
    var active = this.itineraries.activeItinerary;
    var date = moment(active.get('startTime')).add(1, 'minute');

    this.model.set({
      arriveBy: false,
      date: date.format('MM-DD-YYYY'),
      time: date.format('hh:mm a')
    });
  },

  last: function() {
    this.model.set({
      arriveBy: false,
      time: '11:59 pm'
    });
  },

  setNextPreviousLastHidden: function(hidden) {
    if (hidden) {
      this.$('.nextPreviousLast').addClass('hidden');
    } else {
      this.$('.nextPreviousLast').removeClass('hidden');
    }
  },

  initialize: function(options) {
    this.options = options || {};
    _.bindAll(this, 'changeForm');

    var view = this;

    this.updatingForm = false;

    this.geocodeItem = Handlebars.compile([
      '<span class="title">{{text}}</span>',
      '<span class="description">{{#if city}}{{city}}, {{/if}}{{state}}</span>'
    ].join('\n'));

    this.selectedGeocodeItem = Handlebars.compile([
      '{{text}}{{#if city}}, {{city}}{{/if}}{{#if state}}, {{state}}{{/if}}'
    ].join('\n'));

    this.listenTo(this.model, 'change', function(data) {
      log('updating form with model changes');

      if (_.has(data.changed, 'fromPlace') && data.attributes.fromPlace && view.selectFrom) {
        view.updateReverseGeocoder('From', data.attributes.fromPlace, view.selectFrom);
      }

      if (_.has(data.changed, 'toPlace') && data.attributes.toPlace && view.selectTo) {
        view.updateReverseGeocoder('To', data.attributes.toPlace, view.selectTo);
      }

      if (data.attributes.arriveBy !== undefined) {
        view.$('#arriveBy').val(data.attributes.arriveBy + '');
      }

      if (data.attributes.mode) view.$('#mode').val(data.attributes.mode);
      if (data.attributes.maxWalkDistance) view.$('#maxWalkDistance').val(data.attributes.maxWalkDistance);
      if (data.attributes.optimize) view.$('#optimize').val(data.attributes.optimize);

      if (data.attributes.date) {
        var date = moment(data.attributes.date, 'MM-DD-YYYY').toDate();
        view.datepicker.setDate(date);
      }

      if (data.attributes.time) {
        var time = moment(data.attributes.time, 'hh:mm a').toDate();
        view.timepicker.setDate(time);
      }

      if (data.attributes.wheelchairAccessible) {
        view.$('#wheelchairAccessible').prop('checked', true);
      }

      view.updateModeControls();
    });

    this.listenTo(this.model, 'requesting', function() {
      view.deactivateSearchButton();
      view.setNextPreviousLastHidden(true);
    });

    this.listenTo(this.model, 'success', function(response) {
      view.activateSearchButton();
      view.setNextPreviousLastHidden(false);

      view.itineraries = response.get('itineraries');
    });

    this.listenTo(this.model, 'failure', function() {
      view.activateSearchButton();
      view.setNextPreviousLastHidden(true);
    });
  },

  updateReverseGeocoder: function(field, latlon, select) {
    log('updating %s with %s', field, latlon);
    var view = this;

    if (window.OTP_config.reverseGeocode) {
      view.updatingForm = true;
      geocoder.reverse(latlon, function(err, results) {
        if (err) {
          select.select2('data', []);
          select.select2('data', {
            text: field + ' marker location',
            id: latlon
          });
        } else {
          select.select2('data', null);
          results.text = field + ' ' + results.address;
          select.select2('data', results);
        }
        view.updatingForm = false;
      });
    } else {

      // this isn't great but appears to be neccesary as selectize triggers a change event even when programatically updated
      view.updatingForm = true;

      var item = {
        text: field + ' marker location',
        id: latlon
      };

      select.select2('data', item);

      view.updatingForm = false;
    }
  },

  render: function() {
    log('rendering request form view');
    var view = this;
    view.updatingForm = true;

    var html = requestFormTemplate({
      metric: this.options.metric || false
    });

    this.lastResults = [];

    this.$el.html(html);

    this.$('#hideSettings').hide();
    this.$('#hidableSettings').hide();
    this.$('#date').datetimepicker({
      pickTime: false
    });

    this.datepicker = this.$('#date').data('DateTimePicker');
    this.datepicker.setDate(new Date());
    this.$('#date').on('dp.change', function() {
      view.changeForm();
    });

    this.$('#time').datetimepicker({
      pick12HourFormat: true,
      pickSeconds: false,
      pickDate: false
    });

    this.timepicker = this.$('#time').data('DateTimePicker');
    this.timepicker.setDate(new Date());
    this.$('#time').on('dp.change', function() {
      view.changeForm();
    });

    var data = {
      date: this.$('#date input').val(),
      time: this.$('#time input').val(),
      maxWalkDistance: 8046
    };

    this.model.set(data);

    this.bikeTriangle = new BikeView({
      model: this.model,
      el: this.$('#bikeTriangle')
    });

    this.selectFrom = this.initializeSelectFor('from');
    this.selectTo = this.initializeSelectFor('to');

    this.updateModeControls();

    view.updatingForm = false;
  },

  changeForm: function(evt) {
    // skip duplicate change events caused by selectize form inputs
    if (this.updatingForm) return;

    this.updatingForm = true;
    log('form changed');

    var maxDistance = $('#mode').val().indexOf('WALK') != -1 ?
      $('#maxWalkDistance').val() : $('#maxBikeDistance').val();

    var data = {
      fromPlace: this.$('#fromPlace').select2('val'),
      toPlace: this.$('#toPlace').select2('val'),
      date: this.$('#date input').val(),
      time: this.$('#time input').val(),
      arriveBy: this.$('#arriveBy').val(),
      maxWalkDistance: maxDistance,
      optimize: this.$('#optimize').val(),
      mode: this.$('#mode').val(),
      wheelchairAccessible: this.$('#wheelchairAccessible').prop('checked')
    };

    // skip if either to/from fields are unset
    if (this.$('#fromPlace').select2('val') == 'not found')
      data.fromPlace = false;
    if (this.$('#toPlace').select2('val') == 'not found')
      data.toPlace = false;

    var mode = $('#mode').val();
    if (mode.indexOf('BICYCLE') != -1) {
      data.triangleSafetyFactor = $('#').val();
      data.triangleSlopeFactor = $('#').val();
      data.triangleTimeFactor = $('#').val();
    } else {
      this.model.unset('triangleSafetyFactor', {
        silent: true
      });
      this.model.unset('triangleSlopeFactor', {
        silent: true
      });
      this.model.unset('triangleTimeFactor', {
        silent: true
      });
    }

    this.model.set(data);
    this.updatingForm = false;
  },

  deactivateSearchButton: function() {
    log('deactivating search button');

    this.$('.search-button').addClass('hidden');
    this.$('.searching-button').removeClass('hidden');
  },

  activateSearchButton: function() {
    log('activating search button');

    this.$('.search-button').removeClass('hidden');
    this.$('.searching-button').addClass('hidden');
  },

  updateModeControls: function() {
    var mode = this.$('#mode').val();
    if (!mode) {
      this.$('#mode').val('TRANSIT,WALK');
      mode = 'TRANSIT,WALK';
    }

    // disabling maxWalkControl as we switch to soft walk dist limiting
    this.$el.find('.maxWalkControl').hide();

    if (mode.indexOf('BICYCLE') != -1 && mode.indexOf('TRANSIT') != -1) this
      .$el.find('.maxBikeControl').show();
    else this.$el.find('.maxBikeControl').hide();

    if (mode.indexOf('TRANSIT') != -1 && mode.indexOf('BICYCLE') == -1)
      this.$el.find('.optimizeControl').show();
    else
      this.$el.find('.optimizeControl').hide();

    if (mode.indexOf('BICYCLE') != -1) this.$el.find('.bikeTriangleControl')
      .show();
    else this.$el.find('.bikeTriangleControl').hide();
  },

  toggleSettings: function() {

    if ($('#hidableSettings').is(':visible')) {
      $('#hidableSettings').slideUp('fast', function() {
        $('#itineraries').height($(window).height() - ($('#request').height() +
          $('#messageWell').height() + 80));
      });
      $('#showSettings').show();
      $('#hideSettings').hide();
    } else {
      $('#hidableSettings').slideDown('fast', function() {
        $('#itineraries').height($(window).height() - ($('#request').height() +
          $('#messageWell').height() + 80));
      });
      $('#showSettings').hide();
      $('#hideSettings').show();
    }
  },

  reverse: function(place, error, success) {

    // esri takes lon/lat
    var parts = place.split(',');
    var lonlat = parts[1] + ',' + parts[0];

    $.ajax({
      url: window.OTP_config.esriApi + 'reverseGeocode?location=' +
        encodeURIComponent(lonlat) + '&f=pjson',
      type: 'GET',
      dataType: 'jsonp',
      error: function() {
        error();
      },
      success: function(res) {

        var data = {
          address: res.address.Address,
          city: res.address.City,
          state: res.address.Region,
          latlon: place
        };

        success(data);
      }
    });
  },

  initializeSelectFor: function(term) {
    var $id = '#' + term + 'Place';
    var placeholder = term === 'from' ? 'Start' : 'End';
    var url = window.OTP_config.esriApi + 'findAddressCandidates';
    var view = this;

    return this.$($id).select2({
      placeholder: placeholder + ' Address',
      minimumInputLength: 5,
      allowClear: true,
      selectOnBlur: true,
      createSearchChoice: function(term) {
        if (view.lastResults.length === 0) {
          var text = term + ' (not found)';
          return {
            id: 'not found',
            text: text
          };
        } else {
          console.log('last results', view.lastResults);
        }
      },
      formatResult: function(object, container) {
        return view.geocodeItem(object);
      },
      formatSelection: function(object, container) {
        return view.selectedGeocodeItem({
          text: object.text,
          city: object.city,
          state: object.state,
          id: object.id
        });
      },
      ajax: {
        url: url,
        dataType: 'jsonp',
        quietMillis: 20,
        data: function(term, page) {
          view.lastResults = [];

          var query = {
            countryCode: 'USA',
            f: 'json',
            distance: 20000, // 5km
            singleLine: term,
            outFields: 'City,Region',
            location: window.OTP_config.initLatLng[1] + ',' + window.OTP_config.initLatLng[0], // TODO: Should be from config
            maxLocations: 5
          };

          if (view.options.map) {
            var latlng = view.options.map.getCenter();
            query.location = latlng.lng + ',' + latlng.lat;

            var bounds = view.options.map.getBounds();
            var nw = bounds.getNorthWest();
            var se = bounds.getSouthEast();
            query.distance = haversine(nw.lat, nw.lng, se.lat, se.lng) * 1000;
          }

          return query;
        },
        results: function(res, page) {
          var results = [];
          if (res.candidates) {
            for (var i in res.candidates) {
              var candidate = res.candidates[i];
              var location = candidate.location;

              results.push({
                text: candidate.address.split(',')[0],
                city: candidate.attributes.City,
                state: candidate.attributes.Region,
                id: location.y + ',' + location.x
              });
            }
          }

          view.skipReverseGeocode = true;
          view.lastResults = results;

          if (results.length > 0) {
            view.$($id).select2('data', {
              text: term + ' ' + results[0].text,
              city: results[0].city,
              state: results[0].state,
              id: results[0].id
            });

            view.changeForm();
          }

          return {
            results: results
          };
        }
      }
    });
  },

  reverseDirection: function(e) {
    e.preventDefault();
    this.model.set({
      toPlace: this.model.get('fromPlace'),
      fromPlace: this.model.get('toPlace')
    });
  }
});
