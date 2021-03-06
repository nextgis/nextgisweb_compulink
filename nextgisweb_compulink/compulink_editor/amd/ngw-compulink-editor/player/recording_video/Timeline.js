define([
    'dojo/_base/declare',
    'dojo/_base/lang',
    'dojo/topic',
    'dojo/Deferred',
    '../Timeline',
    './PhotoPointer/PhotoPointer',
    'ngw/openlayers',
    'xstyle/css!./Timeline.css'
], function (declare, lang, topic, Deferred, Timeline, PhotoPointer, openlayers) {
    return declare([Timeline], {
        DELAY_AFTER_LOADED: 3000,
        DELAY_AFTER_PLAY_FINISHED: 3000,
        count_units: null,
        units: null,
        sound: null,
        photo: null,

        // audio should be off for recording video
        initAudioManager: function () {
            var deferred = new Deferred();
            deferred.resolve();
            return deferred;
        },

        initPhotoTimeline: function () {
            this._photoTimeline = new PhotoPointer();
        },

        _bindEvents: function () {
            this._setParameters();

            topic.subscribe('compulink/player/loaded', lang.hitch(this, function () {
                setTimeout(lang.hitch(this, function () {
                    this._setStoppedHandler();
                    this._setPhotoMode();
                    this._setBasemap();
                    this._setMapParams();
                    this._overrideGlobalFunctions();
                }), this.DELAY_AFTER_LOADED);
            }));

            this.inherited(arguments);
        },

        _setStoppedHandler: function () {
            topic.subscribe('compulink/player/stopped', lang.hitch(this, function () {
                setTimeout(lang.hitch(this, function () {
                    this._playerState = 'finished';
                }), this.DELAY_AFTER_PLAY_FINISHED);
            }));
        },

        _setParameters: function () {
            this._handleParameter('count_units');
            this._handleParameter('units');
            this._handleParameter('zoom');
            this._handleParameter('lat_center');
            this._handleParameter('lon_center');
            this._handleParameter('photo');
            this._handleParameter('basemap');

            if (this._handleParameter('DELAY_AFTER_LOADED')) {
                this.DELAY_AFTER_LOADED = parseInt(this.DELAY_AFTER_LOADED, 10);
            }

            if (this._handleParameter('DELAY_AFTER_PLAY_FINISHED')) {
                this.DELAY_AFTER_PLAY_FINISHED = parseInt(this.DELAY_AFTER_PLAY_FINISHED, 10);
            }
        },

        _setOptimalSpeed: function () {
            if (this.units && this.count_units) {
                this._unitsSelector.set('value', this.units);
                this._countUnitSelector.set('value', this.count_units);
                return true;
            } else {
                this.inherited(arguments);
            }
        },

        _setPhotoMode: function () {
            if (this.photo && this.photo === 'true') {
                this._photoTimeline.toggle(true);
            } else {
                this._photoTimeline.toggle(false);
            }
        },

        _setMapParams: function () {
            if (!this.zoom || !this.lat_center || !this.lon_center) { return false; }

            var map = this._featureManager._layer.map;
            map.setCenter(new openlayers.LonLat(this.lon_center, this.lat_center), this.zoom);
        },

        _setBasemap: function () {
            if (!this.basemap) return false;
            topic.publish('/compulink/map/set/baselayer', this.basemap);
        },

        _handleParameter: function (parameterName) {
            if (window.playerParams[parameterName]) {
                this[parameterName] = window.playerParams[parameterName];
                return true;
            }
            return false;
        },

        _playerState: 'ready',
        _overrideGlobalFunctions: function () {
            window.startPlayer = lang.hitch(this, function () {
                if (this._playerState === 'playing') {
                    return false;
                }
                this._playerState = 'playing';
                this.play(this._timeline.getCustomTime(this._barId));
            });

            window.getPlayerState = lang.hitch(this, function () {
                return this._playerState;
            });
        }
    });
});
